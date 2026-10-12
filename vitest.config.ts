import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// 只对纯逻辑（domain / ai 解析 / 配餐重算）跑单测，
// 不引入 React Native 运行时，因此无需 RN 的 babel 转换。
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
