/**
 * 解析模型返回的 JSON。
 *
 * 即使开了 JSON mode，模型偶尔仍会包一层 ```json 围栏或加一句前言，
 * 所以这里做一次宽松剥离 + 严格校验。
 */

export class AiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiParseError";
  }
}

/** 剥掉 markdown 围栏与前后噪声，返回可 JSON.parse 的字符串 */
export function stripJsonFence(raw: string): string {
  let s = raw.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 仍有前言时，取第一个 { 到最后一个 } 之间的内容
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const start = s.search(/[[{]/);
    if (start >= 0) s = s.slice(start);
  }
  if (s.startsWith("{")) {
    const end = s.lastIndexOf("}");
    if (end > 0) s = s.slice(0, end + 1);
  } else if (s.startsWith("[")) {
    const end = s.lastIndexOf("]");
    if (end > 0) s = s.slice(0, end + 1);
  }
  return s.trim();
}

export function parseJsonResponse(raw: string): unknown {
  if (!raw || !raw.trim()) throw new AiParseError("模型返回了空内容");
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiParseError("模型返回的不是合法 JSON，请重试");
  }
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiParseError(`${what} 格式不正确`);
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new AiParseError(`${what} 应为数组`);
  return value;
}

export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
