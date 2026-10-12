import { AiError, chatJSON, type ChatMessage } from "./client";
import { asArray, asNumber, asRecord, asString } from "./parse";
import type { Nutrition, RecognizedItem, RecognizedMeal } from "../domain/types";

/**
 * 拍照识别食物。
 *
 * 结果形态按产品决定：**单点数值**（不给区间、不给低估提示）。
 * 但营养数值是否采信由调用方决定 —— 上层会先拿名字去本地食物库匹配，
 * 命中就用本地权威值覆盖 AI 的估算。
 */

const SYSTEM_PROMPT = `你是一位中国注册营养师，擅长从照片估算中式与西式餐食的营养。

要求：
1. 逐项拆解照片里能看到的食物，不要合并成"一餐"或"一份套餐"。
2. 中式菜肴要单独估出烹饪用油（作为独立项，名称写"烹饪用油"），因为家庭炒菜用油常被忽略。
3. 分量按可食用部分估算克数，参考常见餐具尺寸（一碗熟米饭约 200g、一片吐司约 35g）。
4. 只输出 JSON，不要任何解释文字或 markdown 代码块。

JSON 结构：
{
  "items": [
    {
      "name": "食物名（中文，尽量用常见叫法）",
      "grams": 数值,
      "kcal": 每100克热量,
      "protein": 每100克蛋白质克数,
      "fat": 每100克脂肪克数,
      "carb": 每100克碳水克数,
      "confidence": 0到1之间的小数
    }
  ],
  "note": "一句话说明估算依据或不确定的地方"
}`;

export interface RecognizeOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  /** data:image/jpeg;base64,... */
  dataUrl: string;
  /** 用户补充说明，例如「这是我午饭，米饭大概两碗」 */
  hint?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function toItem(raw: unknown, index: number): RecognizedItem | null {
  const rec = asRecord(raw, `第 ${index + 1} 项食物`);
  const name = asString(rec.name).trim();
  if (!name) return null;

  const grams = Math.max(1, Math.min(3000, Math.round(asNumber(rec.grams, 100))));
  const per100: Nutrition = {
    kcal: Math.max(0, asNumber(rec.kcal)),
    protein: Math.max(0, asNumber(rec.protein)),
    fat: Math.max(0, asNumber(rec.fat)),
    carb: Math.max(0, asNumber(rec.carb)),
    fiber: rec.fiber === undefined ? undefined : Math.max(0, asNumber(rec.fiber)),
    sodiumMg: rec.sodiumMg === undefined ? undefined : Math.max(0, asNumber(rec.sodiumMg)),
  };
  const confidence = Math.max(0, Math.min(1, asNumber(rec.confidence, 0.5)));

  return { name, grams, per100, confidence, isNew: true };
}

export async function recognizeMeal(opts: RecognizeOptions): Promise<RecognizedMeal> {
  const userText = opts.hint?.trim()
    ? `请识别这张餐食照片，并据此估算营养：${opts.hint.trim()}`
    : "请识别这张餐食照片，并估算各项营养。";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: opts.dataUrl } },
        { type: "text", text: userText },
      ],
    },
  ];

  const json = await chatJSON({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    messages,
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
  });

  const items = asArray(json.items, "items")
    .map((raw, i) => toItem(raw, i))
    .filter((x): x is RecognizedItem => x !== null);

  if (items.length === 0) {
    throw new AiError(
      "server",
      "没能从照片里认出食物，换一张更清楚的照片试试，或手动录入。",
    );
  }

  return { items, note: asString(json.note) || undefined };
}
