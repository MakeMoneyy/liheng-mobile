# 练衡 · 手机版（Expo）

把 `outputs/liheng`（Web 原型）迁移成 **Android + iOS 同一套代码** 的手机 App，
并加上两个 AI 功能：**拍照识别食物热量** 与 **每日配餐建议**。

> 与《训记》无任何代码、服务端、付费数据或素材关系。全部为原创实现，
> 数据来自公开许可来源或自建。参见 `../产品方案.md` 与 `../数据源清单.md`。

## 快速开始

```powershell
cd outputs\liheng-mobile
npm install
npm run typecheck     # tsc --noEmit，应为 0 错误
npm test              # 80 个单元测试
npm start             # Metro，扫码用 Expo Go 打开
npm run android       # 直接拉起安卓模拟器 / 真机
```

`npm start` 之后按 `a` 开安卓、按 `i` 开 iOS 模拟器，或用 Expo Go 扫二维码。

## AI 功能怎么用

App **不内置任何 API Key**，需要你自己填一次。

1. 到 [bigmodel.cn](https://bigmodel.cn) 注册并申请 API Key。
2. 打开 App → 底部「我的」→ **AI 设置** → 粘贴 Key → 「保存设置」。
3. 点「连通性自检」确认能通。

默认接智谱 GLM 的 OpenAI 兼容接口，两个模型目前免费：

| 用途 | 模型 | 说明 |
| --- | --- | --- |
| 拍照识别 | `glm-4.6v-flash` | 支持 base64 图片输入 |
| 每日配餐 | `glm-4.7-flash` | 纯文本 |

baseUrl 与模型名都可以改，所以也能换成任意 OpenAI 兼容服务
（例如自建 vLLM / Ollama 的 `/v1`）。

**Key 的存放**：`expo-secure-store`（iOS Keychain / Android Keystore），
不写进代码、不进安装包、不落 SQLite 明文。baseUrl 与模型名属于非敏感配置，存 SQLite。

未配置 Key 时，拍照页与配餐页显示的是引导卡片而不是报错崩溃。

### 拍照识别（今日页 / 饮食页的「拍一餐」）

流程：拍照（权限被拒自动降级到相册）→ 压到长边 1024、JPEG 0.7、转 base64 →
`glm-4.6v-flash` 逐项拆解 → 与本地食物库模糊匹配 → 确认份量 → 记账。

两条关键设计：

- **结果只给单点数值**，不给区间、不给低估提示。
- **营养以本地为准**：命中本地库就用本地 `per100 × 克数` 重算并关联 `foodId`；
  未命中才保留 AI 数值并标记「新建」，确认后写进 `custom_foods`。
  这样同一个食物每次记录数值稳定，历史可比。

prompt 里明确要求逐食材拆分，并**单独估出「烹饪用油」**——中式炒菜的油常被忽略。

### 每日配餐（今日页「明天吃什么」/ 饮食页入口）

- **训练日判定**：看过去 14 天里同一个星期几的训练比例，≥ 50% 算训练日；
  训练日按历史训练消耗抬高当天热量目标，多出来的热量补给碳水。可在页面上手动覆盖。
- **候选集只来自本地食物库**（收藏 + 近 30 天吃过 + 各分类代表，上限 60 条），
  AI 只能从中挑 `foodId` 与克数。
- **所有热量与宏量由本地 `scaleNutrition` 重算，完全忽略 AI 返回的数字**。
  非法 `foodId` 直接丢弃；总量偏离目标 > 15% 时带修正说明重问一次。
- 结果缓存进 `meal_plans`，离线能看上次结果；可「换一个」或「按此记录到明天」。

## 为什么不让 AI 报热量

NIH/NIDDK 在 NUTRITION 2026 上用代谢厨房精确到 0.1g 的 102 份标准餐测了
MyFitnessPal、LoseIt!、CalAI、Appediet：**四款全部低估**，平均每餐少
250–345 kcal，脂肪少约 30g（≈ 1/3），高脂餐误差最大。

所以本项目的立场是：AI 只负责「看懂这是什么」与「帮你挑组合」，
**数字一律本地算**。这也让「拍照识别」从一个不可靠的估值器，
变成一个可靠的**录入加速器**。

## 架构

```
app/                          Expo Router 路由
  _layout.tsx                 根布局：字体、SafeArea、SQLite 就绪门禁
  (tabs)/_layout.tsx          底部五个 tab
  (tabs)/index.tsx            今日
  (tabs)/train.tsx            训练
  (tabs)/food.tsx             饮食
  (tabs)/health.tsx           身体 + 日常指标
  (tabs)/me.tsx               我的 + AI 设置 + 备份
  capture.tsx                 modal：拍照识别
  plan.tsx                    modal：每日配餐
src/
  domain/
    types.ts                  领域模型（在 Web 版基础上扩展 AI 类型）
    calc.ts                   纯函数，与 Web 版**逐字节相同**
    calc.test.ts              21 个用例，与 Web 版**逐字节相同**（迁移回归网）
    match.ts                  本地食物库模糊匹配（纯函数，可测）
    plan.ts                   配餐重算 / 训练日判定 / 训练日目标（纯函数，可测）
  data/
    foods.ts                  162 条种子食物，与 Web 版逐字节相同
    exercises.ts              动作库，与 Web 版逐字节相同
    exercises.generated.ts    876 条 free-exercise-db 导入，逐字节相同
  ai/
    client.ts                 OpenAI 兼容客户端：超时、退避重试、中文错误映射
    parse.ts                  剥 markdown 围栏 + 严格校验（纯函数，可测）
    vision.ts                 拍照识别 prompt 与结果解析
    planner.ts                配餐 prompt 与草稿解析
    settings.ts               AI 配置读写（Key 走 SecureStore）
    capture.ts                拍照 / 选图 → 压缩 → base64
  db/
    schema.ts                 建表 SQL
    index.ts                  连接 + PRAGMA user_version 迁移
    repo.ts                   读写实现
  components/ui.tsx           Card / Button / Chip / Ring / MacroBar / 折线 / 柱状…
  store.tsx                   全局状态，接口与 Web 版一致
  theme.ts                    配色、间距、字体族名
```

### 存储

- **用户数据**进 `expo-sqlite`：`profile`、`body_entries`、`day_metrics`、
  `workouts`、`workout_exercises`、`workout_sets`、`meals`、`custom_foods`、
  `favorites`、`meal_plans`、`settings`。
- **静态目录**（162 条食物、约 950 个动作）继续以 TS 模块打包，不进库：
  省掉首启播种，查询也更快。
- `meals` 写入时**反规范化存 `per100`**，历史记录不会因食物库更新而漂移。
  索引建在 `date` / `food_id` / `workout_id` 上。
- 启动时按 `PRAGMA user_version` 逐条应用迁移（当前 `SCHEMA_VERSION = 1`）。
- 写入是「乐观更新内存 + 后台落库」；**id 只生成一次**，内存态与库内共用，
  否则同一次会话内删掉的记录会在下次启动时「复活」。
- 「我的 → 导出 / 导入 JSON」是跨设备迁移通道，也能把 Web 版 localStorage
  里的数据搬进手机版。

### 图表

全部用 `react-native-svg` 重画（净摄入环、宏量条、近 7 天柱状、体重/体脂/腰围
折线、两周训练负荷），数学逻辑直接复用 `domain/calc.ts`，没有重写。

## 测试

```powershell
npm test        # 80 个用例
```

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `domain/calc.test.ts` | 21 | BMR / TDEE / 宏量 / 消耗 / 趋势 / 日期边界（**与 Web 版相同**） |
| `domain/match.test.ts` | 11 | 精确名 / 别名 / 包含 / 二元组重叠 / 阈值边界 / 回落为 `isNew` |
| `domain/plan.test.ts` | 19 | 本地重算、非法 foodId 丢弃、偏差、AI 数字被忽略、训练日判定与目标 |
| `ai/parse.test.ts` | 12 | 正常 JSON / 围栏 / 缺字段 / 非法 JSON |
| `ai/client.test.ts` | 17 | 401/429/超时映射、重试次数、AbortController |

## 出包

### 安卓 APK（内部分发 / 自测）

```powershell
npx eas build -p android --profile preview
```

`eas.json` 里 `preview` 已配成 `buildType: apk`，构建完给下载链接，直接装。

### iOS 模拟器包（无需 Apple 开发者账号）

**推荐：走 GitHub Actions，零成本、不限时长。**

仓库里已有 `.github/workflows/ios-simulator.yml`：推到 GitHub（仓库需 **公开**，
托管 macOS runner 才免费）后自动在云端 `prebuild` → `pod install` →
`xcodebuild`（Release）→ 装进真 iOS Simulator → 用 **Maestro 走真实点击**
遍历五个 tab 与两个 modal（带 `assertVisible` 断言）→ 截图 + 录屏，产物在
Actions 页面的 **Artifacts** 里下载。完整步骤与排错见 `../iOS验证方案.md`。

```powershell
# 下载产物（需先设 $env:GH_TOKEN）
pwsh -File scripts/download-ios-artifact.ps1
```

也可以用 EAS 出包（有免费额度上限）：

```powershell
npx eas build -p ios --profile simulator
```

拿到 `.tar.gz` 后上传 [Appetize.io](https://appetize.io) 免费版，
就能在 Windows 浏览器里点着跑。免费额度有限，只用于验收，不做日常迭代。

### 正式上架

```powershell
npx eas build -p android --profile production   # .aab
npx eas build -p ios --profile production       # 需 Apple 开发者账号
```

**包体积注意**：中文字体每个字重十几 MB。本项目只按字重深引入实际用到的
6 个字体文件（`@expo-google-fonts/*/<字重>`），并且没有用
`assetBundlePatterns: ["**/*"]`。全量引入会让 bundle 从约 39 MB 涨到 209 MB，
直接超过应用商店上限——改字体引入方式后务必重新跑一次 `expo export` 核对体积。

## 环境说明

- Expo SDK 57 / React Native 0.86.3 / React 19.2.3。
- **RN 版本必须跟 Expo 的 `bundledNativeModules.json` 对齐**（0.86.3）。
  用 0.87.x 会因为 RN 移除了 `rn-get-polyfills.js` 导致 Metro 直接打包失败。
- 类型检查能通过是因为 `expo/types/react-native-web.d.ts` 用
  `interface TextStyle` 做声明合并；RN 0.87 把 `TextStyle` 改成类型别名后
  这个合并会失效并把原生样式键全部顶掉。0.86.3 的接口形态没有这个问题，
  所以不需要额外的类型补丁。

## 已知边界

- 本轮**不扩充食物库**（维持 162 条 + 用户自建）。拍照识别对库里没有的食物
  也能给出营养，所以不阻塞 AI 功能。
- 智谱免费模型的 QPS / 并发上限官方未文档化，需实测。配置层已预留切换到
  `glm-4.6v-flashx`（0.15 元/百万输入）等付费模型的入口。
- 安卓模拟器的相机是假的，真实拍照链路要在真机上验收。
- 不做社区、教练端、账号体系、后端代理。
- 所有营养与消耗数字都是**参考值，非医疗建议**；以实际包装营养标签为准。
