import { getDb } from "./index";
import { uid } from "../domain/id";
import type {
  AppState,
  BodyEntry,
  DayMetric,
  FoodItem,
  ID,
  MealEntry,
  MealPlan,
  Nutrition,
  Profile,
  Workout,
} from "../domain/types";

/**
 * SQLite <-> domain 类型的读写。
 *
 * 页面层只跟 useStore() 打交道，不直接碰 SQL，所以这里把行结构与
 * domain 类型之间的换算全部收敛在这一层。
 */

type Row = Record<string, string | number | null>;

const n = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const nOpt = (v: unknown): number | undefined =>
  v === null || v === undefined ? undefined : Number(v);
const s = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

/* ------------------------------- profile ------------------------------- */

export async function readProfile(): Promise<Profile | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>("SELECT * FROM profile WHERE id = 1;");
  if (!r) return null;
  return {
    name: s(r.name),
    sex: s(r.sex) as Profile["sex"],
    birthYear: n(r.birth_year),
    heightCm: n(r.height_cm),
    activity: s(r.activity) as Profile["activity"],
    goal: s(r.goal) as Profile["goal"],
    weeklyRateKg: n(r.weekly_rate),
    proteinPerKg: n(r.protein_per_kg),
  };
}

export async function writeProfile(p: Profile): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO profile (id, name, sex, birth_year, height_cm, activity, goal, weekly_rate, protein_per_kg)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, sex = excluded.sex, birth_year = excluded.birth_year,
       height_cm = excluded.height_cm, activity = excluded.activity, goal = excluded.goal,
       weekly_rate = excluded.weekly_rate, protein_per_kg = excluded.protein_per_kg;`,
    [
      p.name,
      p.sex,
      p.birthYear,
      p.heightCm,
      p.activity,
      p.goal,
      p.weeklyRateKg,
      p.proteinPerKg,
    ],
  );
}

/* ------------------------------ body entries ---------------------------- */

export async function readBody(): Promise<BodyEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM body_entries ORDER BY date;");
  return rows.map((r) => ({
    id: s(r.id),
    date: s(r.date),
    weightKg: n(r.weight_kg),
    bodyFatPct: nOpt(r.body_fat_pct),
    waistCm: nOpt(r.waist_cm),
    note: r.note === null ? undefined : s(r.note),
  }));
}

/**
 * 按日期写入身体记录。
 *
 * id 由调用方传入时优先使用：store 是先乐观更新内存、再异步落库的，
 * 如果这里另外生成 id，界面上的 id 就与库里的对不上，
 * 同一次会话内删掉的记录会在下次启动时「复活」。
 */
export async function upsertBody(
  entry: Omit<BodyEntry, "id"> & { id?: ID },
): Promise<BodyEntry> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Row>(
    "SELECT id FROM body_entries WHERE date = ?;",
    [entry.date],
  );
  const id = entry.id ?? (existing ? s(existing.id) : uid());
  await db.runAsync(
    `INSERT INTO body_entries (id, date, weight_kg, body_fat_pct, waist_cm, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct,
       waist_cm = excluded.waist_cm, note = excluded.note;`,
    [
      id,
      entry.date,
      entry.weightKg,
      entry.bodyFatPct ?? null,
      entry.waistCm ?? null,
      entry.note ?? null,
    ],
  );
  return { ...entry, id };
}

export async function deleteBody(id: ID): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM body_entries WHERE id = ?;", [id]);
}

/* ------------------------------- metrics -------------------------------- */

export async function readMetrics(): Promise<DayMetric[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM day_metrics ORDER BY date;");
  return rows.map((r) => ({
    id: s(r.id),
    date: s(r.date),
    sleepHours: nOpt(r.sleep_hours),
    steps: nOpt(r.steps),
    restingHr: nOpt(r.resting_hr),
    systolic: nOpt(r.systolic),
    diastolic: nOpt(r.diastolic),
    waterMl: nOpt(r.water_ml),
  }));
}

/** 同 upsertBody：id 由调用方传入时优先使用，保证内存态与库内一致 */
export async function upsertMetric(
  entry: Omit<DayMetric, "id"> & { id?: ID },
): Promise<DayMetric> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Row>(
    "SELECT id FROM day_metrics WHERE date = ?;",
    [entry.date],
  );
  const id = entry.id ?? (existing ? s(existing.id) : uid());
  await db.runAsync(
    `INSERT INTO day_metrics (id, date, sleep_hours, steps, resting_hr, systolic, diastolic, water_ml)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       sleep_hours = excluded.sleep_hours, steps = excluded.steps,
       resting_hr = excluded.resting_hr, systolic = excluded.systolic,
       diastolic = excluded.diastolic, water_ml = excluded.water_ml;`,
    [
      id,
      entry.date,
      entry.sleepHours ?? null,
      entry.steps ?? null,
      entry.restingHr ?? null,
      entry.systolic ?? null,
      entry.diastolic ?? null,
      entry.waterMl ?? null,
    ],
  );
  return { ...entry, id };
}

/* ------------------------------- workouts ------------------------------- */

export async function readWorkouts(): Promise<Workout[]> {
  const db = await getDb();
  const workouts = await db.getAllAsync<Row>(
    "SELECT * FROM workouts ORDER BY date, started_at;",
  );
  if (workouts.length === 0) return [];

  const exRows = await db.getAllAsync<Row>(
    "SELECT * FROM workout_exercises ORDER BY workout_id, idx;",
  );
  const setRows = await db.getAllAsync<Row>(
    "SELECT * FROM workout_sets ORDER BY we_id, idx;",
  );

  const setsByExercise = new Map<string, Workout["exercises"][number]["sets"]>();
  for (const r of setRows) {
    const key = s(r.we_id);
    const list = setsByExercise.get(key) ?? [];
    list.push({
      reps: n(r.reps),
      weightKg: n(r.weight_kg),
      rpe: nOpt(r.rpe),
      done: n(r.done) === 1,
    });
    setsByExercise.set(key, list);
  }

  const exercisesByWorkout = new Map<string, Workout["exercises"]>();
  for (const r of exRows) {
    const wid = s(r.workout_id);
    const list = exercisesByWorkout.get(wid) ?? [];
    list.push({
      id: s(r.id),
      exerciseId: s(r.exercise_id),
      sets: setsByExercise.get(s(r.id)) ?? [],
      note: r.note === null ? undefined : s(r.note),
    });
    exercisesByWorkout.set(wid, list);
  }

  return workouts.map((r) => ({
    id: s(r.id),
    date: s(r.date),
    title: s(r.title),
    startedAt: n(r.started_at),
    endedAt: nOpt(r.ended_at),
    kcalOverride: nOpt(r.kcal_override),
    note: r.note === null ? undefined : s(r.note),
    exercises: exercisesByWorkout.get(s(r.id)) ?? [],
  }));
}

/** 整体替换一条训练：先删子表再重写，避免增量 diff 的复杂度 */
export async function saveWorkout(workout: Workout): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workouts (id, date, title, started_at, ended_at, kcal_override, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         date = excluded.date, title = excluded.title, started_at = excluded.started_at,
         ended_at = excluded.ended_at, kcal_override = excluded.kcal_override, note = excluded.note;`,
      [
        workout.id,
        workout.date,
        workout.title,
        workout.startedAt,
        workout.endedAt ?? null,
        workout.kcalOverride ?? null,
        workout.note ?? null,
      ],
    );
    await db.runAsync("DELETE FROM workout_exercises WHERE workout_id = ?;", [workout.id]);
    for (const [i, ex] of workout.exercises.entries()) {
      await db.runAsync(
        "INSERT INTO workout_exercises (id, workout_id, idx, exercise_id, note) VALUES (?, ?, ?, ?, ?);",
        [ex.id, workout.id, i, ex.exerciseId, ex.note ?? null],
      );
      for (const [j, set] of ex.sets.entries()) {
        await db.runAsync(
          "INSERT INTO workout_sets (id, we_id, idx, reps, weight_kg, rpe, done) VALUES (?, ?, ?, ?, ?, ?, ?);",
          [`${ex.id}:${j}`, ex.id, j, set.reps, set.weightKg, set.rpe ?? null, set.done ? 1 : 0],
        );
      }
    }
  });
}

export async function deleteWorkout(id: ID): Promise<void> {
  const db = await getDb();
  // workout_sets 通过 workout_exercises 级联删除（foreign_keys = ON）
  await db.runAsync("DELETE FROM workout_exercises WHERE workout_id = ?;", [id]);
  await db.runAsync("DELETE FROM workouts WHERE id = ?;", [id]);
}

/* -------------------------------- meals --------------------------------- */

function nutritionFromRow(r: Row): Nutrition {
  return {
    kcal: n(r.kcal_100),
    protein: n(r.protein_100),
    fat: n(r.fat_100),
    carb: n(r.carb_100),
    fiber: nOpt(r.fiber_100),
    sodiumMg: nOpt(r.sodium_100),
  };
}

export async function readMeals(): Promise<MealEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM meals ORDER BY date, created_at;",
  );
  return rows.map((r) => ({
    id: s(r.id),
    date: s(r.date),
    slot: s(r.slot) as MealEntry["slot"],
    foodId: r.food_id === null ? undefined : s(r.food_id),
    name: s(r.name),
    grams: n(r.grams),
    per100: nutritionFromRow(r),
    createdAt: n(r.created_at),
  }));
}

/** 同 upsertBody：id 由调用方传入时优先使用，保证内存态与库内一致 */
export async function addMeal(
  entry: Omit<MealEntry, "id" | "createdAt"> & { id?: ID },
): Promise<MealEntry> {
  const db = await getDb();
  const id = entry.id ?? uid();
  const createdAt = Date.now();
  const p = entry.per100;
  await db.runAsync(
    `INSERT INTO meals (id, date, slot, food_id, name, grams,
       kcal_100, protein_100, fat_100, carb_100, fiber_100, sodium_100, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      entry.date,
      entry.slot,
      entry.foodId ?? null,
      entry.name,
      entry.grams,
      p.kcal,
      p.protein,
      p.fat,
      p.carb,
      p.fiber ?? null,
      p.sodiumMg ?? null,
      createdAt,
    ],
  );
  return { ...entry, id, createdAt };
}

/** 批量写入（配餐「按此记录」用），单事务保证要么全成要么全不成 */
export async function addMeals(
  entries: (Omit<MealEntry, "id" | "createdAt"> & { id?: ID })[],
): Promise<number> {
  const db = await getDb();
  const createdAt = Date.now();
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const p = entry.per100;
      await db.runAsync(
        `INSERT INTO meals (id, date, slot, food_id, name, grams,
           kcal_100, protein_100, fat_100, carb_100, fiber_100, sodium_100, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          entry.id ?? uid(),
          entry.date,
          entry.slot,
          entry.foodId ?? null,
          entry.name,
          entry.grams,
          p.kcal,
          p.protein,
          p.fat,
          p.carb,
          p.fiber ?? null,
          p.sodiumMg ?? null,
          createdAt,
        ],
      );
    }
  });
  return entries.length;
}

export async function deleteMeal(id: ID): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM meals WHERE id = ?;", [id]);
}

/* ----------------------------- custom foods ----------------------------- */

export async function readCustomFoods(): Promise<FoodItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM custom_foods ORDER BY created_at;",
  );
  return rows.map((r) => ({
    id: s(r.id),
    name: s(r.name),
    alias: r.alias ? (JSON.parse(s(r.alias)) as string[]) : undefined,
    category: s(r.category),
    per100: nutritionFromRow(r),
    servingG: nOpt(r.serving_g),
    servingLabel: r.serving_label === null ? undefined : s(r.serving_label),
    source: s(r.source),
  }));
}

/**
 * 写入自定义食物。
 *
 * id 由调用方（store）同步生成后传进来，而不是在这里现生成 —— 这样
 * 界面上引用了这个 id 的饮食记录不会指向一个稍后又被替换掉的值。
 */
export async function insertCustomFood(created: FoodItem): Promise<void> {
  const db = await getDb();
  const p = created.per100;
  await db.runAsync(
    `INSERT INTO custom_foods (id, name, alias, category, kcal_100, protein_100, fat_100,
       carb_100, fiber_100, sodium_100, serving_g, serving_label, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      created.id,
      created.name,
      created.alias ? JSON.stringify(created.alias) : null,
      created.category,
      p.kcal,
      p.protein,
      p.fat,
      p.carb,
      p.fiber ?? null,
      p.sodiumMg ?? null,
      created.servingG ?? null,
      created.servingLabel ?? null,
      created.source,
      Date.now(),
    ],
  );
}

export async function deleteCustomFood(id: ID): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM custom_foods WHERE id = ?;", [id]);
}

/* ------------------------------ favorites ------------------------------- */

export async function readFavorites(): Promise<ID[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT food_id FROM favorites ORDER BY created_at;",
  );
  return rows.map((r) => s(r.food_id));
}

export async function setFavorite(foodId: ID, on: boolean): Promise<void> {
  const db = await getDb();
  if (on) {
    await db.runAsync(
      "INSERT INTO favorites (food_id, created_at) VALUES (?, ?) ON CONFLICT(food_id) DO NOTHING;",
      [foodId, Date.now()],
    );
  } else {
    await db.runAsync("DELETE FROM favorites WHERE food_id = ?;", [foodId]);
  }
}

/* ------------------------------ meal plans ------------------------------ */

export async function readPlan(date: string): Promise<MealPlan | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>("SELECT * FROM meal_plans WHERE date = ?;", [date]);
  if (!r) return null;
  try {
    return JSON.parse(s(r.payload)) as MealPlan;
  } catch {
    return null;
  }
}

export async function savePlan(plan: MealPlan): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO meal_plans (id, date, target_kcal, is_training, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       id = excluded.id, target_kcal = excluded.target_kcal,
       is_training = excluded.is_training, payload = excluded.payload,
       created_at = excluded.created_at;`,
    [
      plan.id,
      plan.date,
      plan.targetKcal,
      plan.isTrainingDay ? 1 : 0,
      JSON.stringify(plan),
      plan.createdAt,
    ],
  );
}

/* ------------------------------- settings ------------------------------- */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>("SELECT value FROM settings WHERE key = ?;", [key]);
  return r ? s(r.value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}

/* --------------------------- 一次性全量读取 ----------------------------- */

export async function readAll(): Promise<Omit<AppState, "schema" | "updatedAt">> {
  const [profile, body, metrics, workouts, meals, customFoods, favorites] = await Promise.all([
    readProfile(),
    readBody(),
    readMetrics(),
    readWorkouts(),
    readMeals(),
    readCustomFoods(),
    readFavorites(),
  ]);
  return {
    profile: profile ?? ({} as Profile),
    body,
    metrics,
    workouts,
    meals,
    customFoods,
    favorites,
  };
}

/** 备份导入：整体替换所有表 */
export async function replaceAll(state: AppState): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of [
      "workout_sets",
      "workout_exercises",
      "workouts",
      "meals",
      "body_entries",
      "day_metrics",
      "custom_foods",
      "favorites",
      "meal_plans",
    ]) {
      await db.execAsync(`DELETE FROM ${t};`);
    }
  });
  await writeProfile(state.profile);
  for (const b of state.body) await upsertBody(b);
  for (const m of state.metrics) await upsertMetric(m);
  for (const w of state.workouts) await saveWorkout(w);
  if (state.meals.length > 0) await addMeals(state.meals);
  for (const f of state.customFoods) {
    // 直接写表：导入的自定义食物 id 必须原样保留，
    // 因为备份里的 meals.foodId 指向的就是这些 id。
    await insertCustomFood(f);
  }
  for (const id of state.favorites) await setFavorite(id, true);
}
