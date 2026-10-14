#!/usr/bin/env node
/**
 * 练衡 · OpenAI 兼容 mock 服务（零依赖，只用 Node 内置模块）
 *
 * 用途：在**不申请 API Key、不花一分钱**的前提下，把 App 的 AI 全链路
 * （请求构造 → HTTP → JSON 解析 → 本地食物库匹配 → 本地重算）跑通，
 * 并且能按需注入各种故障，验证容错分支。
 *
 * 启动：
 *     node tools/ai-mock/server.js
 * 在 App 的「我的 → AI 设置」里把 baseUrl 指向 http://10.0.2.2:8787/v1
 * （10.0.2.2 是安卓模拟器眼中的宿主机），Key 随便填个非空字符串。
 *
 * 故障注入（用环境变量启动）：
 *     MOCK_FAIL=401        永远返回 401（验证 Key 无效提示）
 *     MOCK_FAIL=429-once   第一次 429、之后正常（验证退避重试）
 *     MOCK_FAIL=500        永远返回 500（验证服务端错误提示）
 *     MOCK_FAIL=timeout    收到请求就不响应（验证 45s 超时）
 *     MOCK_BAD_JSON=1      返回一段非 JSON 文本（验证解析容错）
 *     MOCK_BAD_FOODID=1    配餐里混入不存在的 foodId（验证本地丢弃）
 *     MOCK_DELAY_MS=3000   每个请求延迟 N 毫秒（验证加载态）
 *     MOCK_PORT=8787       端口，默认 8787
 */

"use strict";

const http = require("node:http");

const PORT = Number(process.env.MOCK_PORT || 8787);
const HOST = process.env.MOCK_HOST || "0.0.0.0";
const FAIL = (process.env.MOCK_FAIL || "").toLowerCase();
const BAD_JSON = process.env.MOCK_BAD_JSON === "1";
const BAD_FOODID = process.env.MOCK_BAD_FOODID === "1";
const DELAY_MS = Number(process.env.MOCK_DELAY_MS || 0);

/** 429-once 用：记一下是否已经放过一次限流 */
let rateLimitUsed = false;
/** 收到的 /chat/completions 次数，用来验证客户端到底重试了几次 */
const stats = { requests: 0, rateLimited: 0, rejected: 0 };

const SLOT_SPLIT = [
  { slot: "breakfast", ratio: 0.25, reason: "早餐占全天约四分之一，主食 + 蛋奶先垫住蛋白。" },
  { slot: "lunch", ratio: 0.35, reason: "午餐是全天最大的一餐，碳水和蛋白都给足。" },
  { slot: "dinner", ratio: 0.3, reason: "晚餐碳水收一点，蔬菜和蛋白补齐。" },
  { slot: "snack", ratio: 0.1, reason: "加餐留给训练前后的血糖，量不用大。" },
];

/** 模拟一次「拍照识别」的结果：前三个能命中本地食物库，第四个是有意留下的新食物 */
const VISION_ITEMS = [
  { name: "白米饭", grams: 200, kcal: 116, protein: 2.6, fat: 0.3, carb: 25.9, fiber: 0.3, confidence: 0.92 },
  { name: "红烧肉", grams: 120, kcal: 472, protein: 9.5, fat: 45, carb: 6, fiber: 0.3, confidence: 0.81 },
  { name: "西兰花", grams: 150, kcal: 36, protein: 4.1, fat: 0.6, carb: 4.3, fiber: 1.6, confidence: 0.88 },
  // 本地库里没有「烹饪用油」，用来验证「未命中 → 保留 AI 数值 + 标记新建」那条路。
  { name: "烹饪用油", grams: 12, kcal: 899, protein: 0, fat: 99.9, carb: 0, confidence: 0.55 },
];

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

function sendJSON(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

function openAiError(status, message, code) {
  return {
    error: {
      message,
      type: status === 401 ? "invalid_request_error" : "server_error",
      code: code || String(status),
    },
  };
}

/** 把纯文本塞进标准的 chat.completion 外壳，content 仍是 JSON 字符串 */
function completion(model, content) {
  return {
    id: `chatcmpl-mock-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/** 把 messages 拍平成一整段文本，方便做关键词判断 */
function flattenPrompt(messages) {
  const parts = [];
  for (const m of messages || []) {
    if (typeof m?.content === "string") {
      parts.push(m.content);
    } else if (Array.isArray(m?.content)) {
      for (const p of m.content) {
        if (p?.type === "text" && typeof p.text === "string") parts.push(p.text);
        if (p?.type === "image_url") parts.push("<image_url>");
      }
    }
  }
  return parts.join("\n");
}

function hasImage(messages) {
  return (messages || []).some(
    (m) => Array.isArray(m?.content) && m.content.some((p) => p?.type === "image_url"),
  );
}

/** 从配餐 prompt 里解析候选食物清单 */
function parseCandidates(prompt) {
  const out = [];
  const re =
    /^- id=(\S+) \| (.+?) \| 每100g: ([\d.]+)kcal 蛋白([\d.]+)g 脂肪([\d.]+)g 碳水([\d.]+)g\s*$/gm;
  let m;
  while ((m = re.exec(prompt)) !== null) {
    out.push({
      id: m[1],
      name: m[2],
      kcal: Number(m[3]),
      protein: Number(m[4]),
      fat: Number(m[5]),
      carb: Number(m[6]),
    });
  }
  return out;
}

function pick(list, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = score(f);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return best;
}

/** 克数 = 这一份要贡献的热量 ÷ 每克热量，取 5g 的整数倍 */
function gramsFor(kcal, food) {
  const perGram = Math.max(0.1, food.kcal / 100);
  return Math.max(5, Math.min(800, Math.round(kcal / perGram / 5) * 5));
}

/**
 * 生成一份配餐。所有 foodId 都来自 prompt 里的候选清单（除非开了
 * MOCK_BAD_FOODID），克数按目标热量摊到四餐上，因此本地重算出来的
 * 总热量天然贴近目标，不会触发「偏差 > 15% 就重问一次」。
 */
function buildPlan(prompt) {
  const kcal = Number((prompt.match(/每日目标：热量 (\d+) kcal/) || [])[1] || 2000);
  const candidates = parseCandidates(prompt);
  const isRetry = prompt.includes("上一版的问题，请修正");
  if (candidates.length === 0) {
    return { meals: [], tip: "候选清单是空的，先去饮食页收藏几个食物。" };
  }

  // 重问一次时给个明显不同的结果，方便看出「换一个」真的生效了。
  const scale = isRetry ? 1.12 : 1;
  const proteinPick = pick(candidates, (f) => f.protein) || candidates[0];
  const carbPick = pick(candidates, (f) => f.carb) || candidates[0];
  const lightPick = pick(candidates, (f) => -f.kcal) || candidates[0];

  const meals = SLOT_SPLIT.map(({ slot, ratio, reason }) => {
    const slotKcal = kcal * ratio * scale;
    const picks = [proteinPick, carbPick, lightPick].filter(
      (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i,
    );
    const share = slotKcal / picks.length;
    const items = picks.map((f) => ({ foodId: f.id, grams: gramsFor(share, f) }));
    return { slot, items, reason };
  });

  if (BAD_FOODID) {
    const lunch = meals.find((m) => m.slot === "lunch");
    lunch?.items.push({ foodId: "seed:not-a-real-food", grams: 100 });
  }

  return {
    meals,
    tip: "按这个吃，蛋白优先；训练后 30-60 分钟内把加餐吃掉。",
  };
}

function buildContent(messages, model) {
  const prompt = flattenPrompt(messages);

  if (prompt.includes("连通性测试")) {
    return JSON.stringify({ ok: true });
  }
  if (hasImage(messages)) {
    return JSON.stringify({
      items: VISION_ITEMS,
      note: "按常见家常做法估算，米饭按一碗 200g 计；油量按一份菜的用量单列。",
    });
  }
  if (prompt.includes("候选食物清单")) {
    return JSON.stringify(buildPlan(prompt));
  }
  // 兜底：任何其它请求都回一段合法 JSON，免得把 App 卡死
  return JSON.stringify({ ok: true, model });
}

function handleCompletions(req, res) {
  let raw = "";
  req.on("data", (c) => {
    raw += c;
  });
  req.on("end", () => {
    stats.requests += 1;
    if (FAIL === "timeout") {
      log("注入 timeout：收到请求但不响应（等 App 自己超时）");
      return; // 故意不 end，让客户端等到超时
    }
    if (FAIL === "429-once" && !rateLimitUsed) {
      rateLimitUsed = true;
      stats.rateLimited += 1;
      log("注入 429：放过一次限流");
      sendJSON(res, 429, openAiError(429, "rate limit exceeded", "rate_limit_exceeded"));
      return;
    }
    if (FAIL === "401" || FAIL === "500") {
      const status = Number(FAIL);
      stats.rejected += 1;
      log(`注入 ${status}`);
      sendJSON(res, status, openAiError(status, "mock injected failure"));
      return;
    }

    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      sendJSON(res, 400, openAiError(400, "请求体不是合法 JSON", "invalid_body"));
      return;
    }

    const auth = req.headers.authorization || "";
    if (!/^Bearer\s+\S/.test(auth)) {
      stats.rejected += 1;
      log("401：缺少 Bearer Key");
      sendJSON(res, 401, openAiError(401, "missing api key", "invalid_api_key"));
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages) {
      sendJSON(res, 400, openAiError(400, "messages 必须是数组", "invalid_body"));
      return;
    }

    const model = body.model || "mock";
    const kind = messages.some((m) => Array.isArray(m?.content))
      ? "vision"
      : body.messages.some((m) => typeof m?.content === "string" && m.content.includes("候选食物清单"))
        ? "plan"
        : "text";
    log(`POST /v1/chat/completions model=${model} kind=${kind} messages=${messages.length}`);

    const respond = () => {
      if (BAD_JSON) {
        log("注入非 JSON 响应");
        sendJSON(res, 200, completion(model, "这张照片我判断不了，麻烦再拍一张清晰些的。"));
        return;
      }
      sendJSON(res, 200, completion(model, buildContent(messages, model)));
    };

    if (DELAY_MS > 0) setTimeout(respond, DELAY_MS);
    else respond();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "");

  if (req.method === "GET" && (path === "/health" || path === "/")) {
    sendJSON(res, 200, { ok: true, mock: true, fail: FAIL || null, stats });
    return;
  }
  if (req.method === "POST" && path.endsWith("/chat/completions")) {
    handleCompletions(req, res);
    return;
  }
  sendJSON(res, 404, openAiError(404, `mock 没有这个路由：${req.method} ${url.pathname}`, "not_found"));
});

server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  if (FAIL) console.log(`故障注入：MOCK_FAIL=${FAIL}`);
  if (BAD_JSON) console.log("故障注入：MOCK_BAD_JSON=1");
  if (BAD_FOODID) console.log("故障注入：MOCK_BAD_FOODID=1");
  if (DELAY_MS) console.log(`延迟：${DELAY_MS}ms`);
  console.log("baseUrl 填 http://10.0.2.2:%d/v1（安卓模拟器）", PORT);
});
