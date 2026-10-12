import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store";
import {
  BarChart,
  Button,
  Card,
  CardTitle,
  Chip,
  Divider,
  Empty,
  MacroBar,
  PageHeader,
  Ring,
  Row,
  RowSub,
  RowTitle,
  RowValue,
  Stat,
} from "../../src/components/ui";
import {
  computeTargets,
  dayTotals,
  dayWorkoutKcal,
  estimateWorkoutKcal,
  humanDate,
  latestWeight,
  round,
  shiftDate,
  trendPerWeek,
  volumeOf,
} from "../../src/domain/calc";
import {
  PLAN_SLOT_LABEL,
  averageTrainingKcal,
  isTrainingDay,
  targetsForDay,
} from "../../src/domain/plan";
import { SEED_EXERCISES } from "../../src/data/exercises";
import { colors, font, space } from "../../src/theme";

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, today } = useStore();

  const targets = useMemo(
    () => computeTargets(state.profile, state.body),
    [state.profile, state.body],
  );
  const weight = latestWeight(state.body, 70);
  const totals = dayTotals(state.meals, today);
  const meals = state.meals.filter((m) => m.date === today);
  const workouts = state.workouts.filter((w) => w.date === today);
  const burn = dayWorkoutKcal(state.workouts, today, weight);

  const net = totals.kcal - burn;
  const remain = targets.kcal - net;

  const last7 = useMemo(() => {
    const days: { date: string; kcal: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = shiftDate(today, -i);
      days.push({ date: d, kcal: dayTotals(state.meals, d).kcal });
    }
    return days;
  }, [state.meals, today]);

  const trend = trendPerWeek(state.body.map((b) => ({ date: b.date, value: b.weightKg })));

  const tomorrow = shiftDate(today, 1);
  const tomorrowTraining = isTrainingDay(state.workouts, tomorrow);
  // 明天的目标要把训练日那部分训练消耗算进去，和配餐页保持一致
  const tomorrowTargets = tomorrowTraining
    ? targetsForDay(targets, true, averageTrainingKcal(state.workouts, tomorrow, weight))
    : targets;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: space.xxl * 2,
        paddingHorizontal: space.lg,
        gap: space.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        title={`${humanDate(today)}的账本`}
        sub={`${state.profile.name ? `${state.profile.name} · ` : ""}热量缺口优先于一切细节，先把它做对。`}
      />

      <View style={styles.actionRow}>
        <Button label="📷 拍一餐" tone="primary" onPress={() => router.push("/capture")} />
        <Button label="明天吃什么" onPress={() => router.push("/plan")} />
      </View>

      <Card>
        <View style={styles.ringWrap}>
          <Ring value={net} target={targets.kcal} label="净摄入 kcal" />
          <View style={styles.ringSide}>
            <View style={styles.statRow}>
              <Stat label="摄入" value={Math.round(totals.kcal)} unit="kcal" />
              <Stat
                label="训练消耗"
                value={burn}
                unit="kcal"
                color={colors.jadeSoft}
              />
              <Stat
                label={remain >= 0 ? "还可摄入" : "已超出"}
                value={Math.abs(Math.round(remain))}
                unit="kcal"
                color={remain >= 0 ? colors.gold : colors.danger}
              />
            </View>
            <View style={styles.macroRow}>
              <MacroBar label="蛋白质" value={totals.protein} target={targets.protein} />
              <MacroBar label="碳水" value={totals.carb} target={targets.carb} tone="jade" />
              <MacroBar label="脂肪" value={totals.fat} target={targets.fat} tone="jade" />
            </View>
          </View>
        </View>
      </Card>

      {/* 配餐入口：把「今天还差多少」直接接到「明天怎么吃」 */}
      <Card delay={40}>
        <CardTitle right={<Chip label={tomorrowTraining ? "训练日" : "休息日"} tone="jade" />}>
          明天吃什么
        </CardTitle>
        <Text style={styles.planLead}>
          {remain >= 0
            ? `今天还可摄入约 ${Math.round(remain)} kcal。`
            : `今天已超出约 ${Math.abs(Math.round(remain))} kcal。`}
          明天按 {tomorrowTraining ? "训练日" : "休息日"} 目标（{tomorrowTargets.kcal} kcal）排三餐加餐，
          全部只从你的本地食物库里选，热量由本机计算。
        </Text>
        <View style={styles.actionRow}>
          <Button
            label="生成明天的配餐"
            tone="primary"
            onPress={() => router.push({ pathname: "/plan", params: { date: tomorrow } })}
          />
        </View>
      </Card>

      <View style={styles.grid}>
        <Card delay={60}>
          <CardTitle
            right={<Button label="记录" size="sm" onPress={() => router.push("/train")} />}
          >
            今日训练
          </CardTitle>
          {workouts.length === 0 ? (
            <Empty>今天还没有训练记录</Empty>
          ) : (
            workouts.map((w) => (
              <Row
                key={w.id}
                main={
                  <>
                    <RowTitle>{w.title}</RowTitle>
                    <RowSub>
                      {w.exercises.length} 个动作 ·{" "}
                      {w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)}{" "}
                      组 · 容量 {Math.round(volumeOf(w))} kg
                    </RowSub>
                  </>
                }
                value={
                  <RowValue color={colors.jadeSoft}>
                    {estimateWorkoutKcal(w, weight)}
                  </RowValue>
                }
              />
            ))
          )}
        </Card>

        <Card delay={80}>
          <CardTitle
            right={<Button label="添加" size="sm" onPress={() => router.push("/food")} />}
          >
            今日饮食
          </CardTitle>
          {meals.length === 0 ? (
            <Empty>还没有记录饮食</Empty>
          ) : (
            (["breakfast", "lunch", "dinner", "snack"] as const).map((slot) => {
              const items = meals.filter((m) => m.slot === slot);
              if (items.length === 0) return null;
              const kcal = items.reduce((n, m) => n + (m.per100.kcal * m.grams) / 100, 0);
              return (
                <Row
                  key={slot}
                  left={<Chip label={PLAN_SLOT_LABEL[slot]} />}
                  main={
                    <>
                      <RowTitle>{items.map((i) => i.name).join("、")}</RowTitle>
                      <RowSub>{items.length} 项</RowSub>
                    </>
                  }
                  value={<RowValue>{Math.round(kcal)}</RowValue>}
                />
              );
            })
          )}
        </Card>
      </View>

      <Card delay={100}>
        <CardTitle>近 7 天摄入</CardTitle>
        <BarChart
          bars={last7.map((d) => ({
            label: `${Number(d.date.slice(8))}日`,
            value: d.kcal,
            over: d.kcal > targets.kcal * 1.05,
            empty: d.kcal === 0,
          }))}
        />
        <Divider />
        <View style={styles.statRow}>
          <Stat label="当前体重" value={round(weight, 1)} unit="kg" />
          <Stat
            label="周变化趋势"
            value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${round(trend, 2)}`}
            unit="kg/周"
            note="基于体重记录的线性拟合"
          />
          <Stat
            label="维持热量 TDEE"
            value={targets.tdee}
            unit="kcal"
            note={`基础代谢 ${targets.bmr} kcal`}
          />
        </View>
      </Card>

      <Card delay={120}>
        <CardTitle
          right={
            <Button label="全部" size="sm" onPress={() => router.push("/train")} />
          }
        >
          动作库速查
        </CardTitle>
        {SEED_EXERCISES.slice(0, 4).map((e) => (
          <Row
            key={e.id}
            left={<Chip label={e.muscle} tone="jade" />}
            main={
              <>
                <RowTitle>{e.name}</RowTitle>
                <RowSub>
                  {e.equipment} · MET {e.met}
                </RowSub>
              </>
            }
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  ringWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg },
  ringSide: { flex: 1, minWidth: 220, gap: space.lg },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  macroRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  grid: { gap: space.lg },
  planLead: {
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 21,
    color: colors.paperDim,
  },
});
