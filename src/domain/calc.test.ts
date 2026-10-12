import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FACTOR,
  bmr,
  computeTargets,
  dayTotals,
  estimateWorkoutKcal,
  latestWeight,
  scaleNutrition,
  shiftDate,
  sumNutrition,
  trendPerWeek,
  volumeOf,
} from "./calc";
import type { BodyEntry, MealEntry, Profile, Workout } from "./types";

const PROFILE: Profile = {
  name: "测试",
  sex: "male",
  birthYear: 1996,
  heightCm: 175,
  activity: "moderate",
  goal: "cut",
  weeklyRateKg: -0.4,
  proteinPerKg: 1.8,
};

const TODAY = new Date(2026, 9, 11); // 2026-10-11

function body(date: string, weightKg: number): BodyEntry {
  return { id: date, date, weightKg };
}

function meal(date: string, slot: MealEntry["slot"], grams: number): MealEntry {
  return {
    id: `${date}-${slot}`,
    date,
    slot,
    name: "测试食物",
    grams,
    per100: { kcal: 100, protein: 10, fat: 2, carb: 12, fiber: 1 },
    createdAt: 0,
  };
}

describe("bmr", () => {
  it("男性用 +5 常数", () => {
    // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 → 1649
    expect(bmr({ ...PROFILE, sex: "male" }, 70, 30)).toBe(1649);
  });

  it("女性用 -161 常数", () => {
    // 700 + 1093.75 - 150 - 161 = 1482.75 → 1483
    expect(bmr({ ...PROFILE, sex: "female" }, 70, 30)).toBe(1483);
  });
});

describe("computeTargets", () => {
  it("TDEE = BMR × 活动系数", () => {
    const t = computeTargets(PROFILE, [body("2026-10-10", 70)], TODAY);
    expect(t.tdee).toBe(Math.round(t.bmr * ACTIVITY_FACTOR.moderate));
  });

  it("减脂目标低于 TDEE，增肌目标高于 TDEE", () => {
    const cut = computeTargets({ ...PROFILE, weeklyRateKg: -0.5 }, [body("2026-10-10", 80)], TODAY);
    const bulk = computeTargets({ ...PROFILE, weeklyRateKg: 0.5 }, [body("2026-10-10", 80)], TODAY);
    expect(cut.kcal).toBeLessThan(cut.tdee);
    expect(bulk.kcal).toBeGreaterThan(bulk.tdee);
    // 0.5 kg/周 ≈ 550 kcal/天
    expect(cut.tdee - cut.kcal).toBe(550);
  });

  it("对激进目标设置安全下限", () => {
    const extreme = computeTargets(
      { ...PROFILE, sex: "female", weeklyRateKg: -1.5 },
      [body("2026-10-10", 55)],
      TODAY,
    );
    expect(extreme.kcal).toBeGreaterThanOrEqual(1200);
    const maleExtreme = computeTargets(
      { ...PROFILE, sex: "male", weeklyRateKg: -2 },
      [body("2026-10-10", 60)],
      TODAY,
    );
    expect(maleExtreme.kcal).toBeGreaterThanOrEqual(1500);
  });

  it("宏量分配的热量之和接近总热量", () => {
    const t = computeTargets(PROFILE, [body("2026-10-10", 78)], TODAY);
    const fromMacros = t.protein * 4 + t.fat * 9 + t.carb * 4;
    expect(Math.abs(fromMacros - t.kcal)).toBeLessThan(10);
  });

  it("蛋白质目标按体重缩放", () => {
    const t = computeTargets(PROFILE, [body("2026-10-10", 80)], TODAY);
    expect(t.protein).toBe(Math.round(80 * 1.8));
  });

  it("纤维目标按 14g/1000kcal", () => {
    const t = computeTargets(PROFILE, [body("2026-10-10", 80)], TODAY);
    expect(t.fiber).toBe(Math.round((t.kcal / 1000) * 14));
  });
});

describe("latestWeight", () => {
  it("取日期最大的一条，而非数组末位", () => {
    const list = [body("2026-10-11", 80), body("2026-09-01", 85), body("2026-10-05", 82)];
    expect(latestWeight(list)).toBe(80);
  });

  it("无数据时用兜底值", () => {
    expect(latestWeight([], 65)).toBe(65);
  });
});

describe("营养换算", () => {
  it("scaleNutrition 按克数缩放", () => {
    const n = scaleNutrition({ kcal: 100, protein: 10, fat: 2, carb: 12 }, 150);
    expect(n.kcal).toBeCloseTo(150);
    expect(n.protein).toBeCloseTo(15);
    expect(n.fat).toBeCloseTo(3);
    expect(n.carb).toBeCloseTo(18);
  });

  it("sumNutrition 累加全部字段", () => {
    const total = sumNutrition([
      { kcal: 100, protein: 10, fat: 2, carb: 12, fiber: 1 },
      { kcal: 50, protein: 5, fat: 1, carb: 6, fiber: 2 },
    ]);
    expect(total.kcal).toBe(150);
    expect(total.fiber).toBe(3);
  });

  it("dayTotals 只统计当天", () => {
    const meals = [meal("2026-10-11", "lunch", 200), meal("2026-10-10", "lunch", 200)];
    expect(dayTotals(meals, "2026-10-11").kcal).toBeCloseTo(200);
  });
});

describe("训练统计", () => {
  const workout: Workout = {
    id: "w1",
    date: "2026-10-11",
    title: "测试",
    startedAt: 0,
    endedAt: 60 * 60 * 1000,
    exercises: [
      {
        id: "e1",
        exerciseId: "ex:Bench Press",
        sets: [
          { reps: 10, weightKg: 60, done: true },
          { reps: 8, weightKg: 70, done: true },
          { reps: 8, weightKg: 70, done: false },
        ],
      },
    ],
  };

  it("容量只计已完成组", () => {
    expect(volumeOf(workout)).toBe(10 * 60 + 8 * 70);
  });

  it("手动覆盖消耗时以覆盖值为准", () => {
    expect(estimateWorkoutKcal({ ...workout, kcalOverride: 321 }, 70)).toBe(321);
  });

  it("无覆盖值时按 MET 估算，且为正数", () => {
    const kcal = estimateWorkoutKcal(workout, 70);
    expect(kcal).toBeGreaterThan(0);
    // MET 5、70kg、60min ≈ 5*3.5*70/200*60 = 367.5
    expect(kcal).toBe(368);
  });
});

describe("趋势拟合", () => {
  it("少于 3 个点返回 null", () => {
    expect(trendPerWeek([{ date: "2026-10-01", value: 80 }])).toBeNull();
    expect(
      trendPerWeek([
        { date: "2026-10-01", value: 80 },
        { date: "2026-10-02", value: 79 },
      ]),
    ).toBeNull();
  });

  it("稳定下降 0.1 kg/天 → 约 -0.7 kg/周", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: shiftDate("2026-10-01", i),
      value: 80 - i * 0.1,
    }));
    expect(trendPerWeek(points)).toBeCloseTo(-0.7, 1);
  });

  it("体重不变时斜率约为 0", () => {
    const points = Array.from({ length: 5 }, (_, i) => ({
      date: shiftDate("2026-10-01", i),
      value: 75,
    }));
    expect(trendPerWeek(points)).toBeCloseTo(0, 5);
  });
});

describe("shiftDate", () => {
  it("跨月正确", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("跨年正确", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
  });
});
