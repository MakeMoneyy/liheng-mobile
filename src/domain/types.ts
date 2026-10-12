export type ID = string;

export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extreme";
export type Goal = "cut" | "maintain" | "bulk";
export type Sex = "male" | "female";

export interface Profile {
  name: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activity: ActivityLevel;
  goal: Goal;
  /** 期望每周体重变化（kg），减脂为负、增肌为正 */
  weeklyRateKg: number;
  /** 每日蛋白质目标（g/kg 体重） */
  proteinPerKg: number;
}

export interface BodyEntry {
  id: ID;
  date: string; // YYYY-MM-DD
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;
  note?: string;
}

/** 日常健康指标：睡眠 / 步数 / 静息心率 / 血压 / 饮水，一天一条 */
export interface DayMetric {
  id: ID;
  date: string;
  sleepHours?: number;
  steps?: number;
  restingHr?: number;
  systolic?: number;
  diastolic?: number;
  waterMl?: number;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  fiber?: number;
  sodiumMg?: number;
}

export type ExerciseType = "strength" | "cardio" | "mobility";

export interface Exercise {
  id: ID;
  name: string;
  nameEn: string;
  /** 主要肌群，中文 */
  muscle: string;
  equipment: string;
  level: "beginner" | "intermediate" | "expert";
  type: ExerciseType;
  /** 代谢当量，用于估算运动消耗 */
  met: number;
  /** 是否使用额外负重 */
  loadable: boolean;
}

export interface SetEntry {
  reps: number;
  weightKg: number;
  rpe?: number;
  done: boolean;
}

export interface WorkoutExercise {
  id: ID;
  exerciseId: ID;
  sets: SetEntry[];
  note?: string;
}

export interface Workout {
  id: ID;
  date: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  exercises: WorkoutExercise[];
  note?: string;
  /** 手动覆盖的运动消耗（kcal），不填则由组数/时长估算 */
  kcalOverride?: number;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealEntry {
  id: ID;
  date: string;
  slot: MealSlot;
  foodId?: ID;
  name: string;
  grams: number;
  per100: Nutrition;
  createdAt: number;
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  fiber: number;
  sodiumMg: number;
  /** 目标体重区间说明用的每周变化 */
  weeklyRateKg: number;
}

export interface AppState {
  schema: number;
  profile: Profile;
  body: BodyEntry[];
  metrics: DayMetric[];
  workouts: Workout[];
  meals: MealEntry[];
  favorites: ID[];
  /** 常用食物自建条目 */
  customFoods: FoodItem[];
  updatedAt: number;
}

export interface FoodItem {
  id: ID;
  name: string;
  alias?: string[];
  category: string;
  /** 每 100 克可食部营养 */
  per100: Nutrition;
  /** 常用份量克数 */
  servingG?: number;
  servingLabel?: string;
  source: string;
}

/* ------------------------------------------------------------------ *
 * 以下为手机版新增：AI 配置、拍照识别、每日配餐
 * ------------------------------------------------------------------ */

/** AI 供应商配置。key 不在这里，单独存 expo-secure-store。 */
export interface AiConfig {
  baseUrl: string;
  visionModel: string;
  textModel: string;
}

/** 拍照识别出的单个食物项 */
export interface RecognizedItem {
  name: string;
  grams: number;
  /** 最终采用的每 100g 营养：命中本地库时为本地权威值，否则为 AI 估算值 */
  per100: Nutrition;
  /** AI 自评置信度 0-1，仅用于界面提示 */
  confidence: number;
  /** 命中本地食物库时的 id */
  matchedFoodId?: ID;
  /** 命中库时的食物名，用于在确认页展示「已匹配：xxx」 */
  matchedName?: string;
  /** 未命中本地库，确认后需写入自定义食物 */
  isNew: boolean;
}

export interface RecognizedMeal {
  items: RecognizedItem[];
  /** AI 给的整餐说明，例如「油量按家常炒制估算」 */
  note?: string;
}

/** 配餐里的一个食物项。只有 foodId 与克数，营养一律本地算。 */
export interface PlanItem {
  foodId: ID;
  grams: number;
}

export interface PlanMeal {
  slot: MealSlot;
  items: PlanItem[];
  /** 为什么这样配，例如「训练后 30-60 分钟补充乳糖蛋白」 */
  reason: string;
}

export interface MealPlan {
  id: ID;
  date: string;
  targetKcal: number;
  isTrainingDay: boolean;
  meals: PlanMeal[];
  tip?: string;
  createdAt: number;
}
