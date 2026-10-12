import { describe, expect, it } from "vitest";
import {
  AiParseError,
  asArray,
  asNumber,
  asRecord,
  asString,
  parseJsonResponse,
  stripJsonFence,
} from "./parse";

describe("stripJsonFence", () => {
  it("剥掉 ```json 围栏", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("剥掉无语言标记的围栏", () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("去掉 JSON 前后的说明文字", () => {
    expect(stripJsonFence('好的，这是结果：{"a":1} 希望有帮助')).toBe('{"a":1}');
  });

  it("原样返回已经干净的 JSON", () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("parseJsonResponse", () => {
  it("解析正常 JSON", () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it("解析带围栏的 JSON", () => {
    expect(parseJsonResponse('```json\n{"items":[]}\n```')).toEqual({ items: [] });
  });

  it("空内容抛 AiParseError", () => {
    expect(() => parseJsonResponse("")).toThrow(AiParseError);
    expect(() => parseJsonResponse("   ")).toThrow("空内容");
  });

  it("非法 JSON 抛 AiParseError", () => {
    expect(() => parseJsonResponse("{不是 json}")).toThrow(AiParseError);
  });
});

describe("字段校验辅助", () => {
  it("asRecord 拒绝数组与标量", () => {
    expect(asRecord({ a: 1 }, "x")).toEqual({ a: 1 });
    expect(() => asRecord([], "x")).toThrow(AiParseError);
    expect(() => asRecord("s", "x")).toThrow(AiParseError);
    expect(() => asRecord(null, "x")).toThrow(AiParseError);
  });

  it("asArray 拒绝非数组", () => {
    expect(asArray([1, 2], "x")).toEqual([1, 2]);
    expect(() => asArray({}, "x")).toThrow(AiParseError);
  });

  it("asNumber 对脏数据回落", () => {
    expect(asNumber(5)).toBe(5);
    expect(asNumber("5.5")).toBe(5.5);
    expect(asNumber("abc", 7)).toBe(7);
    expect(asNumber(undefined, 7)).toBe(7);
    expect(asNumber(NaN, 7)).toBe(7);
  });

  it("asString 对非字符串回落", () => {
    expect(asString("a")).toBe("a");
    expect(asString(1, "fallback")).toBe("fallback");
    expect(asString(undefined, "fallback")).toBe("fallback");
  });
});
