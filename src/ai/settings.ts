import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as repo from "../db/repo";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TEXT_MODEL,
  DEFAULT_VISION_MODEL,
} from "./client";
import type { AiConfig } from "../domain/types";

/**
 * AI 配置的读写。
 *
 * API Key 存在 expo-secure-store（iOS Keychain / Android Keystore），
 * 不落 SQLite、不进代码、不进安装包；baseUrl 与模型名属于非敏感配置，
 * 放 SQLite 便于用户改。
 */

const KEY_STORE = "liheng.ai.apiKey";
const SETTING_AI = "ai.config";

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: DEFAULT_BASE_URL,
  visionModel: DEFAULT_VISION_MODEL,
  textModel: DEFAULT_TEXT_MODEL,
};

export async function readApiKey(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(KEY_STORE)) ?? "";
  } catch {
    return "";
  }
}

export async function writeApiKey(key: string): Promise<void> {
  if (key.trim()) await SecureStore.setItemAsync(KEY_STORE, key.trim());
  else await SecureStore.deleteItemAsync(KEY_STORE);
}

export async function readAiConfig(): Promise<AiConfig> {
  try {
    const raw = await repo.getSetting(SETTING_AI);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      baseUrl: parsed.baseUrl?.trim() || DEFAULT_BASE_URL,
      visionModel: parsed.visionModel?.trim() || DEFAULT_VISION_MODEL,
      textModel: parsed.textModel?.trim() || DEFAULT_TEXT_MODEL,
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export async function writeAiConfig(config: AiConfig): Promise<void> {
  await repo.setSetting(SETTING_AI, JSON.stringify(config));
}

export interface AiSettingsState {
  config: AiConfig;
  apiKey: string;
  ready: boolean;
  configured: boolean;
  save: (next: { config?: AiConfig; apiKey?: string }) => Promise<void>;
}

/** 界面用的 AI 设置 hook：一次读取，改完立刻落库 */
export function useAiSettings(): AiSettingsState {
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, k] = await Promise.all([readAiConfig(), readApiKey()]);
      if (!alive) return;
      setConfig(c);
      setApiKey(k);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (next: { config?: AiConfig; apiKey?: string }) => {
      if (next.config) {
        setConfig(next.config);
        await writeAiConfig(next.config);
      }
      if (next.apiKey !== undefined) {
        setApiKey(next.apiKey);
        await writeApiKey(next.apiKey);
      }
    },
    [],
  );

  return { config, apiKey, ready, configured: apiKey.trim().length > 0, save };
}
