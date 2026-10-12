import * as SQLite from "expo-sqlite";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema";

/**
 * SQLite 连接与迁移。
 *
 * 用 PRAGMA user_version 记录版本号，启动时逐条应用未执行的迁移。
 * 目前只有 v1，但结构已经为后续加表留好位置。
 */

const DB_NAME = "liheng.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const current = row?.user_version ?? 0;

  if (current < SCHEMA_VERSION) {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      const sql = MIGRATIONS[v];
      if (!sql) continue;
      await db.withTransactionAsync(async () => {
        await db.execAsync(sql);
      });
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

/** 清空所有用户数据（保留表结构），用于「重置」 */
export async function wipeAll(): Promise<void> {
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
      "settings",
      "profile",
    ]) {
      await db.execAsync(`DELETE FROM ${t};`);
    }
  });
}

export type { SQLiteDatabase } from "expo-sqlite";
