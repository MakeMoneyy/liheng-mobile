import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { uid, useStore } from "../src/store";
import {
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  Divider,
  Empty,
  MacroBar,
  Notice,
  PageHeader,
  Row,
  RowSub,
  RowTitle,
  RowValue,
  Stat,
} from "../src/components/ui";
import * as repo from "../src/db/repo";
import { useAiSettings } from "../src/ai/settings";
import { describeAiError } from "../src/ai/client";
import { planMealKcal, planToMealEntries, requestPlanDraft } from "../src/ai/planner";
import { SEED_FOODS } from "../src/data/foods";
import {
  PLAN_RETRY_DEVIATION,
  PLAN_SLOT_LABEL,
  averageTrainingKcal,
  isTrainingDay,
  recomputePlan,
  targetsForDay,
} from "../src/domain/plan";
import {
  computeTargets,
  dayTotals,
  humanDate,
  latestWeight,
  round,
  shiftDate,
} from "../src/domain/calc";
import type { FoodItem, MealPlan } from "../src/domain/types";
import { colors, font, space } from "../src/theme";

/** 手动指定训练日 / 休息日的覆盖值，按日期存进 settings */
const trainingOverrideKey = (date: string) => `trainingOverride.${date}`;

/**
 * 候选集：收藏 + 近 30 天吃过 + 每个分类的代表。
 * 控制在 60 条以内，既让 AI 有足够选择空间，又不至于把 prompt 撑爆。
 */
function buildCandidates(
  library: FoodItem[],
  favorites: string[],
  recentNames: string[],
  limit = 60,
): FoodItem[] {
  const picked = new Map<string, FoodItem>();
  const byName = new Map(library.map((f) => [f.name, f]));

  for (const id of favorites) {
    const f = library.find((x) => x.id === id);
    if (f) picked.set(f.id, f);
  }
  for (const name of recentNames) {
    const f = byName.get(name);
    if (f) picked.set(f.id, f);
  }

  // 每个分类补几个代表，保证结构上不缺主食 / 蛋白 / 蔬菜
  const byCategory = new Map<string, FoodItem[]>();
  for (const f of library) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }
  for (const [, list] of byCategory) {
    for (const f of list.slice(0, 3)) {
      if (picked.size >= limit) break;
      picked.set(f.id, f);
    }
  }

  // 还不够就按顺序补满
  for (const f of library) {
    if (picked.size >= limit) break;
    picked.set(f.id, f);
  }

  return [...picked.values()].slice(0, limit);
}

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const { state, today, addMeals } = useStore();
  const { config, apiKey, ready, configured } = useAiSettings();

  const targetDate = params.date ?? shiftDate(today, 1);
  const isToday = targetDate === today;

  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const bootstrapped = useRef(false);

  const library = useMemo<FoodItem[]>(
    () => [...SEED_FOODS, ...state.customFoods],
    [state.customFoods],
  );

  const baseTargets = useMemo(
    () => computeTargets(state.profile, state.body),
    [state.profile, state.body],
  );

  const autoTraining = useMemo(
    () => isTrainingDay(state.workouts, targetDate),
    [state.workouts, targetDate],
  );
  const training = override ?? autoTraining;

  // 训练日按历史训练消耗抬高当天热量目标，多出来的热量补给碳水
  const targets = useMemo(() => {
    if (!training) return baseTargets;
    const burn = averageTrainingKcal(
      state.workouts,
      targetDate,
      latestWeight(state.body),
    );
    return targetsForDay(baseTargets, true, burn);
  }, [baseTargets, training, state.workouts, state.body, targetDate]);

  const todayTotals = useMemo(() => dayTotals(state.meals, today), [state.meals, today]);
  const remainKcal = targets.kcal - todayTotals.kcal;

  // 首屏：读手动覆盖 + 上次缓存的计划（离线也能看）
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      const [ov, cached] = await Promise.all([
        repo.getSetting(trainingOverrideKey(targetDate)),
        repo.readPlan(targetDate),
      ]);
      if (ov === "1") setOverride(true);
      else if (ov === "0") setOverride(false);
      if (cached) setPlan(cached);
    })();
  }, [targetDate]);

  const candidates = useMemo(() => {
    const cutoff = shiftDate(today, -30);
    const recentNames = Array.from(
      new Set(state.meals.filter((m) => m.date >= cutoff).map((m) => m.name)),
    );
    return buildCandidates(library, state.favorites, recentNames);
  }, [library, state.favorites, state.meals, today]);

  const recomputed = useMemo(
    () => (plan ? recomputePlan(plan, library, targets) : null),
    [plan, library, targets],
  );

  const setTrainingOverride = (value: boolean) => {
    setOverride(value);
    void repo.setSetting(trainingOverrideKey(targetDate), value ? "1" : "0");
  };

  const generate = async () => {
    setLoading(true);
    setStatus("正在生成…");
    setSavedMsg("");
    try {
      const baseOpts = {
        apiKey,
        baseUrl: config.baseUrl,
        model: config.textModel,
        date: targetDate,
        targets,
        isTrainingDay: training,
        // 「今天还剩多少」只对今天有意义：给明天配餐时今天是全天满额，
        // 用今日余额去约束明天的计划会把明天的量压小。
        todayTotals: isToday ? todayTotals : undefined,
        remainKcal: isToday ? remainKcal : undefined,
        candidates,
      };

      let draft = await requestPlanDraft(baseOpts, uid(), Date.now());
      let result = recomputePlan(draft, library, targets);

      // 偏差超过 15% 就带着具体修正说明重问一次
      if (Math.abs(result.deviation) > PLAN_RETRY_DEVIATION) {
        setStatus("热量偏离目标较多，正在让 AI 调整…");
        const dir = result.deviation > 0 ? "超出" : "不足";
        const delta = Math.abs(Math.round(result.totals.kcal - targets.kcal));
        draft = await requestPlanDraft(
          {
            ...baseOpts,
            correction: `总热量${dir}目标约 ${delta} kcal（目标 ${targets.kcal}，当前约 ${Math.round(
              result.totals.kcal,
            )}）。请调整克数与搭配，让总量更接近目标。`,
          },
          uid(),
          Date.now(),
        );
        result = recomputePlan(draft, library, targets);
      }

      if (result.plan.meals.length === 0) {
        setStatus("AI 没有给出可用的配餐，换一次试试。");
        return;
      }

      setPlan(result.plan);
      await repo.savePlan(result.plan);
      setStatus(
        result.dropped > 0
          ? `已生成，丢弃了 ${result.dropped} 条不在食物库里的项目。`
          : "已生成。",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (e) {
      setStatus(describeAiError(e));
    } finally {
      setLoading(false);
    }
  };

  const recordToDate = () => {
    if (!plan) return;
    const entries = planToMealEntries(plan, library);
    if (entries.length === 0) return;
    addMeals(
      entries.map((e) => ({
        date: plan.date,
        slot: e.slot,
        foodId: e.foodId,
        name: e.name,
        grams: e.grams,
        per100: e.per100,
      })),
    );
    setSavedMsg(`已按这份计划写入 ${entries.length} 条记录到 ${humanDate(plan.date)}。`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingBottom: space.xxl,
          paddingHorizontal: space.lg,
          gap: space.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title={`${humanDate(targetDate)}吃什么`}
          sub="只从你的本地食物库里选，热量与宏量全部由本机计算。"
          right={<Button label="关闭" size="sm" tone="ghost" onPress={() => router.back()} />}
        />

        <Card>
          <CardTitle
            right={
              <Chip label={training ? "训练日" : "休息日"} tone={training ? "jade" : "default"} />
            }
          >
            当天安排
          </CardTitle>
          <RowSub>
            自动判断依据：过去 14 天里同一个星期几的训练比例。
            当前自动判定为「{autoTraining ? "训练日" : "休息日"}」
            {override !== undefined ? "，已手动覆盖。" : "。"}
          </RowSub>
          <ChipRow>
            <Chip
              label="按训练日"
              active={training}
              onPress={() => setTrainingOverride(true)}
            />
            <Chip
              label="按休息日"
              active={!training}
              onPress={() => setTrainingOverride(false)}
            />
            {override !== undefined && (
              <Chip
                label="恢复自动"
                onPress={() => {
                  setOverride(undefined);
                  void repo.setSetting(trainingOverrideKey(targetDate), "");
                }}
              />
            )}
          </ChipRow>
          <Divider />
          <View style={styles.statRow}>
            <Stat label="热量目标" value={targets.kcal} unit="kcal" color={colors.gold} />
            <Stat label="蛋白质" value={targets.protein} unit="g" />
            <Stat label="脂肪" value={targets.fat} unit="g" />
            <Stat label="碳水" value={targets.carb} unit="g" />
          </View>
          {!isToday && (
            <Notice>
              今天还可摄入约 {Math.round(remainKcal)} kcal
              {remainKcal < 0 ? "（已超出）" : ""}，这个上下文会一并交给 AI 参考。
            </Notice>
          )}
        </Card>

        {!ready ? (
          <Card>
            <ActivityIndicator color={colors.accent} />
          </Card>
        ) : !configured ? (
          <Card>
            <CardTitle>先配置 AI</CardTitle>
            <Notice tone="warn">
              配餐需要一个 AI 服务的 API Key。默认接智谱 GLM，文本模型 glm-4.7-flash
              目前免费。到「我的 → AI 设置」里填一次即可。
            </Notice>
            <Button label="去 AI 设置" tone="primary" onPress={() => router.replace("/me")} />
          </Card>
        ) : (
          <Card>
            <CardTitle right={<Text style={styles.count}>{candidates.length} 个候选</Text>}>
              生成配餐
            </CardTitle>
            <Notice>
              AI 只负责挑食物与定克数，界面上的热量、蛋白质等全部由本机按食物库数值计算。
              这样既避开模型算数不准，也避开拍照类 App 系统性低估热量的问题。
            </Notice>
            <View style={styles.actionRow}>
              <Button
                label={plan ? "换一个" : "生成三餐加餐"}
                tone="primary"
                loading={loading}
                onPress={() => void generate()}
              />
              {plan && (
                <Button
                  label={`按此记录到${humanDate(plan.date)}`}
                  onPress={recordToDate}
                />
              )}
            </View>
            {status ? <Text style={styles.status}>{status}</Text> : null}
            {savedMsg ? <Text style={styles.saved}>{savedMsg}</Text> : null}
          </Card>
        )}

        {plan && recomputed && (
          <>
            <Card delay={40}>
              <CardTitle
                right={
                  <Chip
                    label={`偏差 ${recomputed.deviation > 0 ? "+" : ""}${Math.round(
                      recomputed.deviation * 100,
                    )}%`}
                    tone={Math.abs(recomputed.deviation) <= 0.15 ? "jade" : "accent"}
                  />
                }
              >
                全天合计（本地计算）
              </CardTitle>
              <View style={styles.statRow}>
                <Stat
                  label="热量"
                  value={Math.round(recomputed.totals.kcal)}
                  unit="kcal"
                  note={`目标 ${targets.kcal}`}
                />
                <Stat label="蛋白质" value={round(recomputed.totals.protein, 0)} unit="g" />
                <Stat label="脂肪" value={round(recomputed.totals.fat, 0)} unit="g" />
                <Stat label="碳水" value={round(recomputed.totals.carb, 0)} unit="g" />
              </View>
              <View style={styles.macroRow}>
                <MacroBar
                  label="蛋白质"
                  value={recomputed.totals.protein}
                  target={targets.protein}
                />
                <MacroBar
                  label="碳水"
                  value={recomputed.totals.carb}
                  target={targets.carb}
                  tone="jade"
                />
                <MacroBar
                  label="脂肪"
                  value={recomputed.totals.fat}
                  target={targets.fat}
                  tone="jade"
                />
              </View>
              {plan.tip ? <Notice>{plan.tip}</Notice> : null}
            </Card>

            {plan.meals.length === 0 ? (
              <Card delay={60}>
                <Empty>这份计划里的食物都不在本地库里，请重新生成。</Empty>
              </Card>
            ) : (
              plan.meals.map((meal, idx) => (
                <Card key={meal.slot} delay={60 + idx * 20}>
                  <CardTitle
                    right={
                      <Chip
                        label={`${Math.round(planMealKcal(meal, library))} kcal`}
                        tone="accent"
                      />
                    }
                  >
                    {PLAN_SLOT_LABEL[meal.slot]}
                  </CardTitle>
                  {meal.items.map((item) => {
                    const food = library.find((f) => f.id === item.foodId);
                    if (!food) return null;
                    const kcal = (food.per100.kcal * item.grams) / 100;
                    return (
                      <Row
                        key={`${meal.slot}-${item.foodId}`}
                        main={
                          <>
                            <RowTitle>{food.name}</RowTitle>
                            <RowSub>
                              {item.grams}g · 蛋白{" "}
                              {round((food.per100.protein * item.grams) / 100, 1)}g · 碳水{" "}
                              {round((food.per100.carb * item.grams) / 100, 1)}g · 脂肪{" "}
                              {round((food.per100.fat * item.grams) / 100, 1)}g
                            </RowSub>
                          </>
                        }
                        value={<RowValue>{Math.round(kcal)}</RowValue>}
                      />
                    );
                  })}
                  {meal.reason ? <Notice>{meal.reason}</Notice> : null}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  macroRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  count: { fontFamily: font.sans, fontSize: 12, color: colors.muted },
  status: { fontFamily: font.sans, fontSize: 12.5, color: colors.gold, lineHeight: 19 },
  saved: { fontFamily: font.sans, fontSize: 12.5, color: colors.jadeSoft, lineHeight: 19 },
});
