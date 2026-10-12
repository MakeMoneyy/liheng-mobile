import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAINING_KCAL,
  averageTrainingKcal,
  isTrainingDay,
  recomputePlan,
  targetsForDay,
} from "./plan";
import type { FoodItem, MealPlan, Targets, Workout } from "./types";

function food(id: string, kcal: number, protein = 10, fat = 5, carb = 20): FoodItem {
  return {
    id,
    name: id,
    category: "测试",
    per100: { kcal, protein, fat, carb, fiber: 1 },
    source: "测试",
  };
}

const LIB = [food("a", 100), food("b", 200), food("c", 50)];

function plan(items: { foodId: string; grams: number }[]): MealPlan {
  return {
    id: "p1",
    date: "2026-10-12",
    targetKcal: 2000,
    isTrainingDay: false,
    meals: [{ slot: "lunch", items, reason: "" }],
    createdAt: 0,
  };
}

describe("recomputePlan", () => {
  it("用本地食物库重算总量", () => {
    // a: 100kcal/100g × 200g = 200；b: 200 × 100g = 200 → 合计 400
    const r = recomputePlan(
      plan([
        { foodId: "a", grams: 200 },
        { foodId: "b", grams: 100 },
      ]),
      LIB,
      { kcal: 400 },
    );
    expect(r.totals.kcal).toBeCloseTo(400, 5);
    expect(r.deviation).toBeCloseTo(0, 5);
    expect(r.dropped).toBe(0);
  });

  it("丢弃不在库里的 foodId，并计数", () => {
    const r = recomputePlan(
      plan([
        { foodId: "a", grams: 100 },
        { foodId: "不存在", grams: 100 },
      ]),
      LIB,
      { kcal: 100 },
    );
    expect(r.dropped).toBe(1);
    expect(r.plan.meals[0].items).toHaveLength(1);
    expect(r.totals.kcal).toBeCloseTo(100, 5);
  });

  it("偏差按目标热量计算", () => {
    const r = recomputePlan(plan([{ foodId: "a", grams: 100 }]), LIB, { kcal: 200 });
    expect(r.deviation).toBeCloseTo(-0.5, 5); // 100 vs 200
  });

  it("克数被限制在 1-2000 之间", () => {
    const r = recomputePlan(
      plan([
        { foodId: "a", grams: 0 },
        { foodId: "b", grams: 99999 },
      ]),
      LIB,
      { kcal: 4000 },
    );
    expect(r.plan.meals[0].items[0].grams).toBe(1);
    expect(r.plan.meals[0].items[1].grams).toBe(2000);
  });

  it("忽略 AI 报的数字，只认本地库", () => {
    // 计划里没有任何营养字段可传，总量只能来自库
    const r = recomputePlan(plan([{ foodId: "c", grams: 100 }]), LIB, { kcal: 50 });
    expect(r.totals.kcal).toBeCloseTo(50, 5);
    expect(r.totals.protein).toBeCloseTo(10, 5);
  });

  it("目标为 0 时偏差不炸（避免除零）", () => {
    const r = recomputePlan(plan([{ foodId: "a", grams: 100 }]), LIB, { kcal: 0 });
    expect(r.deviation).toBe(0);
  });
});

describe("isTrainingDay", () => {
  function workout(date: string): Workout {
    return { id: date, date, title: "训练", startedAt: 0, exercises: [] };
  }

  it("没有任何训练记录时判为休息日", () => {
    expect(isTrainingDay([], "2026-10-12")).toBe(false);
  });

  it("手动覆盖优先于自动判断", () => {
    expect(isTrainingDay([], "2026-10-12", true)).toBe(true);
    expect(isTrainingDay([workout("2026-10-05")], "2026-10-12", false)).toBe(false);
  });

  it("上周同一天训练过 → 判为训练日", () => {
    // 2026-10-12 是周一，2026-10-05 也是周一
    expect(isTrainingDay([workout("2026-10-05")], "2026-10-12")).toBe(true);
  });

  it("连续两周同一天都没练 → 判为休息日", () => {
    expect(isTrainingDay([workout("2026-10-01")], "2026-10-12")).toBe(false);
  });

  it("两周里只练了一次 → 比例 50%，达到阈值", () => {
    const ws = [workout("2026-09-28")]; // 2026-09-28 是周一
    expect(isTrainingDay(ws, "2026-10-12")).toBe(true);
  });
});

describe("targetsForDay", () => {
  const base: Targets = {
    bmr: 1700,
    tdee: 2600,
    kcal: 2200,
    protein: 140,
    fat: 70,
    carb: 240,
    fiber: 31,
    sodiumMg: 2000,
    weeklyRateKg: -0.4,
  };

  it("休息日原样返回", () => {
    expect(targetsForDay(base, false)).toEqual(base);
  });

  it("训练日抬高热量，且蛋白质与脂肪不变", () => {
    const t = targetsForDay(base, true, 300);
    expect(t.kcal).toBe(2500);
    expect(t.protein).toBe(base.protein);
    expect(t.fat).toBe(base.fat);
  });

  it("训练日多出来的热量全部补给碳水", () => {
    const t = targetsForDay(base, true, 300);
    // 2500 - 140*4 - 70*9 = 2500 - 560 - 630 = 1310 → /4 = 327.5 → 328
    expect(t.carb).toBe(328);
    // 宏量换算回热量应落在目标附近（取整误差 1 kcal 以内）
    expect(Math.abs(t.protein * 4 + t.fat * 9 + t.carb * 4 - t.kcal)).toBeLessThanOrEqual(2);
  });

  it("训练消耗为 0 或负数时不改动目标", () => {
    expect(targetsForDay(base, true, 0).kcal).toBe(base.kcal);
    expect(targetsForDay(base, true, -50).kcal).toBe(base.kcal);
  });

  it("不传训练消耗时用兜底值", () => {
    expect(targetsForDay(base, true).kcal).toBe(base.kcal + DEFAULT_TRAINING_KCAL);
  });
});

describe("averageTrainingKcal", () => {
  function workout(date: string, kcalOverride?: number): Workout {
    return {
      id: date,
      date,
      title: "训练",
      startedAt: 0,
      exercises: [],
      kcalOverride,
    };
  }

  it("没有训练记录时返回兜底值", () => {
    expect(averageTrainingKcal([], "2026-10-12", 70)).toBe(DEFAULT_TRAINING_KCAL);
  });

  it("按训练日的平均消耗计算，同一天多次训练先合并", () => {
    const ws = [workout("2026-10-05", 200), workout("2026-10-07", 400), workout("2026-10-07", 200)];
    // 两天：200 与 600 → 平均 400
    expect(averageTrainingKcal(ws, "2026-10-12", 70)).toBe(400);
  });

  it("忽略窗口外的训练记录", () => {
    const ws = [workout("2026-01-01", 999), workout("2026-10-05", 200)];
    expect(averageTrainingKcal(ws, "2026-10-12", 70)).toBe(200);
  });
});
