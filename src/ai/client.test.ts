import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiError,
  chat,
  chatJSON,
  describeAiError,
  DEFAULT_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "./client";

const OK_BODY = {
  choices: [{ message: { content: '{"items":[{"name":"米饭","grams":200}]}' } }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("chat", () => {
  it("缺少 key 时直接抛 no-key，不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chat({ apiKey: "", model: DEFAULT_VISION_MODEL, messages: [] }),
    ).rejects.toMatchObject({ kind: "no-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("按 baseUrl 拼接端点并带 Authorization 头", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await chat({ apiKey: "sk-test", model: "m", messages: [{ role: "user", content: "hi" }] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE_URL}/chat/completions`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("结尾多余的斜杠不会造成双斜杠", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await chat({
      apiKey: "k",
      baseUrl: "https://example.com/v1///",
      model: "m",
      messages: [],
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/v1/chat/completions");
  });

  it("开启 JSON mode 并传 temperature", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await chat({ apiKey: "k", model: "m", messages: [] });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0.2);
  });

  it("401 映射为 unauthorized，且不重试", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("bad key", 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chat({ apiKey: "k", model: "m", messages: [] })).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("429 映射为 rate-limit，并退避重试一次", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(textResponse("slow down", 429));
    vi.stubGlobal("fetch", fetchMock);

    const p = chat({ apiKey: "k", model: "m", messages: [] });
    const assertion = expect(p).rejects.toMatchObject({ kind: "rate-limit" });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2); // 首次 + 1 次重试
  });

  it("500 也重试，且第二次成功时返回内容", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("boom", 500))
      .mockResolvedValueOnce(jsonResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const p = chat({ apiKey: "k", model: "m", messages: [] });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toContain("米饭");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries=0 时不重试", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("boom", 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chat({ apiKey: "k", model: "m", messages: [], retries: 0 }),
    ).rejects.toMatchObject({ kind: "server" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("网络异常映射为 network", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chat({ apiKey: "k", model: "m", messages: [], retries: 0 }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("超时映射为 timeout（AbortController 生效）", async () => {
    vi.useFakeTimers();
    // 模拟一个永不 resolve 的请求，只响应 abort 信号
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = chat({
      apiKey: "k",
      model: "m",
      messages: [],
      timeoutMs: 1000,
      retries: 0,
    });
    const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1200);
    await assertion;
  });

  it("外部 signal 取消时抛 aborted 且不重试", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = chat({ apiKey: "k", model: "m", messages: [], signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ kind: "aborted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("返回空 content 时报错", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chat({ apiKey: "k", model: "m", messages: [], retries: 0 }),
    ).rejects.toThrow("空内容");
  });
});

describe("chatJSON", () => {
  it("解析成对象", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(OK_BODY)));
    const out = await chatJSON({ apiKey: "k", model: "m", messages: [] });
    expect(Array.isArray(out.items)).toBe(true);
  });

  it("模型返回数组时视为结构错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "[1,2,3]" } }] }),
      ),
    );
    await expect(
      chatJSON({ apiKey: "k", model: "m", messages: [], retries: 0 }),
    ).rejects.toThrow("结构不符合预期");
  });
});

describe("describeAiError", () => {
  it("透出 AiError 的中文提示", () => {
    expect(describeAiError(new AiError("timeout", "超时了"))).toBe("超时了");
  });

  it("普通 Error 用其 message", () => {
    expect(describeAiError(new Error("boom"))).toBe("boom");
  });

  it("未知类型给兜底文案", () => {
    expect(describeAiError(42)).toBe("未知错误");
  });
});
