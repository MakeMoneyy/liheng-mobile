import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useStore } from "../src/store";
import {
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  Divider,
  Notice,
  PageHeader,
  RowSub,
  RowTitle,
  RowValue,
  Stat,
} from "../src/components/ui";
import { captureMealPhoto, CaptureError, type CaptureSource } from "../src/ai/capture";
import { recognizeMeal } from "../src/ai/vision";
import { describeAiError } from "../src/ai/client";
import { useAiSettings } from "../src/ai/settings";
import { matchRecognizedItems } from "../src/domain/match";
import { SEED_FOODS } from "../src/data/foods";
import { scaleNutrition } from "../src/domain/calc";
import type { FoodItem, MealSlot, RecognizedItem } from "../src/domain/types";
import { colors, font, radius, space } from "../src/theme";

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: "breakfast", label: "早餐" },
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
  { id: "snack", label: "加餐" },
];

function guessSlot(): MealSlot {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

type Stage = "idle" | "analyzing" | "review" | "saving";

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, today, addMeals, addCustomFoods } = useStore();
  const { config, apiKey, ready, configured } = useAiSettings();

  const [stage, setStage] = useState<Stage>("idle");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [items, setItems] = useState<RecognizedItem[]>([]);
  const [note, setNote] = useState("");
  const [slot, setSlot] = useState<MealSlot>(guessSlot);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const library = useMemo<FoodItem[]>(
    () => [...SEED_FOODS, ...state.customFoods],
    [state.customFoods],
  );

  const total = useMemo(
    () => items.reduce((n, i) => n + scaleNutrition(i.per100, i.grams).kcal, 0),
    [items],
  );

  const runRecognition = async (source: CaptureSource) => {
    setError("");
    try {
      setProgress("正在准备照片…");
      setStage("analyzing");
      const shot = await captureMealPhoto(source);
      setPhotoUri(shot.uri);

      setProgress("AI 正在识别食物…");
      const meal = await recognizeMeal({
        apiKey,
        baseUrl: config.baseUrl,
        model: config.visionModel,
        dataUrl: shot.dataUrl,
        hint,
      });

      // 命中本地库的用本地权威值覆盖 AI 估算，保证历史数据可比
      setItems(matchRecognizedItems(meal.items, library));
      setNote(meal.note ?? "");
      setStage("review");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (e) {
      if (e instanceof CaptureError && e.kind === "cancelled") {
        setStage("idle");
        return;
      }
      setError(e instanceof CaptureError ? e.message : describeAiError(e));
      setStage("idle");
    } finally {
      setProgress("");
    }
  };

  const updateGrams = (index: number, grams: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, grams: Math.max(1, grams) } : it)),
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const confirm = () => {
    if (items.length === 0) return;
    setStage("saving");

    // 未命中本地库的先落进自定义食物库，保证这条记录以后还能引用到
    const newOnes = items.filter((i) => i.isNew);
    const created =
      newOnes.length > 0
        ? addCustomFoods(
            newOnes.map((i) => ({
              name: i.name,
              category: "菜肴",
              per100: i.per100,
              source: "AI 识别",
            })),
          )
        : [];
    const idByName = new Map(created.map((c, i) => [newOnes[i].name, c.id]));

    addMeals(
      items.map((i) => ({
        date: today,
        slot,
        foodId: i.matchedFoodId ?? idByName.get(i.name),
        name: i.name,
        grams: Math.round(i.grams),
        per100: i.per100,
      })),
    );

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    router.back();
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="拍一餐"
          sub="拍下来，AI 逐项拆出食物与克数，你确认份量后再记入账本。"
          right={<Button label="关闭" size="sm" tone="ghost" onPress={() => router.back()} />}
        />

        {!ready ? (
          <Card>
            <ActivityIndicator color={colors.accent} />
          </Card>
        ) : !configured ? (
          <Card>
            <CardTitle>先配置 AI</CardTitle>
            <Notice tone="warn">
              拍照识别需要一个 AI 服务的 API Key。默认接智谱 GLM，视觉模型
              glm-4.6v-flash 目前免费。到「我的 → AI 设置」里填一次即可。
            </Notice>
            <Button
              label="去 AI 设置"
              tone="primary"
              onPress={() => router.replace("/me")}
            />
          </Card>
        ) : (
          <>
            {(stage === "idle" || stage === "analyzing") && (
              <Card>
                <CardTitle>选择照片来源</CardTitle>
                <Notice>
                  识别结果会先与本地食物库匹配：匹配上的用本地权威营养值，
                  匹配不上的用 AI 估算值并自动存进你的自定义食物库。
                </Notice>
                <View style={styles.actionRow}>
                  <Button
                    label="📷 拍照"
                    tone="primary"
                    disabled={stage === "analyzing"}
                    onPress={() => void runRecognition("camera")}
                  />
                  <Button
                    label="🖼 从相册选"
                    disabled={stage === "analyzing"}
                    onPress={() => void runRecognition("library")}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>补充说明（可选，能显著提高准确度）</Text>
                  <TextInput
                    style={styles.input}
                    value={hint}
                    onChangeText={setHint}
                    placeholder="例如：米饭大概两碗，菜是清炒的，油不多"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </View>
              </Card>
            )}

            {stage === "analyzing" && (
              <Card>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
                ) : null}
                <View style={styles.analyzing}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.analyzingText}>{progress || "正在处理…"}</Text>
                </View>
              </Card>
            )}

            {(stage === "review" || stage === "saving") && (
              <>
                <Card>
                  <CardTitle
                    right={
                      <Button
                        label="重新拍"
                        size="sm"
                        onPress={() => {
                          setItems([]);
                          setNote("");
                          setStage("idle");
                        }}
                      />
                    }
                  >
                    识别结果
                  </CardTitle>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
                  ) : null}
                  <View style={styles.statRow}>
                    <Stat label="合计热量" value={Math.round(total)} unit="kcal" color={colors.gold} />
                    <Stat label="识别项数" value={items.length} unit="项" />
                  </View>
                  {note ? <Notice>{note}</Notice> : null}

                  <Divider />

                  {items.length === 0 ? (
                    <Notice tone="warn">项目都被删光了，点「重新拍」或返回手动录入。</Notice>
                  ) : (
                    items.map((item, i) => {
                      const n = scaleNutrition(item.per100, item.grams);
                      return (
                        <View key={`${item.name}-${i}`} style={styles.itemBlock}>
                          <View style={styles.itemHead}>
                            <View style={{ flex: 1 }}>
                              <RowTitle>{item.name}</RowTitle>
                              <RowSub>
                                {item.matchedName
                                  ? `已匹配本地库：${item.matchedName}`
                                  : "本地库没有，按 AI 估算值记录并存入自定义食物"}
                                {" · "}置信度 {Math.round(item.confidence * 100)}%
                              </RowSub>
                            </View>
                            <RowValue>{Math.round(n.kcal)}</RowValue>
                            <Button
                              label="✕"
                              size="sm"
                              tone="ghost"
                              onPress={() => removeItem(i)}
                            />
                          </View>

                          <View style={styles.actionRow}>
                            <View style={{ flex: 1, minWidth: 130, gap: 6 }}>
                              <Text style={styles.fieldLabel}>份量（克）</Text>
                              <TextInput
                                style={styles.input}
                                value={String(Math.round(item.grams))}
                                onChangeText={(t) =>
                                  updateGrams(i, Number(t.replace(/[^0-9.]/g, "")) || 0)
                                }
                                keyboardType="decimal-pad"
                                inputMode="decimal"
                                selectTextOnFocus
                              />
                            </View>
                            <View style={{ flex: 2, minWidth: 180, gap: 6 }}>
                              <Text style={styles.fieldLabel}>快捷份量</Text>
                              <ChipRow>
                                {[50, 100, 150, 200, 300].map((g) => (
                                  <Chip
                                    key={g}
                                    label={`${g}g`}
                                    active={Math.round(item.grams) === g}
                                    onPress={() => updateGrams(i, g)}
                                  />
                                ))}
                              </ChipRow>
                            </View>
                          </View>

                          <RowSub>
                            蛋白 {Math.round(n.protein)}g · 碳水 {Math.round(n.carb)}g · 脂肪{" "}
                            {Math.round(n.fat)}g
                          </RowSub>
                        </View>
                      );
                    })
                  )}
                </Card>

                <Card delay={40}>
                  <CardTitle>记到哪一餐</CardTitle>
                  <ChipRow>
                    {SLOTS.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.label}
                        active={slot === s.id}
                        onPress={() => setSlot(s.id)}
                      />
                    ))}
                  </ChipRow>
                  <Notice>
                    热量与宏量都按本地数值计算，不采用 AI 报出的数字。
                    高油高脂的菜 AI 容易低估，确认页可以手动把克数调大。
                  </Notice>
                  <View style={styles.actionRow}>
                    <Button
                      label={`记入${SLOTS.find((s) => s.id === slot)?.label}（${Math.round(total)} kcal）`}
                      tone="primary"
                      loading={stage === "saving"}
                      disabled={items.length === 0}
                      onPress={confirm}
                    />
                    <Button
                      label="手动录入"
                      tone="ghost"
                      onPress={() => router.replace("/food")}
                    />
                  </View>
                </Card>
              </>
            )}

            {error ? (
              <Card>
                <Notice tone="danger">{error}</Notice>
                <View style={styles.actionRow}>
                  <Button
                    label="再试一次"
                    onPress={() => void runRecognition("camera")}
                  />
                  <Button
                    label="手动录入"
                    tone="ghost"
                    onPress={() => router.replace("/food")}
                  />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  fieldLabel: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },
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
    paddingVertical: space.sm,
  },
  preview: { width: "100%", height: 200, borderRadius: radius.md },
  analyzing: { flexDirection: "row", alignItems: "center", gap: space.md },
  analyzingText: { fontFamily: font.sans, fontSize: 13, color: colors.paperDim },
  itemBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: space.md,
    gap: space.sm,
  },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
