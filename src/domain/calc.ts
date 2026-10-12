import type { ActivityLevel, BodyEntry, Goal, MealEntry, Nutrition, Profile, Targets, Workout } from "./types";

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extreme: 1.9,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "久坐",
  light: "轻度活动 1-3 天/周",
  moderate: "中等活动 3-5 天/周",
  very: "高强度 6-7 天/周",
  extreme: "运动员 / 体力劳动",
};

export const GOAL_LABEL: Record<Goal, string> = {
  cut: "减脂",
  maintain: "维持",
  bulk: "增肌",
};

export const KCAL_PER_KG_FAT = 7700;

/** Mifflin-St Jeor 基础代谢 */
export function bmr(profile: Profile, weightKg: number, age: number): number {
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * age;
  return Math.round(profile.sex === "male" ? base + 5 : base - 161);
}

export function ageFrom(profile: Profile, today = new Date()): number {
  return Math.max(14, today.getFullYear() - profile.birthYear);
}

export function latestWeight(body: BodyEntry[], fallback = 70): number {
  if (body.length === 0) return fallback;
  return [...body].sort((a, b) => a.date.localeCompare(b.date))[body.length - 1].weightKg;
}

export function computeTargets(profile: Profile, body: BodyEntry[], today = new Date()): Targets {
  const weight = latestWeight(body);
  const age = ageFrom(profile, today);
  const b = bmr(profile, weight, age);
  const tdee = Math.round(b * ACTIVITY_FACTOR[profile.activity]);

  // 每周变化 → 每日热量偏移（7700 kcal ≈ 1 kg 脂肪）
  const dailyDelta = Math.round((profile.weeklyRateKg * KCAL_PER_KG_FAT) / 7);
  let kcal = tdee + dailyDelta;

  // 安全下限，避免出现危险的低热量目标
  const floor = profile.sex === "male" ? 1500 : 1200;
  kcal = Math.max(floor, kcal);

  const protein = Math.round(weight * profile.proteinPerKg);
  const fat = Math.round(Math.max(weight * 0.7, (kcal * 0.2) / 9));
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    bmr: b,
    tdee,
    kcal,
    protein,
    fat,
    carb,
    fiber: Math.round((kcal / 1000) * 14),
    sodiumMg: 2000,
    weeklyRateKg: profile.weeklyRateKg,
  };
}

export function scaleNutrition(per100: Nutrition, grams: number): Nutrition {
  const k = grams / 100;
  return {
    kcal: per100.kcal * k,
    protein: per100.protein * k,
    fat: per100.fat * k,
    carb: per100.carb * k,
    fiber: (per100.fiber ?? 0) * k,
    sodiumMg: (per100.sodiumMg ?? 0) * k,
  };
}

export const EMPTY_NUTRITION: Nutrition = {
  kcal: 0,
  protein: 0,
  fat: 0,
  carb: 0,
  fiber: 0,
  sodiumMg: 0,
};

export function sumNutrition(list: Nutrition[]): Nutrition {
  return list.reduce<Nutrition>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carb: acc.carb + n.carb,
      fiber: (acc.fiber ?? 0) + (n.fiber ?? 0),
      sodiumMg: (acc.sodiumMg ?? 0) + (n.sodiumMg ?? 0),
    }),
    { ...EMPTY_NUTRITION },
  );
}

export function dayMeals(meals: MealEntry[], date: string): MealEntry[] {
  return meals.filter((m) => m.date === date);
}

export function dayTotals(meals: MealEntry[], date: string): Nutrition {
  return sumNutrition(dayMeals(meals, date).map((m) => scaleNutrition(m.per100, m.grams)));
}

/** 训练消耗估算：基于组数（力量）与代谢当量，属于区间估算，非精确测量 */
export function estimateWorkoutKcal(workout: Workout, weightKg: number): number {
  if (workout.kcalOverride && workout.kcalOverride > 0) return Math.round(workout.kcalOverride);
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const durationMin = workout.endedAt
    ? Math.max(10, (workout.endedAt - workout.startedAt) / 60000)
    : Math.max(20, totalSets * 2.5);
  // 力量训练平均 MET ≈ 5.0（中等强度抗阻）
  const met = 5;
  return Math.round((met * 3.5 * weightKg) / 200 * durationMin);
}

export function dayWorkoutKcal(workouts: Workout[], date: string, weightKg: number): number {
  return workouts
    .filter((w) => w.date === date)
    .reduce((n, w) => n + estimateWorkoutKcal(w, weightKg), 0);
}

export function volumeOf(workout: Workout): number {
  return workout.exercises.reduce(
    (total, ex) => total + ex.sets.filter((s) => s.done).reduce((v, s) => v + s.reps * s.weightKg, 0),
    0,
  );
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

export function humanDate(date: string): string {
  const today = toDateKey(new Date());
  if (date === today) return "今天";
  if (date === shiftDate(today, -1)) return "昨天";
  const [, m, d] = date.split("-");
  return `${Number(m)} 月 ${Number(d)} 日`;
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 线性趋势（最小二乘），用于体重周变化速率 */
export function trendPerWeek(points: { date: string; value: number }[]): number | null {
  if (points.length < 3) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const xs = sorted.map((p) => (new Date(p.date).getTime() - t0) / 86400000);
  const ys = sorted.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}
