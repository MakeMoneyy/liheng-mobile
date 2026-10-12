import type { FoodItem, RecognizedItem } from "./types";

/**
 * 本地食物库模糊匹配。
 *
 * AI 只负责「看懂这是什么」，营养数值以本地库为准 —— 这样同一个食物
 * 每次记录得到的数值是稳定的，历史数据才可比。匹配不上才回落到 AI 估算值，
 * 并在确认后写入自定义食物库。
 */

const PUNCT = /[\s·、,，.。()（）\[\]【】「」"'"'!！?？:：;；+\-—_/\\]/g;

/** 去掉括号里的补充说明，例如「白米饭（熟）」→「白米饭」 */
function stripParens(s: string): string {
  return s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, "");
}

export function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(PUNCT, "");
}

function coreName(raw: string): string {
  return normalizeName(stripParens(raw));
}

/** 字符二元组，用于中文短名的相似度 */
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length <= 2) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 单个候选的匹配打分，0-1 */
function scoreOne(query: string, food: FoodItem): number {
  const q = normalizeName(query);
  const n = normalizeName(food.name);
  if (!q || !n) return 0;

  if (q === n) return 1;

  const qCore = coreName(query);
  const nCore = coreName(food.name);
  if (qCore && qCore === nCore) return 0.92;

  for (const a of food.alias ?? []) {
    const na = normalizeName(a);
    if (na && na === q) return 0.95;
    if (na && coreName(a) === qCore) return 0.9;
  }

  // 包含关系：短名至少 2 个字才算，避免「米」这类单字误命中
  const [short, long] = qCore.length <= nCore.length ? [qCore, nCore] : [nCore, qCore];
  if (short.length >= 2 && long.includes(short)) {
    return 0.62 + 0.18 * (short.length / long.length);
  }

  const j = jaccard(bigrams(qCore), bigrams(nCore));
  if (j > 0) return Math.min(0.72, j * 0.9);

  return 0;
}

/** 匹配阈值：低于这个分数就认为是新食物 */
export const MATCH_THRESHOLD = 0.55;

export interface FoodMatch {
  food?: FoodItem;
  score: number;
}

export function matchFood(name: string, library: FoodItem[]): FoodMatch {
  let best: FoodItem | undefined;
  let bestScore = 0;
  for (const f of library) {
    const s = scoreOne(name, f);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? { food: best, score: bestScore } : { score: bestScore };
}

/**
 * 对整餐的识别结果做匹配：
 * - 命中：用本地 per100 覆盖 AI 数值，回填 matchedFoodId
 * - 未命中：保留 AI 数值，标记 isNew
 */
export function matchRecognizedItems(
  items: RecognizedItem[],
  library: FoodItem[],
): RecognizedItem[] {
  return items.map((item) => {
    const { food } = matchFood(item.name, library);
    if (!food) {
      return { ...item, isNew: true, matchedFoodId: undefined, matchedName: undefined };
    }
    return {
      ...item,
      per100: food.per100,
      matchedFoodId: food.id,
      matchedName: food.name,
      isNew: false,
    };
  });
}

