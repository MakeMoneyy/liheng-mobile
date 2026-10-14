/**
 * AI 全链路的离线集成测试：真起一个 mock 服务，真发 HTTP，真走解析与本地重算。
 *
 * 为什么要有这层：`client.test.ts` 里的 fetch 是打桩的，只能证明「请求构造
 * 对了」；这个文件把 `recognizeMeal` / `requestPlanDraft` 连到真实的 socket
 * 上，能顺带验证 JSON 解析、本地食物库匹配、非法 foodId 丢弃、退避重试与
 * 超时这几个最容易写错的地方。
 *
 * 通过 `MOCK_*` 环境变量注入故障的分支由 tools/ai-mock/server.js 提供，
 * 见 `outputs/手机调试环境.md` 第五节。零依赖、零花费。
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AiError, chat } from "./client";
import { requestPlanDraft } from "./planner";
import { recognizeMeal } from "./vision";
import { SEED_FOODS } from "../data/foods";
import { matchRecognizedItems } from "../domain/match";
import { recomputePlan } from "../domain/plan";
import type { MealPlan, Targets } from "../domain/types";

const SERVER = resolve(__dirname, "../../tools/ai-mock/server.js");
const hasMock = existsSync(SERVER);

const TARGETS: Targets = {
  bmr: 1700,
  tdee: 2550,
  kcal: 2200,
  protein: 150,
  fat: 70,
  carb: 240,
  fiber: 30,
  sodiumMg: 2000,
  weeklyRateKg: -0.4,
};

/** 起一个 mock，返回 baseUrl 与停掉它的函数 */
async function startMock(
  env: Record<string, string> = {},
): Promise<{ baseUrl: string; stop: () => void }> {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const child: ChildProcess = spawn(process.execPath, [SERVER], {
    env: { ...process.env, MOCK_PORT: String(port), ...env },
    stdio: "ignore",
  });

  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) break;
    } catch {
      // 还没起来
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("mock 服务没起来");
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return { baseUrl, stop: () => child.kill() };
}

async function statOf(baseUrl: string): Promise<{ requests: number }> {
  const res = await fetch(baseUrl.replace(/\/v1$/, "") + "/health");
  const json = (await res.json()) as { stats: { requests: number } };
  return json.stats;
}

describe.skipIf(!hasMock)("AI 链路（对着本地 mock 跑）", () => {
  it("连通性自检能拿到 JSON", async () => {
    const { baseUrl, stop } = await startMock();
    try {
      const raw = await chat({
        apiKey: "mock-key",
        baseUrl,
        model: "glm-4.7-flash",
        messages: [
          { role: "system", content: '只返回 JSON：{"ok": true}' },
          { role: "user", content: "连通性测试" },
        ],
      });
      expect(raw).toContain("ok");
    } finally {
      stop();
    }
  });

  it("拍照识别：识别 → 解析 → 匹配本地库（命中用本地值，未命中标记新建）", async () => {
    const { baseUrl, stop } = await startMock();
    try {
      const meal = await recognizeMeal({
        apiKey: "mock-key",
        baseUrl,
        model: "glm-4.6v-flash",
        dataUrl: "data:image/jpeg;base64,AAAA",
      });
      expect(meal.items.length).toBeGreaterThanOrEqual(3);

      const matched = matchRecognizedItems(meal.items, SEED_FOODS);
      const byName = new Map(matched.map((i) => [i.name, i]));

      const rice = byName.get("白米饭");
      expect(rice?.matchedFoodId).toBeTruthy();
      expect(rice?.isNew).toBe(false);
      // 命中后必须换成**本地**权威值，而不是 AI 给的那份
      const library = SEED_FOODS.find((f) => f.id === rice?.matchedFoodId);
      expect(rice?.per100).toEqual(library?.per100);

      // 本地库里没有「烹饪用油」，应当保留 AI 数值并标记为新建
      const oil = byName.get("烹饪用油");
      expect(oil?.isNew).toBe(true);
      expect(oil?.matchedFoodId).toBeUndefined();
      // 数值就是 mock 返回的那份（食用油 899 kcal/100g），没被本地库覆盖
      expect(oil?.per100.kcal).toBe(899);
    } finally {
      stop();
    }
  });

  it("配餐：AI 只给 foodId 与克数，热量全部本地重算且贴近目标", async () => {
    const { baseUrl, stop } = await startMock();
    try {
      const candidates = SEED_FOODS.slice(0, 40);
      const plan = await requestPlanDraft(
        {
          apiKey: "mock-key",
          baseUrl,
          model: "glm-4.7-flash",
          date: "2026-10-15",
          targets: TARGETS,
          isTrainingDay: true,
          candidates,
        },
        "plan-1",
        Date.now(),
      );

      expect(plan.meals.map((m) => m.slot)).toEqual([
        "breakfast",
        "lunch",
        "dinner",
        "snack",
      ]);

      const byId = new Set(SEED_FOODS.map((f) => f.id));
      for (const m of plan.meals) {
        expect(m.reason.length).toBeGreaterThan(0);
        for (const i of m.items) expect(byId.has(i.foodId)).toBe(true);
      }

      const { totals, deviation, dropped } = recomputePlan(plan, SEED_FOODS, TARGETS);
      expect(dropped).toBe(0);
      expect(totals.kcal).toBeGreaterThan(0);
      expect(Math.abs(deviation)).toBeLessThan(0.15);
    } finally {
      stop();
    }
  });

  it("配餐里混入不存在的 foodId 时，本地直接丢弃并计入 dropped", async () => {
    const { baseUrl, stop } = await startMock({ MOCK_BAD_FOODID: "1" });
    try {
      const plan: MealPlan = await requestPlanDraft(
        {
          apiKey: "mock-key",
          baseUrl,
          model: "glm-4.7-flash",
          date: "2026-10-15",
          targets: TARGETS,
          isTrainingDay: false,
          candidates: SEED_FOODS.slice(0, 40),
        },
        "plan-2",
        Date.now(),
      );
      const { dropped } = recomputePlan(plan, SEED_FOODS, TARGETS);
      expect(dropped).toBe(1);
    } finally {
      stop();
    }
  });

  it("429 只触发一次：客户端退避重试后成功", async () => {
    const { baseUrl, stop } = await startMock({ MOCK_FAIL: "429-once" });
    try {
      const raw = await chat({
        apiKey: "mock-key",
        baseUrl,
        model: "glm-4.7-flash",
        messages: [{ role: "user", content: "连通性测试" }],
      });
      expect(raw).toContain("ok");
      // 第一次被限流 + 重试一次 = 服务端共收到 2 个请求
      expect((await statOf(baseUrl)).requests).toBe(2);
    } finally {
      stop();
    }
  });

  it("401 不重试，直接抛出 unauthorized", async () => {
    const { baseUrl, stop } = await startMock({ MOCK_FAIL: "401" });
    try {
      const err = await chat({
        apiKey: "mock-key",
        baseUrl,
        model: "glm-4.7-flash",
        messages: [{ role: "user", content: "连通性测试" }],
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).kind).toBe("unauthorized");
      // 401 不在可重试集合里，所以只应该打一次
      expect((await statOf(baseUrl)).requests).toBe(1);
    } finally {
      stop();
    }
  });

  it("服务端挂起时由 AbortController 触发超时", async () => {
    const { baseUrl, stop } = await startMock({ MOCK_FAIL: "timeout" });
    try {
      const err = await chat({
        apiKey: "mock-key",
        baseUrl,
        model: "glm-4.7-flash",
        messages: [{ role: "user", content: "连通性测试" }],
        timeoutMs: 1200,
        retries: 0,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).kind).toBe("timeout");
    } finally {
      stop();
    }
  });
});
