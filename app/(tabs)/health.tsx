import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store";
import {
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  Divider,
  Empty,
  LineChart,
  PageHeader,
  Row,
  RowSub,
  RowTitle,
  Stat,
  type Series,
} from "../../src/components/ui";
import {
  computeTargets,
  latestWeight,
  round,
  shiftDate,
  toDateKey,
  trendPerWeek,
} from "../../src/domain/calc";
import { colors, font, radius, space } from "../../src/theme";

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { state, today, addBody, removeBody, saveMetric } = useStore();

  const [chartMetric, setChartMetric] = useState<"weight" | "fat" | "waist">("weight");
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [waist, setWaist] = useState("");
  const [note, setNote] = useState("");

  const [mDate, setMDate] = useState(today);
  const [sleep, setSleep] = useState("");
  const [steps, setSteps] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [bp, setBp] = useState("");
  const [water, setWater] = useState("");

  const targets = useMemo(
    () => computeTargets(state.profile, state.body),
    [state.profile, state.body],
  );
  const sorted = useMemo(
    () => [...state.body].sort((a, b) => a.date.localeCompare(b.date)),
    [state.body],
  );
  const current = latestWeight(state.body, 70);
  const trend = trendPerWeek(sorted.map((b) => ({ date: b.date, value: b.weightKg })));

  const bmi = current / (state.profile.heightCm / 100) ** 2;
  const bmiLabel = bmi < 18.5 ? "偏瘦" : bmi < 24 ? "正常" : bmi < 28 ? "超重" : "肥胖";

  const cutoff = shiftDate(today, -89);
  const windowed = sorted.filter((b) => b.date >= cutoff);

  const series: Series[] =
    chartMetric === "weight"
      ? windowed.length
        ? [
            {
              points: windowed.map((b) => ({ x: b.date, y: b.weightKg })),
              color: colors.accent,
              label: "体重 kg",
            },
          ]
        : []
      : chartMetric === "fat"
        ? windowed.some((b) => typeof b.bodyFatPct === "number")
          ? [
              {
                points: windowed
                  .filter((b) => typeof b.bodyFatPct === "number")
                  .map((b) => ({ x: b.date, y: b.bodyFatPct! })),
                color: colors.jade,
                label: "体脂 %",
              },
            ]
          : []
        : windowed.some((b) => typeof b.waistCm === "number")
          ? [
              {
                points: windowed
                  .filter((b) => typeof b.waistCm === "number")
                  .map((b) => ({ x: b.date, y: b.waistCm! })),
                color: colors.gold,
                label: "腰围 cm",
              },
            ]
          : [];

  const chartUnit = chartMetric === "weight" ? "kg" : chartMetric === "fat" ? "%" : "cm";

  const weekAgo = sorted.filter((b) => b.date <= shiftDate(today, -7)).at(-1);
  const monthAgo = sorted.filter((b) => b.date <= shiftDate(today, -30)).at(-1);
  const sinceStart = sorted.length > 0 ? current - sorted[0].weightKg : 0;

  const submit = () => {
    const w = Number(weight);
    if (!w || w <= 20 || w > 400) return;
    addBody({
      date,
      weightKg: w,
      bodyFatPct: bodyFat ? Number(bodyFat) : undefined,
      waistCm: waist ? Number(waist) : undefined,
      note: note.trim() || undefined,
    });
    setWeight("");
    setBodyFat("");
    setWaist("");
    setNote("");
  };

  const submitMetric = () => {
    const [sys, dia] = bp.split(/[/\s]+/).map((v) => Number(v));
    saveMetric({
      date: mDate,
      sleepHours: sleep ? Number(sleep) : undefined,
      steps: steps ? Number(steps) : undefined,
      restingHr: restingHr ? Number(restingHr) : undefined,
      systolic: sys || undefined,
      diastolic: dia || undefined,
      waterMl: water ? Number(water) : undefined,
    });
    setSleep("");
    setSteps("");
    setRestingHr("");
    setBp("");
    setWater("");
  };

  const metrics = useMemo(
    () => [...state.metrics].sort((a, b) => a.date.localeCompare(b.date)),
    [state.metrics],
  );
  const metricWindow = metrics.filter((m) => m.date >= cutoff);
  const sleepSeries = metricWindow
    .filter((m) => typeof m.sleepHours === "number")
    .map((m) => ({ x: m.date, y: m.sleepHours! }));
  const stepsSeries = metricWindow
    .filter((m) => typeof m.steps === "number")
    .map((m) => ({ x: m.date, y: m.steps! / 1000 }));
  const hrSeries = metricWindow
    .filter((m) => typeof m.restingHr === "number")
    .map((m) => ({ x: m.date, y: m.restingHr! }));

  const todayMetric = metrics.find((m) => m.date === today);
  const sleepCount = metricWindow.filter((m) => m.sleepHours).length;
  const stepsCount = metricWindow.filter((m) => m.steps).length;
  const avgSleep =
    sleepCount > 0
      ? metricWindow.reduce((n, m) => n + (m.sleepHours ?? 0), 0) / sleepCount
      : null;
  const avgSteps =
    stepsCount > 0
      ? metricWindow.reduce((n, m) => n + (m.steps ?? 0), 0) / stepsCount
      : null;

  const inputs: { label: string; value: string; set: (v: string) => void; ph: string }[] = [
    { label: "睡眠 小时", value: sleep, set: setSleep, ph: "7.5" },
    { label: "步数", value: steps, set: setSteps, ph: "8000" },
    { label: "静息心率 bpm", value: restingHr, set: setRestingHr, ph: "58" },
    { label: "血压 mmHg", value: bp, set: setBp, ph: "118/76" },
    { label: "饮水 ml", value: water, set: setWater, ph: "2000" },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingBottom: space.xxl * 2,
          paddingHorizontal: space.lg,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="身体"
          sub="体重看趋势，不看单点。"
          right={<Chip label={`${sorted.length} 条记录`} tone="accent" />}
        />

        <Card>
          <CardTitle>记录身体数据</CardTitle>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>日期（YYYY-MM-DD）</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-10-11"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
          </View>
          <ChipRow>
            <Chip label="今天" active={date === today} onPress={() => setDate(today)} />
            <Chip
              label="昨天"
              active={date === shiftDate(today, -1)}
              onPress={() => setDate(shiftDate(today, -1))}
            />
            <Chip
              label="前天"
              active={date === shiftDate(today, -2)}
              onPress={() => setDate(shiftDate(today, -2))}
            />
          </ChipRow>
          <View style={styles.actionRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>体重 kg *</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder={round(current, 1).toString()}
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>体脂 %</Text>
              <TextInput
                style={styles.input}
                value={bodyFat}
                onChangeText={setBodyFat}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="选填"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>腰围 cm</Text>
              <TextInput
                style={styles.input}
                value={waist}
                onChangeText={setWaist}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="选填"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>备注</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="空腹 / 训练后"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <Button label="保存记录" tone="primary" disabled={!weight} onPress={submit} />
            <Button label="回到今天" onPress={() => setDate(toDateKey(new Date()))} />
          </View>
        </Card>

        <Card delay={40}>
          <CardTitle right={<Text style={styles.count}>近 90 天</Text>}>趋势</CardTitle>
          <ChipRow>
            <Chip
              label="体重 kg"
              active={chartMetric === "weight"}
              onPress={() => setChartMetric("weight")}
            />
            <Chip
              label="体脂 %"
              active={chartMetric === "fat"}
              onPress={() => setChartMetric("fat")}
            />
            <Chip
              label="腰围 cm"
              active={chartMetric === "waist"}
              onPress={() => setChartMetric("waist")}
            />
          </ChipRow>
          <LineChart series={series} unit={chartUnit} />
        </Card>

        <Card delay={60}>
          <View style={styles.statRow}>
            <Stat
              label="当前体重"
              value={round(current, 1)}
              unit="kg"
              note={`BMI ${round(bmi, 1)} · ${bmiLabel}`}
            />
            <Stat
              label="周变化速率"
              value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${round(trend, 2)}`}
              unit="kg/周"
              note={`目标 ${targets.weeklyRateKg > 0 ? "+" : ""}${targets.weeklyRateKg} kg/周`}
            />
            <Stat
              label="相比起始"
              value={`${sinceStart > 0 ? "+" : ""}${round(sinceStart, 1)}`}
              unit="kg"
              color={sinceStart <= 0 ? colors.jadeSoft : undefined}
              note={`7 天 ${weekAgo ? round(current - weekAgo.weightKg, 1) : "—"} · 30 天 ${
                monthAgo ? round(current - monthAgo.weightKg, 1) : "—"
              }`}
            />
          </View>
        </Card>

        <Card delay={80}>
          <CardTitle
            right={todayMetric ? <Chip label="今天已记录" tone="jade" /> : undefined}
          >
            日常指标
          </CardTitle>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>日期（YYYY-MM-DD）</Text>
            <TextInput
              style={styles.input}
              value={mDate}
              onChangeText={setMDate}
              placeholder="2026-10-11"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
          </View>
          <ChipRow>
            <Chip label="今天" active={mDate === today} onPress={() => setMDate(today)} />
            <Chip
              label="昨天"
              active={mDate === shiftDate(today, -1)}
              onPress={() => setMDate(shiftDate(today, -1))}
            />
          </ChipRow>
          <View style={styles.actionRow}>
            {inputs.map((f) => (
              <View key={f.label} style={styles.field}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={f.value}
                  onChangeText={f.set}
                  placeholder={f.ph}
                  placeholderTextColor={colors.muted}
                  keyboardType={f.label.includes("血压") ? "numbers-and-punctuation" : "decimal-pad"}
                />
              </View>
            ))}
          </View>
          <View style={styles.actionRow}>
            <Button label="保存当日指标" tone="primary" onPress={submitMetric} />
          </View>

          {(sleepSeries.length > 0 || stepsSeries.length > 0 || hrSeries.length > 0) && (
            <>
              <Divider />
              <LineChart
                series={[
                  ...(sleepSeries.length
                    ? [{ points: sleepSeries, color: colors.jadeSoft, label: "睡眠 小时" }]
                    : []),
                  ...(stepsSeries.length
                    ? [
                        {
                          points: stepsSeries,
                          color: colors.gold,
                          label: "步数 千步",
                          dashed: true,
                        },
                      ]
                    : []),
                  ...(hrSeries.length
                    ? [
                        {
                          points: hrSeries,
                          color: colors.accentSoft,
                          label: "静息心率 bpm",
                          dashed: true,
                        },
                      ]
                    : []),
                ]}
                height={200}
              />
              <View style={styles.statRow}>
                <Stat label="平均睡眠" value={avgSleep === null ? "—" : round(avgSleep, 1)} unit="小时" />
                <Stat label="平均步数" value={avgSteps === null ? "—" : Math.round(avgSteps)} unit="步" />
                <Stat label="今日饮水" value={todayMetric?.waterMl ?? 0} unit="ml" />
              </View>
            </>
          )}
        </Card>

        <Card delay={100}>
          <CardTitle>全部记录（{sorted.length}）</CardTitle>
          {sorted.length === 0 ? (
            <Empty>还没有身体数据，先记一次体重</Empty>
          ) : (
            [...sorted].reverse().map((b) => (
              <Row
                key={b.id}
                main={
                  <>
                    <RowTitle>
                      {b.date} · {round(b.weightKg, 1)} kg
                    </RowTitle>
                    <RowSub>
                      体脂 {b.bodyFatPct ? `${round(b.bodyFatPct, 1)}%` : "—"} · 腰围{" "}
                      {b.waistCm ? `${round(b.waistCm, 1)}cm` : "—"}
                      {b.note ? ` · ${b.note}` : ""}
                    </RowSub>
                  </>
                }
                right={
                  <Button label="✕" size="sm" tone="ghost" onPress={() => removeBody(b.id)} />
                }
              />
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-end" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  field: { flex: 1, minWidth: 140, gap: 6 },
  fieldLabel: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },
  count: { fontFamily: font.sans, fontSize: 12, color: colors.muted },
  input: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ink2,
    color: colors.paper,
    fontFamily: font.sans,
    fontSize: 13,
    paddingHorizontal: space.md,
  },
});
