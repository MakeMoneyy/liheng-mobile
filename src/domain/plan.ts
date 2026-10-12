import { estimateWorkoutKcal, scaleNutrition, shiftDate } from "./calc";
import type {
  FoodItem,
  MealPlan,
  Nutrition,
  PlanMeal,
  Targets,
  Workout,
} from "./types";

/**
 * 配餐相关纯逻辑。所有热量与宏量都在本地算，AI 返回的数字一律丢弃 ——
 * NIH/NIDDK 2026 的研究显示拍照类 App 会系统性低估热量（平均每餐少
 * 250-345 kcal，脂肪少约 1/3），所以估值不进账本。
 */

/** 训练日启发式：看过去 14 天里同一个星期几的训练比例 */
const LOOKBACK_DAYS = 14;
/** 同一星期几的取样点：上周同一天、上上周同一天 */
const WEEKDAY_OFFSETS = [7, 14];
export const TRAINING_DAY_RATIO = 0.5;

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * 判断某天是否算训练日。
 * 规则：取过去 14 天中同一星期几的日子，训练比例 >= 50% 即为训练日；
 * 没有历史样本时按休息日处理。override 由用户手动指定时优先。
 */
export function isTrainingDay(
  workouts: Workout[],
  date: string,
  override?: boolean,
): boolean {
  if (typeof override === "boolean") return override;
  if (workouts.length === 0) return false;

  const trainedDays = new Set(workouts.map((w) => w.date));
  const sameWeekday: boolean[] = [];
  for (const offset of WEEKDAY_OFFSETS) {
    if (offset > LOOKBACK_DAYS) continue;
    const d = shiftDate(date, -offset);
    if (weekdayOf(d) !== weekdayOf(date)) continue;
    sameWeekday.push(trainedDays.has(d));
  }
  if (sameWeekday.length === 0) return false;
  const trained = sameWeekday.filter(Boolean).length;
  return trained / sameWeekday.length >= TRAINING_DAY_RATIO;
}

export const PLAN_SLOT_LABEL: Record<PlanMeal["slot"], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};

/** 训练日额外消耗的兜底值：没有历史可参考时按约 45 分钟中等强度力量训练估 */
export const DEFAULT_TRAINING_KCAL = 300;

/**
 * 把基础目标换算成「某一天」的目标。
 *
 * 训练日要在 TDEE 基础上加上训练消耗，并把这部分热量补给碳水
 * （训练日糖原消耗大、碳水需求高），蛋白质与脂肪目标不动 ——
 * 蛋白质是按体重定的，不该因为练了而浮动。
 */
export function targetsForDay(
  targets: Targets,
  isTrainingDay: boolean,
  trainingKcal: number = DEFAULT_TRAINING_KCAL,
): Targets {
  if (!isTrainingDay) return targets;
  const extra = Math.max(0, Math.round(trainingKcal));
  if (extra === 0) return targets;

  const kcal = targets.kcal + extra;
  const carb = Math.max(0, Math.round((kcal - targets.protein * 4 - targets.fat * 9) / 4));
  return { ...targets, kcal, carb };
}

/**
 * 从历史训练里推算一次训练的典型消耗。
 * 取最近 14 天内有训练的那些天的平均消耗，没记录时用兜底值。
 */
export function averageTrainingKcal(
  workouts: Workout[],
  date: string,
  weightKg: number,
  lookbackDays = LOOKBACK_DAYS,
): number {
  const from = shiftDate(date, -lookbackDays);
  const perDay = new Map<string, number>();
  for (const w of workouts) {
    if (w.date < from || w.date > date) continue;
    perDay.set(w.date, (perDay.get(w.date) ?? 0) + estimateWorkoutKcal(w, weightKg));
  }
  if (perDay.size === 0) return DEFAULT_TRAINING_KCAL;
  const total = [...perDay.values()].reduce((n, v) => n + v, 0);
  return Math.round(total / perDay.size);
}

export const EMPTY_PLAN_TOTALS: Nutrition = {
  kcal: 0,
  protein: 0,
  fat: 0,
  carb: 0,
  fiber: 0,
  sodiumMg: 0,
};

export interface RecomputedPlan {
  /** 清掉非法 foodId 之后的计划 */
  plan: MealPlan;
  totals: Nutrition;
  /** 与目标热量的相对偏差，正数表示超出 */
  deviation: number;
  /** 被丢弃的条目数，用于提示 AI 返回不合法 */
  dropped: number;
}

/**
 * 用本地食物库重算整份配餐。
 * - 找不到 foodId 的条目直接丢弃（AI 偶尔会编造 id）
 * - 克数限制在 1-2000 之间，避免异常值
 * - 返回的 plan 已剔除非法条目，可直接落库
 */
export function recomputePlan(
  plan: MealPlan,
  library: FoodItem[],
  targets: Pick<Targets, "kcal">,
): RecomputedPlan {
  const byId = new Map(library.map((f) => [f.id, f]));
  let dropped = 0;

  const meals: PlanMeal[] = plan.meals.map((meal) => {
    const items = meal.items.flatMap((item) => {
      const food = byId.get(item.foodId);
      if (!food) {
        dropped++;
        return [];
      }
      const grams = Math.max(1, Math.min(2000, Math.round(item.grams)));
      return [{ foodId: item.foodId, grams }];
    });
    return { ...meal, items };
  });

  const totals = meals
    .flatMap((m) =>
      m.items.map((i) => {
        const food = byId.get(i.foodId)!;
        return scaleNutrition(food.per100, i.grams);
      }),
    )
    .reduce<Nutrition>(
      (acc, n) => ({
        kcal: acc.kcal + n.kcal,
        protein: acc.protein + n.protein,
        fat: acc.fat + n.fat,
        carb: acc.carb + n.carb,
        fiber: (acc.fiber ?? 0) + (n.fiber ?? 0),
        sodiumMg: (acc.sodiumMg ?? 0) + (n.sodiumMg ?? 0),
      }),
      { ...EMPTY_PLAN_TOTALS },
    );

  const deviation = targets.kcal > 0 ? (totals.kcal - targets.kcal) / targets.kcal : 0;
  return { plan: { ...plan, meals }, totals, deviation, dropped };
}

/** 偏差超过这个比例就带修正说明重新问一次 AI */
export const PLAN_RETRY_DEVIATION = 0.15;
