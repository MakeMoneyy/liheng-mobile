/** 轻量唯一 id。手机端不需要全局唯一，时间戳 + 随机后缀足够。 */
export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
