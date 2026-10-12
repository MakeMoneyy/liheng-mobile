import { parseJsonResponse } from "./parse";

/**
 * OpenAI 兼容的对话接口客户端。
 *
 * 默认接智谱 GLM（https://open.bigmodel.cn/api/paas/v4），
 * 视觉 glm-4.6v-flash / 文本 glm-4.7-flash 均为免费模型。
 * baseUrl 与模型名可在「我的 → AI 设置」里改成任意 OpenAI 兼容服务，
 * 所以这里不写死任何供应商逻辑。
 */

export const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const DEFAULT_VISION_MODEL = "glm-4.6v-flash";
export const DEFAULT_TEXT_MODEL = "glm-4.7-flash";
export const DEFAULT_TIMEOUT_MS = 45_000;

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
  /** 退避重试次数，默认 1 次 */
  retries?: number;
  signal?: AbortSignal;
}

export type AiErrorKind =
  | "no-key"
  | "unauthorized"
  | "rate-limit"
  | "timeout"
  | "network"
  | "server"
  | "aborted";

export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

const RETRYABLE: ReadonlySet<string> = new Set(["rate-limit", "server", "network"]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把 HTTP 状态翻译成中文提示与可分类的错误 */
function mapStatus(status: number, body: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError(
      "unauthorized",
      "API Key 无效或没有权限，请在「我的 → AI 设置」里检查。",
    );
  }
  if (status === 429) {
    return new AiError("rate-limit", "请求过于频繁，触发了限流，稍后重试。");
  }
  if (status >= 500) {
    return new AiError("server", `AI 服务暂时不可用（HTTP ${status}），稍后重试。`);
  }
  const detail = body.slice(0, 160).trim();
  return new AiError("server", `AI 请求失败（HTTP ${status}）${detail ? `：${detail}` : ""}`);
}

async function postOnce(opts: ChatOptions): Promise<string> {
  const base = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 外部取消也要能中断请求
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw mapStatus(res.status, body);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new AiError("server", "AI 返回了空内容，请重试。");
    return content;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (opts.signal?.aborted) throw new AiError("aborted", "已取消。");
    if (e instanceof Error && e.name === "AbortError") {
      throw new AiError(
        "timeout",
        `AI 响应超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请重试。`,
      );
    }
    throw new AiError("network", "网络连接失败，请检查网络后重试。");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** 发一次对话请求，返回模型输出的原始文本 */
export async function chat(opts: ChatOptions): Promise<string> {
  if (!opts.apiKey?.trim()) {
    throw new AiError("no-key", "还没有配置 API Key，请到「我的 → AI 设置」里填写。");
  }

  const retries = opts.retries ?? 1;
  let last: AiError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await postOnce(opts);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("network", "网络连接失败。");
      last = err;
      // 只在可重试的错误上退避，且外部已取消时不再重试
      if (attempt >= retries || !RETRYABLE.has(err.kind) || opts.signal?.aborted) throw err;
      await sleep(700 * (attempt + 1));
    }
  }
  throw last ?? new AiError("network", "网络连接失败。");
}

/** 发一次请求并解析成 JSON 对象 */
export async function chatJSON(opts: ChatOptions): Promise<Record<string, unknown>> {
  const raw = await chat(opts);
  const parsed = parseJsonResponse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AiError("server", "AI 返回的结构不符合预期，请重试。");
  }
  return parsed as Record<string, unknown>;
}

/** 把错误统一转成可以直接显示给用户的一句话 */
export function describeAiError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Error) return e.message;
  return "未知错误";
}
