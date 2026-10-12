import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uid, useStore } from "../../src/store";
import {
  BarChart,
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  Divider,
  Empty,
  PageHeader,
  Row,
  RowSub,
  RowTitle,
  RowValue,
  Stat,
} from "../../src/components/ui";
import {
  EQUIPMENTS,
  LEVEL_LABEL,
  MUSCLES,
  PLAN_TEMPLATES,
  SEED_EXERCISES,
} from "../../src/data/exercises";
import type { Exercise, Workout, WorkoutExercise } from "../../src/domain/types";
import {
  estimateWorkoutKcal,
  humanDate,
  latestWeight,
  round,
  shiftDate,
  volumeOf,
} from "../../src/domain/calc";
import { colors, font, radius, space } from "../../src/theme";

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const EX_BY_ID = new Map(SEED_EXERCISES.map((e) => [e.id, e]));
const EX_BY_NAME = new Map(SEED_EXERCISES.map((e) => [e.nameEn, e]));

function blankWorkout(date: string, title: string): Workout {
  return { id: uid(), date, title, startedAt: Date.now(), exercises: [] };
}

/**
 * 解析模板里的次数写法：
 * "5-8" → 5 次；"力竭-2" → 2 次；"40s" / "20min" → 计 1 组并保留时长到备注。
 */
function parseReps(spec: string): { reps: number; note?: string } {
  const time = spec.match(/^(\d+)\s*(s|min)$/i);
  if (time) return { reps: 1, note: `目标 ${time[1]}${time[2].toLowerCase()}` };
  const range = spec.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (range) return { reps: Number(range[1]) };
  const single = spec.match(/\d+/);
  return { reps: single ? Number(single[0]) : 10 };
}

function NumberCell({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <TextInput
      style={styles.setInput}
      value={value === undefined ? "" : String(value)}
      onChangeText={(t) => {
        if (t.trim() === "") return onChange(undefined);
        const n = Number(t.replace(/[^0-9.]/g, ""));
        onChange(Number.isFinite(n) ? n : undefined);
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType="decimal-pad"
      inputMode={step === "1" ? "numeric" : "decimal"}
      selectTextOnFocus
    />
  );
}

function SetEditor({
  item,
  exercise,
  onChange,
}: {
  item: WorkoutExercise;
  exercise: Exercise | undefined;
  onChange: (next: WorkoutExercise) => void;
}) {
  const update = (i: number, patch: Partial<WorkoutExercise["sets"][number]>) => {
    const sets = item.sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ ...item, sets });
  };

  return (
    <View style={styles.exerciseBlock}>
      <View style={styles.exerciseHead}>
        <View style={{ flex: 1 }}>
          <RowTitle>{exercise?.name ?? "未知动作"}</RowTitle>
          <RowSub>
            {exercise?.muscle} · {exercise?.equipment} · MET {exercise?.met}
          </RowSub>
        </View>
        <View style={styles.actionRow}>
          <Button
            label="＋ 一组"
            size="sm"
            onPress={() =>
              onChange({
                ...item,
                sets: [
                  ...item.sets,
                  { ...(item.sets[item.sets.length - 1] ?? { reps: 10, weightKg: 0, done: false }) },
                ],
              })
            }
          />
          <Button
            label="− 一组"
            size="sm"
            tone="ghost"
            disabled={item.sets.length <= 1}
            onPress={() => onChange({ ...item, sets: item.sets.slice(0, -1) })}
          />
        </View>
      </View>

      <View style={styles.setHeadRow}>
        <Text style={[styles.setHeadCell, { width: 24 }]}>#</Text>
        <Text style={styles.setHeadCell}>次数</Text>
        <Text style={styles.setHeadCell}>重量 kg</Text>
        <Text style={styles.setHeadCell}>RPE</Text>
        <Text style={[styles.setHeadCell, { width: 46 }]}>完成</Text>
      </View>

      {item.sets.map((s, i) => (
        <View style={styles.setRow} key={i}>
          <Text style={styles.setIndex}>{i + 1}</Text>
          <NumberCell
            value={s.reps}
            step="1"
            onChange={(v) => update(i, { reps: v ?? 0 })}
          />
          <NumberCell
            value={s.weightKg}
            onChange={(v) => update(i, { weightKg: v ?? 0 })}
          />
          <NumberCell value={s.rpe} placeholder="—" onChange={(v) => update(i, { rpe: v })} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.done ? "标记为未完成" : "标记为完成"}
            style={styles.doneBtn}
            onPress={() => update(i, { done: !s.done })}
          >
            <Text style={{ color: s.done ? colors.jadeSoft : colors.muted, fontSize: 20 }}>
              {s.done ? "✓" : "○"}
            </Text>
          </Pressable>
        </View>
      ))}

      <TextInput
        style={[styles.input, { marginTop: space.sm }]}
        placeholder="这一动作的备注（可选）"
        placeholderTextColor={colors.muted}
        value={item.note ?? ""}
        onChangeText={(t) => onChange({ ...item, note: t })}
      />
    </View>
  );
}

export default function TrainScreen() {
  const insets = useSafeAreaInsets();
  const { state, today, saveWorkout, removeWorkout } = useStore();
  const [draft, setDraft] = useState<Workout | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("全部");
  const [equipment, setEquipment] = useState("全部");

  const weight = latestWeight(state.body, 70);

  useEffect(() => {
    if (!draft) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft]);

  const history = useMemo(
    () =>
      [...state.workouts].sort(
        (a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
      ),
    [state.workouts],
  );

  const last14 = useMemo(() => {
    const days: { date: string; count: number; volume: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = shiftDate(today, -i);
      const ws = state.workouts.filter((w) => w.date === d);
      days.push({
        date: d,
        count: ws.length,
        volume: ws.reduce((n, w) => n + volumeOf(w), 0),
      });
    }
    return days;
  }, [state.workouts, today]);

  const weeklyVolume = last14.slice(7).reduce((n, d) => n + d.volume, 0);
  const prevVolume = last14.slice(0, 7).reduce((n, d) => n + d.volume, 0);
  const volumeDelta = prevVolume > 0 ? ((weeklyVolume - prevVolume) / prevVolume) * 100 : null;

  const exerciseList = useMemo(() => {
    const k = q.trim().toLowerCase();
    return SEED_EXERCISES.filter((e) => {
      if (muscle !== "全部" && e.muscle !== muscle) return false;
      if (equipment !== "全部" && e.equipment !== equipment) return false;
      if (!k) return true;
      return (
        e.name.toLowerCase().includes(k) ||
        e.nameEn.toLowerCase().includes(k) ||
        e.muscle.toLowerCase().includes(k) ||
        e.equipment.toLowerCase().includes(k)
      );
    }).slice(0, 300);
  }, [q, muscle, equipment]);

  const addExercise = (ex: Exercise) => {
    setDraft((d) => {
      const base = d ?? blankWorkout(today, "自由训练");
      const isCardio = ex.type === "cardio" || ex.type === "mobility";
      return {
        ...base,
        exercises: [
          ...base.exercises,
          {
            id: uid(),
            exerciseId: ex.id,
            sets: isCardio
              ? [{ reps: 1, weightKg: 0, done: false }]
              : Array.from({ length: 3 }, () => ({ reps: 10, weightKg: 0, done: false })),
          },
        ],
      };
    });
    setPickerOpen(false);
  };

  const startFromPlan = (planId: string) => {
    const plan = PLAN_TEMPLATES.find((p) => p.id === planId);
    if (!plan) return;
    // 按已完成的训练次数决定轮到哪一天，保证循环推进
    const day = plan.days[state.workouts.length % plan.days.length];
    const exercises: WorkoutExercise[] = day.exercises.flatMap((e) => {
      const ex = EX_BY_NAME.get(e.nameEn);
      if (!ex) return [];
      const { reps, note } = parseReps(e.reps);
      return [
        {
          id: uid(),
          exerciseId: ex.id,
          sets: Array.from({ length: e.sets }, () => ({ reps, weightKg: 0, done: false })),
          note,
        },
      ];
    });
    setDraft({ ...blankWorkout(today, `${plan.name} · ${day.title}`), exercises });
    setPlanOpen(false);
  };

  const finish = () => {
    if (!draft) return;
    saveWorkout({ ...draft, endedAt: Date.now() });
    setDraft(null);
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
          paddingBottom: space.xxl * 2,
          paddingHorizontal: space.lg,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="训练"
          sub="记录每一组，进步才有据可依。"
        />
        <View style={styles.actionRow}>
          <Button label="用模板开练" onPress={() => setPlanOpen(true)} />
          <Button
            label="空白训练"
            tone="primary"
            onPress={() => setDraft(blankWorkout(today, "自由训练"))}
          />
        </View>

        {draft && (
          <Card>
            <View style={styles.draftHead}>
              <View style={{ flex: 1, gap: 6 }}>
                <TextInput
                  style={styles.draftTitle}
                  value={draft.title}
                  onChangeText={(t) => setDraft({ ...draft, title: t })}
                />
                <RowSub>
                  {draft.exercises.length} 个动作 ·{" "}
                  {draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)}{" "}
                  组已完成
                </RowSub>
              </View>
              <View style={{ alignItems: "flex-end", gap: space.sm }}>
                <Text style={styles.timer}>{fmtClock(now - draft.startedAt)}</Text>
                <View style={styles.actionRow}>
                  <Button label="＋ 加动作" size="sm" onPress={() => setPickerOpen(true)} />
                  <Button label="完成并保存" size="sm" tone="primary" onPress={finish} />
                  <Button label="放弃" size="sm" tone="ghost" onPress={() => setDraft(null)} />
                </View>
              </View>
            </View>

            <Divider />

            {draft.exercises.length === 0 ? (
              <Empty>先添加一个动作，比如「杠铃卧推」</Empty>
            ) : (
              draft.exercises.map((item, idx) => (
                <SetEditor
                  key={item.id}
                  item={item}
                  exercise={EX_BY_ID.get(item.exerciseId)}
                  onChange={(next) => {
                    const exercises = [...draft.exercises];
                    exercises[idx] = next;
                    setDraft({ ...draft, exercises });
                  }}
                />
              ))
            )}

            <Divider />
            <View style={styles.statRow}>
              <Stat label="总容量" value={Math.round(volumeOf(draft))} unit="kg" />
              <Stat
                label="估算消耗"
                value={estimateWorkoutKcal(draft, weight)}
                unit="kcal"
                color={colors.jadeSoft}
              />
              <Stat
                label="已完成组数"
                value={draft.exercises.reduce(
                  (n, e) => n + e.sets.filter((s) => s.done).length,
                  0,
                )}
              />
            </View>
          </Card>
        )}

        <Card delay={40}>
          <CardTitle>近两周训练负荷</CardTitle>
          <BarChart
            bars={last14.map((d) => ({
              label: String(Number(d.date.slice(8))),
              value: d.volume,
              empty: d.count === 0,
            }))}
            height={140}
          />
          <Divider />
          <View style={styles.statRow}>
            <Stat label="本周容量" value={Math.round(weeklyVolume / 1000)} unit="吨" />
            <Stat
              label="周环比"
              value={
                volumeDelta === null
                  ? "—"
                  : `${volumeDelta > 0 ? "+" : ""}${round(volumeDelta, 1)}%`
              }
              color={
                volumeDelta === null
                  ? undefined
                  : volumeDelta >= 0
                    ? colors.jadeSoft
                    : colors.danger
              }
            />
            <Stat
              label="近两周次数"
              value={last14.filter((d) => d.count > 0).length}
              unit="天"
            />
          </View>
        </Card>

        <Card delay={60}>
          <CardTitle>训练模板</CardTitle>
          {PLAN_TEMPLATES.map((p) => (
            <Row
              key={p.id}
              left={<Chip label={p.tag} tone="accent" />}
              main={
                <>
                  <RowTitle>{p.name}</RowTitle>
                  <RowSub>
                    每周 {p.daysPerWeek} 练 · {p.summary}
                  </RowSub>
                </>
              }
              onPress={() => startFromPlan(p.id)}
            />
          ))}
        </Card>

        <Card delay={80}>
          <CardTitle>训练历史（{history.length}）</CardTitle>
          {history.length === 0 ? (
            <Empty>还没有训练记录，点上面「空白训练」开始</Empty>
          ) : (
            history.slice(0, 30).map((w) => (
              <Row
                key={w.id}
                left={<Chip label={humanDate(w.date)} />}
                main={
                  <>
                    <RowTitle>{w.title}</RowTitle>
                    <RowSub>
                      {w.exercises
                        .map((e) => EX_BY_ID.get(e.exerciseId)?.name ?? "?")
                        .slice(0, 4)
                        .join(" · ")}
                      {w.exercises.length > 4 ? " …" : ""}
                    </RowSub>
                  </>
                }
                value={<RowValue>{Math.round(volumeOf(w))}</RowValue>}
                right={
                  <Button label="✕" size="sm" tone="ghost" onPress={() => removeWorkout(w.id)} />
                }
              />
            ))
          )}
        </Card>
      </ScrollView>

      {pickerOpen && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>选择动作</Text>
              <Button label="关闭" size="sm" tone="ghost" onPress={() => setPickerOpen(false)} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="搜索动作名、肌群或器械…"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
            />
            <ChipRow>
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  tone="jade"
                  active={muscle === m}
                  onPress={() => setMuscle(m)}
                />
              ))}
            </ChipRow>
            <ChipRow>
              {EQUIPMENTS.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  active={equipment === m}
                  onPress={() => setEquipment(m)}
                />
              ))}
            </ChipRow>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {exerciseList.length === 0 && <Empty>没有匹配的动作</Empty>}
              {exerciseList.map((e) => (
                <Row
                  key={e.id}
                  left={<Chip label={e.muscle} tone="jade" />}
                  main={
                    <>
                      <RowTitle>{e.name}</RowTitle>
                      <RowSub>
                        {e.nameEn} · {e.equipment} · {LEVEL_LABEL[e.level]} · MET {e.met}
                      </RowSub>
                    </>
                  }
                  right={<Text style={{ color: colors.muted, fontSize: 16 }}>＋</Text>}
                  onPress={() => addExercise(e)}
                />
              ))}
              {exerciseList.length >= 300 && (
                <Empty>仅显示前 300 个，继续输入关键词可缩小范围</Empty>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {planOpen && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>选择训练模板</Text>
              <Button label="关闭" size="sm" tone="ghost" onPress={() => setPlanOpen(false)} />
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {PLAN_TEMPLATES.map((p) => (
                <View key={p.id} style={styles.planBlock}>
                  <RowTitle>
                    {p.name} · {p.tag}
                  </RowTitle>
                  <RowSub>{p.summary}</RowSub>
                  <View style={{ gap: 4, marginTop: space.sm }}>
                    {p.days.map((d) => (
                      <Text key={d.title} style={styles.planDay}>
                        <Text style={{ color: colors.paperDim }}>{d.title}</Text> ·{" "}
                        {d.exercises
                          .map(
                            (e) => `${EX_BY_NAME.get(e.nameEn)?.name ?? e.nameEn} ${e.sets}×${e.reps}`,
                          )
                          .join("、")}
                      </Text>
                    ))}
                  </View>
                  <Button
                    label="开始"
                    size="sm"
                    tone="primary"
                    style={{ marginTop: space.md, alignSelf: "flex-start" }}
                    onPress={() => startFromPlan(p.id)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  draftHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  draftTitle: {
    fontFamily: font.serif,
    fontSize: 17,
    color: colors.paper,
    padding: 0,
  },
  timer: { fontFamily: font.monoBold, fontSize: 17, color: colors.accentSoft },
  exerciseBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: space.md,
    gap: space.sm,
  },
  exerciseHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  setHeadRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  setHeadCell: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 10.5,
    color: colors.muted,
    textAlign: "center",
  },
  setRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  setIndex: {
    width: 24,
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  setInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ink2,
    color: colors.paper,
    fontFamily: font.mono,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  doneBtn: { width: 46, alignItems: "center", justifyContent: "center", minHeight: 44 },
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
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,10,7,0.86)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.ink2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontFamily: font.serif, fontSize: 17, color: colors.paper },
  planBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingVertical: space.md,
  },
  planDay: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted, lineHeight: 17 },
});
