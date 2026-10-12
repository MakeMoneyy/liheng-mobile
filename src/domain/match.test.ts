import { describe, expect, it } from "vitest";
import { MATCH_THRESHOLD, matchFood, matchRecognizedItems, normalizeName } from "./match";
import type { FoodItem, RecognizedItem } from "./types";

function food(id: string, name: string, alias?: string[]): FoodItem {
  return {
    id,
    name,
    alias,
    category: "测试",
    per100: { kcal: 100, protein: 10, fat: 2, carb: 12, fiber: 1 },
    source: "测试",
  };
}

const LIB: FoodItem[] = [
  food("seed:白米饭（熟）", "白米饭（熟）"),
  food("seed:鸡胸肉", "鸡胸肉（煮）", ["鸡胸", "水煮鸡胸"]),
  food("seed:全麦面包", "全麦面包"),
  food("seed:拿铁", "拿铁咖啡", ["拿铁"]),
  food("seed:汉堡（牛肉）", "汉堡（牛肉）"),
];

function item(name: string, grams = 100): RecognizedItem {
  return {
    name,
    grams,
    per100: { kcal: 1, protein: 1, fat: 1, carb: 1 },
    confidence: 0.8,
    isNew: true,
  };
}

describe("normalizeName", () => {
  it("去掉标点与空白并转小写", () => {
    expect(normalizeName("白米饭（熟）")).toBe("白米饭熟");
    expect(normalizeName("Chicken, Breast")).toBe("chickenbreast");
  });
});

describe("matchFood", () => {
  it("完全同名时命中", () => {
    const m = matchFood("白米饭（熟）", LIB);
    expect(m.food?.id).toBe("seed:白米饭（熟）");
    expect(m.score).toBeGreaterThanOrEqual(0.9);
  });

  it("忽略括号补充说明后命中", () => {
    const m = matchFood("白米饭", LIB);
    expect(m.food?.id).toBe("seed:白米饭（熟）");
  });

  it("命中别名", () => {
    expect(matchFood("鸡胸", LIB).food?.id).toBe("seed:鸡胸肉");
    expect(matchFood("拿铁", LIB).food?.id).toBe("seed:拿铁");
  });

  it("包含关系可命中，例如「水煮鸡胸肉」", () => {
    const m = matchFood("水煮鸡胸肉", LIB);
    expect(m.food?.id).toBe("seed:鸡胸肉");
  });

  it("毫不相关的食物不命中", () => {
    const m = matchFood("提拉米苏", LIB);
    expect(m.food).toBeUndefined();
    expect(m.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it("单字不会误命中", () => {
    // 「米」只有 1 个字，不应命中「白米饭」
    expect(matchFood("米", LIB).food).toBeUndefined();
  });

  it("空库安全返回", () => {
    expect(matchFood("白米饭", []).food).toBeUndefined();
  });
});

describe("matchRecognizedItems", () => {
  it("命中时用本地营养值覆盖 AI 数值并回填 id", () => {
    const [hit] = matchRecognizedItems([item("白米饭（熟）")], LIB);
    expect(hit.isNew).toBe(false);
    expect(hit.matchedFoodId).toBe("seed:白米饭（熟）");
    expect(hit.per100.kcal).toBe(100); // 本地值，不是 AI 的 1
    expect(hit.matchedName).toBe("白米饭（熟）");
  });

  it("未命中时保留 AI 数值并标记 isNew", () => {
    const [miss] = matchRecognizedItems([item("芝士蛋糕")], LIB);
    expect(miss.isNew).toBe(true);
    expect(miss.matchedFoodId).toBeUndefined();
    expect(miss.per100.kcal).toBe(1); // 仍是 AI 的值
  });

  it("混合场景互不影响", () => {
    const out = matchRecognizedItems([item("白米饭"), item("芝士蛋糕")], LIB);
    expect(out[0].isNew).toBe(false);
    expect(out[1].isNew).toBe(true);
  });
});
