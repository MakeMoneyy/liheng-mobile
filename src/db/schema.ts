/**
 * SQLite 表结构。
 *
 * 只存**用户产生的数据**。静态目录（162 条种子食物、876 条动作）继续以
 * TS 模块打包，不进库：省掉首启播种，查询也更快。
 *
 * meals 在写入时反规范化存下 per100，保证历史记录不会因为食物库更新而漂移。
 */

export const SCHEMA_VERSION = 1;

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS profile (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    name         TEXT    NOT NULL DEFAULT '',
    sex          TEXT    NOT NULL DEFAULT 'male',
    birth_year   INTEGER NOT NULL,
    height_cm    REAL    NOT NULL,
    activity     TEXT    NOT NULL,
    goal         TEXT    NOT NULL,
    weekly_rate  REAL    NOT NULL,
    protein_per_kg REAL  NOT NULL
  );

  CREATE TABLE IF NOT EXISTS body_entries (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL UNIQUE,
    weight_kg    REAL NOT NULL,
    body_fat_pct REAL,
    waist_cm     REAL,
    note         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_body_date ON body_entries(date);

  CREATE TABLE IF NOT EXISTS day_metrics (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL UNIQUE,
    sleep_hours REAL,
    steps      INTEGER,
    resting_hr INTEGER,
    systolic   INTEGER,
    diastolic  INTEGER,
    water_ml   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_date ON day_metrics(date);

  CREATE TABLE IF NOT EXISTS workouts (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    title         TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    kcal_override REAL,
    note          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

  CREATE TABLE IF NOT EXISTS workout_exercises (
    id          TEXT PRIMARY KEY,
    workout_id  TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    exercise_id TEXT NOT NULL,
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_we_workout ON workout_exercises(workout_id);

  CREATE TABLE IF NOT EXISTS workout_sets (
    id            TEXT PRIMARY KEY,
    we_id         TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    idx           INTEGER NOT NULL,
    reps          INTEGER NOT NULL,
    weight_kg     REAL NOT NULL,
    rpe           REAL,
    done          INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sets_we ON workout_sets(we_id);

  CREATE TABLE IF NOT EXISTS meals (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    slot       TEXT NOT NULL,
    food_id    TEXT,
    name       TEXT NOT NULL,
    grams      REAL NOT NULL,
    kcal_100   REAL NOT NULL,
    protein_100 REAL NOT NULL,
    fat_100    REAL NOT NULL,
    carb_100   REAL NOT NULL,
    fiber_100  REAL,
    sodium_100 REAL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
  CREATE INDEX IF NOT EXISTS idx_meals_food ON meals(food_id);

  CREATE TABLE IF NOT EXISTS custom_foods (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    alias         TEXT,
    category      TEXT NOT NULL,
    kcal_100      REAL NOT NULL,
    protein_100   REAL NOT NULL,
    fat_100       REAL NOT NULL,
    carb_100      REAL NOT NULL,
    fiber_100     REAL,
    sodium_100    REAL,
    serving_g     REAL,
    serving_label TEXT,
    source        TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_custom_foods_name ON custom_foods(name);

  CREATE TABLE IF NOT EXISTS favorites (
    food_id    TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_plans (
    id             TEXT PRIMARY KEY,
    date           TEXT NOT NULL UNIQUE,
    target_kcal    REAL NOT NULL,
    is_training    INTEGER NOT NULL,
    payload        TEXT NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_plans_date ON meal_plans(date);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
