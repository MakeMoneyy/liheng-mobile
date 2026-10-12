import { chatJSON, type ChatMessage } from "./client";
import { asArray, asNumber, asRecord, asString } from "./parse";
import { scaleNutrition } from "../domain/calc";
import { PLAN_SLOT_LABEL } from "../domain/plan";
import type {
  FoodItem,
  ID,
  MealPlan,
  MealSlot,
  Nutrition,
  PlanMeal,
  Targets,
} from "../domain/types";

/**
 * 每日配餐建议。
 *
 * 关键约束：AI **只能从给定的本地食物库里挑**，并且只返回 foodId + 克数。
 * 所有热量与宏量由本地 scaleNutrition 重算，AI 说的数字一律不用 ——
 * 这样既避免 LLM 算数不准，也避免拍照类 App 系统性低估热量的问题。
 */

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

const SYSTEM_PROMPT = `你是一位中国注册营养师，负责给健身人群排一天的三餐加餐。

硬性约束：
1. 只能从用户提供的「候选食物清单」里选择，禁止编造清单外的食物。
2. 每条食物必须使用清单里给出的 id 字段作为 foodId，克数用整数。
3. 只输出 JSON，不要解释文字或 markdown 代码块。
4. 不要输出任何热量或营养数字，系统会自己计算。

搭配要求：
- 覆盖 breakfast / lunch / dinner / snack 四餐，每餐 2-5 项。
- 优先满足蛋白质目标，再分配碳水和脂肪；训练日碳水适当放在训练前后。
- 每餐给一句 reason，说明这一餐为什么这样配（结合训练安排与目标）。
- tip 给一句全天的执行提示。

JSON 结构：
{
  "meals": [
    { "slot": "breakfast", "items": [ { "foodId": "seed:xxx", "grams": 100 } ], "reason": "..." }
  ],
  "tip": "..."
}`;

export interface PlanOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  /** 目标日期，YYYY-MM-DD */
  date: string;
  targets: Targets;
  isTrainingDay: boolean;
  /** 今天已经吃了多少，用来给 AI 一个「今天还差多少」的上下文 */
  todayTotals?: Pick<Nutrition, "kcal" | "protein" | "fat" | "carb">;
  /** 今天剩余可摄入 */
  remainKcal?: number;
  /** 只能从这里挑 */
  candidates: FoodItem[];
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 上一轮偏差过大时带上的修正说明 */
  correction?: string;
}

function candidateLine(f: FoodItem): string {
  const n = f.per100;
  return `- id=${f.id} | ${f.name} | 每100g: ${Math.round(n.kcal)}kcal 蛋白${n.protein}g 脂肪${n.fat}g 碳水${n.carb}g`;
}

function buildUserPrompt(opts: PlanOptions): string {
  const t = opts.targets;
  const lines: string[] = [];
  lines.push(`目标日期：${opts.date}`);
  lines.push(
    `当天是${opts.isTrainingDay ? "训练日（训练后 30-60 分钟要补蛋白质）" : "休息日（热量可略低，蛋白仍要够）"}。`,
  );
  lines.push(
    `每日目标：热量 ${t.kcal} kcal、蛋白质 ${t.protein} g、脂肪 ${t.fat} g、碳水 ${t.carb} g、膳食纤维 ${t.fiber} g。`,
  );
  if (opts.todayTotals) {
    const d = opts.todayTotals;
    lines.push(
      `今日已摄入：${Math.round(d.kcal)} kcal、蛋白 ${Math.round(d.protein)} g、脂肪 ${Math.round(d.fat)} g、碳水 ${Math.round(d.carb)} g。`,
    );
  }
  if (typeof opts.remainKcal === "number") {
    const tail = opts.remainKcal < 0 ? "（已超出，后面两餐请偏清淡）" : "";
    lines.push(`今日还可摄入约 ${Math.round(opts.remainKcal)} kcal${tail}。`);
  }
  lines.push("");
  lines.push("候选食物清单（只能从这里选）：");
  for (const f of opts.candidates) lines.push(candidateLine(f));
  if (opts.correction) {
    lines.push("");
    lines.push(`上一版的问题，请修正：${opts.correction}`);
  }
  return lines.join("\n");
}

export function buildPlanMessages(opts: PlanOptions): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(opts) },
  ];
}

/** 从 AI 返回里抽出结构化的三餐，不做任何营养计算 */
export function parsePlanDraft(
  json: Record<string, unknown>,
  date: string,
  targetKcal: number,
  isTraining: boolean,
  id: ID,
  createdAt: number,
): MealPlan {
  const rawMeals = asArray(json.meals, "meals");
  const meals: PlanMeal[] = rawMeals.flatMap((raw) => {
    const rec = asRecord(raw, "meal");
    const slot = asString(rec.slot) as MealSlot;
    if (!SLOTS.includes(slot)) return [];
    const items = asArray(rec.items, "items").flatMap((ri) => {
      const r = asRecord(ri, "item");
      const foodId = asString(r.foodId).trim();
      if (!foodId) return [];
      const grams = Math.max(1, Math.min(2000, Math.round(asNumber(r.grams, 100))));
      return [{ foodId, grams }];
    });
    if (items.length === 0) return [];
    return [{ slot, items, reason: asString(rec.reason).trim() }];
  });

  // 按早/午/晚/加餐的固定顺序排，AI 偶尔会打乱
  meals.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));

  return {
    id,
    date,
    targetKcal,
    isTrainingDay: isTraining,
    meals,
    tip: asString(json.tip).trim() || undefined,
    createdAt,
  };
}

export async function requestPlanDraft(
  opts: PlanOptions,
  id: ID,
  createdAt: number,
): Promise<MealPlan> {
  const json = await chatJSON({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    messages: buildPlanMessages(opts),
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
  });
  return parsePlanDraft(json, opts.date, opts.targets.kcal, opts.isTrainingDay, id, createdAt);
}

/** 给「按此记录」用的：把计划摊平成待写入的饮食条目 */
export function planToMealEntries(
  plan: MealPlan,
  library: FoodItem[],
): { slot: MealSlot; foodId: ID; name: string; grams: number; per100: Nutrition }[] {
  const byId = new Map(library.map((f) => [f.id, f]));
  return plan.meals.flatMap((m) =>
    m.items.flatMap((i) => {
      const food = byId.get(i.foodId);
      if (!food) return [];
      return [
        { slot: m.slot, foodId: food.id, name: food.name, grams: i.grams, per100: food.per100 },
      ];
    }),
  );
}

/** 配餐卡片上展示每餐热量时用 */
export function planMealKcal(meal: PlanMeal, library: FoodItem[]): number {
  const byId = new Map(library.map((f) => [f.id, f]));
  return meal.items.reduce((n, i) => {
    const food = byId.get(i.foodId);
    return food ? n + scaleNutrition(food.per100, i.grams).kcal : n;
  }, 0);
}

export { PLAN_SLOT_LABEL };
