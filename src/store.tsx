import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as repo from "./db/repo";
import { wipeAll } from "./db";
import { uid } from "./domain/id";
import { toDateKey } from "./domain/calc";
import type {
  AppState,
  BodyEntry,
  DayMetric,
  FoodItem,
  ID,
  MealEntry,
  MealPlan,
  Profile,
  Workout,
} from "./domain/types";

/**
 * 全局状态。
 *
 * 对外暴露的接口与 Web 版 store.tsx 保持一致（setProfile / addBody /
 * saveWorkout / addMeal ... ），只是把 localStorage 换成了 SQLite，
 * 所以页面代码可以几乎原样复用。
 *
 * 与 Web 版的两点差异：
 * 1. 首帧需要等 SQLite 打开与读表，所以多了 loading 状态；
 * 2. 写入是异步的，采用「乐观更新 + 后台落库」避免界面卡顿。
 */

const DEFAULT_PROFILE: Profile = {
  name: "",
  sex: "male",
  birthYear: new Date().getFullYear() - 28,
  heightCm: 175,
  activity: "moderate",
  goal: "cut",
  weeklyRateKg: -0.4,
  proteinPerKg: 1.8,
};

function emptyState(): AppState {
  return {
    schema: 1,
    profile: DEFAULT_PROFILE,
    body: [],
    metrics: [],
    workouts: [],
    meals: [],
    favorites: [],
    customFoods: [],
    updatedAt: Date.now(),
  };
}

interface Store {
  state: AppState;
  today: string;
  loading: boolean;
  setProfile: (patch: Partial<Profile>) => void;
  addBody: (entry: Omit<BodyEntry, "id">) => void;
  removeBody: (id: ID) => void;
  saveMetric: (entry: Omit<DayMetric, "id">) => void;
  saveWorkout: (workout: Workout) => void;
  removeWorkout: (id: ID) => void;
  addMeal: (entry: Omit<MealEntry, "id" | "createdAt">) => void;
  addMeals: (entries: Omit<MealEntry, "id" | "createdAt">[]) => void;
  removeMeal: (id: ID) => void;
  toggleFavorite: (id: ID) => void;
  addCustomFood: (food: Omit<FoodItem, "id" | "source">) => FoodItem;
  /** 把识别结果里未命中本地库的项一次性写进自定义食物库 */
  addCustomFoods: (foods: Omit<FoodItem, "id" | "source">[]) => FoodItem[];
  importState: (next: AppState) => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => emptyState());
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const profile = await repo.readProfile();
        if (!profile) await repo.writeProfile(DEFAULT_PROFILE);
        const loaded = await repo.readAll();
        if (!mounted.current) return;
        setState((prev) => ({
          ...prev,
          ...loaded,
          profile: loaded.profile?.name !== undefined ? loaded.profile : DEFAULT_PROFILE,
        }));
      } catch {
        // 数据库不可用时退化为纯内存态，界面仍可用，只是不持久
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  // 跨零点自动切换到新的一天
  useEffect(() => {
    const timer = setInterval(() => {
      const now = toDateKey(new Date());
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  /** 乐观更新本地状态，后台异步落库；失败时只记日志，不回滚（本地优先） */
  const mutate = useCallback(
    (fn: (draft: AppState) => AppState, persist?: () => Promise<unknown>) => {
      setState((prev) => fn(structuredClone(prev)));
      if (persist) void persist().catch(() => undefined);
    },
    [],
  );

  const api = useMemo<Store>(
    () => ({
      state,
      today,
      loading,

      setProfile: (patch) =>
        mutate(
          (d) => ({ ...d, profile: { ...d.profile, ...patch } }),
          async () => {
            const next = { ...state.profile, ...patch };
            await repo.writeProfile(next);
          },
        ),

      addBody: (entry) => {
        // 同一天只保留一条，所以复用已有记录的 id：内存态与库内必须一致，
        // 否则删记录时会因为 id 对不上而删不掉
        const existing = state.body.find((b) => b.date === entry.date);
        const created: BodyEntry = { ...entry, id: existing?.id ?? uid() };
        mutate(
          (d) => {
            const rest = d.body.filter((b) => b.date !== entry.date);
            return { ...d, body: [...rest, created] };
          },
          () => repo.upsertBody(created),
        );
      },

      removeBody: (id) =>
        mutate((d) => ({ ...d, body: d.body.filter((b) => b.id !== id) }), () =>
          repo.deleteBody(id),
        ),

      saveMetric: (entry) => {
        const existing = state.metrics.find((m) => m.date === entry.date);
        const created: DayMetric = { ...entry, id: existing?.id ?? uid() };
        mutate(
          (d) => {
            const rest = d.metrics.filter((m) => m.date !== entry.date);
            return { ...d, metrics: [...rest, created] };
          },
          () => repo.upsertMetric(created),
        );
      },

      saveWorkout: (workout) =>
        mutate(
          (d) => {
            const idx = d.workouts.findIndex((w) => w.id === workout.id);
            const workouts = [...d.workouts];
            if (idx >= 0) workouts[idx] = workout;
            else workouts.push(workout);
            return { ...d, workouts };
          },
          () => repo.saveWorkout(workout),
        ),

      removeWorkout: (id) =>
        mutate((d) => ({ ...d, workouts: d.workouts.filter((w) => w.id !== id) }), () =>
          repo.deleteWorkout(id),
        ),

      addMeal: (entry) => {
        const created: MealEntry = { ...entry, id: uid(), createdAt: Date.now() };
        mutate(
          (d) => ({ ...d, meals: [...d.meals, created] }),
          () => repo.addMeal(created),
        );
      },

      addMeals: (entries) => {
        const createdAt = Date.now();
        const created: MealEntry[] = entries.map((e) => ({
          ...e,
          id: uid(),
          createdAt,
        }));
        mutate(
          (d) => ({ ...d, meals: [...d.meals, ...created] }),
          () => repo.addMeals(created),
        );
      },

      removeMeal: (id) =>
        mutate((d) => ({ ...d, meals: d.meals.filter((m) => m.id !== id) }), () =>
          repo.deleteMeal(id),
        ),

      toggleFavorite: (id) => {
        const on = !state.favorites.includes(id);
        mutate(
          (d) => ({
            ...d,
            favorites: on ? [...d.favorites, id] : d.favorites.filter((f) => f !== id),
          }),
          () => repo.setFavorite(id, on),
        );
      },

      addCustomFood: (food) => {
        const created: FoodItem = { ...food, id: `custom:${uid()}`, source: "自定义" };
        mutate(
          (d) => ({ ...d, customFoods: [...d.customFoods, created] }),
          () => repo.insertCustomFood(created),
        );
        return created;
      },

      addCustomFoods: (foods) => {
        const created = foods.map<FoodItem>((f) => ({
          ...f,
          id: `custom:${uid()}`,
          source: "AI 识别",
        }));
        mutate(
          (d) => ({ ...d, customFoods: [...d.customFoods, ...created] }),
          () => Promise.all(created.map((c) => repo.insertCustomFood(c))),
        );
        return created;
      },

      importState: (next) => {
        const merged: AppState = {
          ...emptyState(),
          ...next,
          profile: { ...DEFAULT_PROFILE, ...next.profile },
        };
        setState(merged);
        void repo.replaceAll(merged).catch(() => undefined);
      },

      reset: () => {
        setState(emptyState());
        void (async () => {
          await wipeAll();
          await repo.writeProfile(DEFAULT_PROFILE);
        })().catch(() => undefined);
      },
    }),
    [state, today, loading, mutate],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}

export { uid };
export type { MealPlan };
