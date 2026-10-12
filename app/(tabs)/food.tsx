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
import { useRouter } from "expo-router";
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
  MacroBar,
  PageHeader,
  Row,
  RowSub,
  RowTitle,
  RowValue,
  Stat,
} from "../../src/components/ui";
import { FOOD_CATEGORIES, SEED_FOODS } from "../../src/data/foods";
import type { FoodItem, MealSlot, Nutrition } from "../../src/domain/types";
import { computeTargets, dayTotals, humanDate, round, scaleNutrition } from "../../src/domain/calc";
import { colors, font, radius, space } from "../../src/theme";

const SLOTS: { id: MealSlot; label: string }[] = [
  { id: "breakfast", label: "早餐" },
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
  { id: "snack", label: "加餐" },
];

const SLOT_KCAL: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.32,
  snack: 0.08,
};

interface OpenFoodFactsProduct {
  code?: string;
  product_name?: string;
  product_name_zh?: string;
  brands?: string;
  serving_size?: string;
  quantity?: string;
  nutriments?: Record<string, number>;
}

/** 条码查询：Open Food Facts 开放数据（ODbL），仅作为自建库的补充 */
async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_zh,brands,serving_size,quantity,nutriments`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`查询失败（HTTP ${res.status}）`);
  const json = (await res.json()) as { status?: number; product?: OpenFoodFactsProduct };
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments ?? {};
  const per100: Nutrition = {
    kcal: n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0),
    protein: n.proteins_100g ?? 0,
    fat: n.fat_100g ?? 0,
    carb: n.carbohydrates_100g ?? 0,
    fiber: n.fiber_100g,
    sodiumMg: n.sodium_100g
      ? n.sodium_100g * 1000
      : n.salt_100g
        ? (n.salt_100g * 1000) / 2.5
        : undefined,
  };
  const servingG = p.serving_size
    ? Number(p.serving_size.replace(/[^\d.]/g, "")) || undefined
    : undefined;
  return {
    id: `off:${p.code ?? code}`,
    name: p.product_name_zh || p.product_name || `条码 ${code}`,
    category: "条码查询",
    per100,
    servingG,
    servingLabel: p.serving_size || p.quantity,
    source: `Open Food Facts · ${p.brands ?? "未知品牌"}`,
  };
}

function guessSlot(): MealSlot {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export default function FoodScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, today, addMeal, removeMeal, toggleFavorite, addCustomFood } = useStore();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("全部");
  const [favOnly, setFavOnly] = useState(false);
  const [picking, setPicking] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [creating, setCreating] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [found, setFound] = useState<FoodItem | null>(null);
  const [busy, setBusy] = useState(false);

  const allFoods = useMemo(
    () => [...SEED_FOODS, ...state.customFoods],
    [state.customFoods],
  );
  const targets = useMemo(
    () => computeTargets(state.profile, state.body),
    [state.profile, state.body],
  );
  const totals = dayTotals(state.meals, today);
  const todaysMeals = state.meals.filter((m) => m.date === today);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return allFoods
      .filter((f) => (favOnly ? state.favorites.includes(f.id) : true))
      // 「自定义」按来源筛（id 前缀），因为自建/识别出来的食物会带各自的中文分类，
      // 按 category 筛会漏掉它们
      .filter((f) =>
        cat === "全部"
          ? true
          : cat === "自定义"
            ? !f.id.startsWith("seed:")
            : f.category === cat,
      )
      .filter((f) =>
        !k
          ? true
          : f.name.toLowerCase().includes(k) ||
            (f.alias ?? []).some((a) => a.toLowerCase().includes(k)) ||
            f.category.toLowerCase().includes(k),
      )
      .slice(0, 300);
  }, [allFoods, q, cat, favOnly, state.favorites]);

  const openAdd = (f: FoodItem) => {
    setPicking(f);
    setGrams(String(f.servingG ?? 100));
    setSlot(guessSlot());
  };

  const confirmAdd = () => {
    if (!picking) return;
    const g = Math.max(1, Number(grams) || 0);
    addMeal({
      date: today,
      slot,
      foodId: picking.id,
      name: picking.name,
      grams: g,
      per100: picking.per100,
    });
    setPicking(null);
  };

  const runLookup = async () => {
    setBusy(true);
    setLookupMsg("查询中…");
    setFound(null);
    try {
      const item = await lookupBarcode(code.trim());
      if (!item) {
        setLookupMsg("没有找到这个条码，可以手动新建食物。");
        return;
      }
      setFound(item);
      setLookupMsg("");
    } catch (e) {
      setLookupMsg(e instanceof Error ? e.message : "查询失败，请检查网络。");
    } finally {
      setBusy(false);
    }
  };

  const gramsNum = Math.max(0, Number(grams) || 0);
  const preview = picking ? scaleNutrition(picking.per100, gramsNum) : null;

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
        <PageHeader title="饮食" sub="热量与营养素数据全部本地可用，不设付费墙。" />

        <View style={styles.actionRow}>
          <Button label="📷 拍一餐" tone="primary" onPress={() => router.push("/capture")} />
          <Button label="条码查询" onPress={() => setBarcodeOpen(true)} />
          <Button label="＋ 新建食物" onPress={() => setCreating((v) => !v)} />
        </View>

        {barcodeOpen ? (
          <Card>
            <CardTitle
              right={
                <Button
                  label="收起"
                  size="sm"
                  tone="ghost"
                  onPress={() => {
                    setBarcodeOpen(false);
                    setCode("");
                    setFound(null);
                    setLookupMsg("");
                  }}
                />
              }
            >
              条码查询
            </CardTitle>
            <Text style={styles.help}>
              使用 Open Food Facts 开放数据库（ODbL 许可）按条码查询包装食品。该库以欧美商品为主，
              国内商品覆盖有限，查不到时请手动新建。
            </Text>
            <View style={styles.actionRow}>
              <TextInput
                style={[styles.input, { flex: 1, minWidth: 180 }]}
                placeholder="输入条码，例如 6901234567890"
                placeholderTextColor={colors.muted}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                inputMode="numeric"
              />
              <Button
                label="查询"
                tone="primary"
                loading={busy}
                disabled={!code.trim()}
                onPress={() => void runLookup()}
              />
            </View>
            {lookupMsg ? <Empty>{lookupMsg}</Empty> : null}
            {found && (
              <>
                <Divider />
                <Row
                  main={
                    <>
                      <RowTitle>{found.name}</RowTitle>
                      <RowSub>
                        每 100g 蛋白 {round(found.per100.protein, 1)}g · 脂肪{" "}
                        {round(found.per100.fat, 1)}g · 碳水 {round(found.per100.carb, 1)}g
                      </RowSub>
                    </>
                  }
                  value={<RowValue>{Math.round(found.per100.kcal)}</RowValue>}
                />
                <View style={styles.actionRow}>
                  <Button label="添加这一餐" tone="primary" onPress={() => openAdd(found)} />
                  <Button
                    label="存到我的食物库"
                    onPress={() => {
                      addCustomFood({
                        name: found.name,
                        category: "条码查询",
                        per100: found.per100,
                        servingG: found.servingG,
                        servingLabel: found.servingLabel,
                      });
                      setLookupMsg("已加入我的食物库");
                    }}
                  />
                </View>
              </>
            )}
          </Card>
        ) : null}

        {creating && <NewFoodCard onDone={() => setCreating(false)} />}

        <Card delay={40}>
          <CardTitle
            right={
              <Chip
                label={`${Math.round(totals.kcal)} / ${targets.kcal} kcal`}
                tone="accent"
              />
            }
          >
            {humanDate(today)}摄入
          </CardTitle>
          <View style={styles.macroRow}>
            <MacroBar label="蛋白质" value={totals.protein} target={targets.protein} />
            <MacroBar label="碳水" value={totals.carb} target={targets.carb} tone="jade" />
            <MacroBar label="脂肪" value={totals.fat} target={targets.fat} tone="jade" />
            <MacroBar
              label="膳食纤维"
              value={totals.fiber ?? 0}
              target={targets.fiber}
              tone="jade"
            />
          </View>

          <Divider />

          {todaysMeals.length === 0 ? (
            <Empty>今天还没有饮食记录，从下面的食物库添加一条</Empty>
          ) : (
            SLOTS.map((s) => {
              const items = todaysMeals.filter((m) => m.slot === s.id);
              if (items.length === 0) return null;
              const kcal = items.reduce((n, m) => n + (m.per100.kcal * m.grams) / 100, 0);
              const target = targets.kcal * SLOT_KCAL[s.id];
              return (
                <View key={s.id} style={{ gap: space.sm }}>
                  <View style={styles.slotHead}>
                    <Text style={styles.slotLabel}>{s.label}</Text>
                    <Text style={styles.slotKcal}>
                      {Math.round(kcal)} / {Math.round(target)} kcal
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: `${Math.min(100, target > 0 ? (kcal / target) * 100 : 0)}%`,
                          backgroundColor: kcal > target * 1.1 ? colors.danger : colors.accent,
                        },
                      ]}
                    />
                  </View>
                  {items.map((m) => (
                    <Row
                      key={m.id}
                      main={
                        <>
                          <RowTitle>{m.name}</RowTitle>
                          <RowSub>
                            {round(m.grams)}g · 蛋白{" "}
                            {round((m.per100.protein * m.grams) / 100, 1)}g · 碳水{" "}
                            {round((m.per100.carb * m.grams) / 100, 1)}g · 脂肪{" "}
                            {round((m.per100.fat * m.grams) / 100, 1)}g
                          </RowSub>
                        </>
                      }
                      value={
                        <RowValue>
                          {Math.round((m.per100.kcal * m.grams) / 100)}
                        </RowValue>
                      }
                      right={
                        <Button
                          label="✕"
                          size="sm"
                          tone="ghost"
                          onPress={() => removeMeal(m.id)}
                        />
                      }
                    />
                  ))}
                </View>
              );
            })
          )}
        </Card>

        <Card delay={60}>
          <CardTitle right={<Text style={styles.count}>{allFoods.length} 条</Text>}>
            食物库
          </CardTitle>
          <View style={styles.actionRow}>
            <TextInput
              style={[styles.input, { flex: 1, minWidth: 180 }]}
              placeholder="搜索食物，例如「鸡胸」「米饭」「拿铁」…"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
            />
            <Button
              label={favOnly ? "★ 已收藏" : "☆ 收藏"}
              tone={favOnly ? "primary" : "default"}
              onPress={() => setFavOnly((v) => !v)}
            />
          </View>
          <ChipRow>
            {FOOD_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                active={cat === c}
                onPress={() => setCat(c)}
              />
            ))}
            {state.customFoods.length > 0 && (
              <Chip
                label="自定义"
                active={cat === "自定义"}
                onPress={() => setCat("自定义")}
              />
            )}
          </ChipRow>
          {list.length === 0 && <Empty>没有匹配的食物，试试新建一个</Empty>}
          {list.map((f) => (
            <Row
              key={f.id}
              left={
                <Button
                  label={state.favorites.includes(f.id) ? "★" : "☆"}
                  size="sm"
                  tone="ghost"
                  onPress={() => toggleFavorite(f.id)}
                />
              }
              main={
                <>
                  <RowTitle>{f.name}</RowTitle>
                  <RowSub>
                    {f.category} · 每 100g 蛋白 {round(f.per100.protein, 1)}g · 脂肪{" "}
                    {round(f.per100.fat, 1)}g · 碳水 {round(f.per100.carb, 1)}g
                  </RowSub>
                </>
              }
              value={<RowValue>{Math.round(f.per100.kcal)}</RowValue>}
              right={<Button label="添加" size="sm" tone="primary" onPress={() => openAdd(f)} />}
            />
          ))}
          {list.length >= 300 && <Empty>仅显示前 300 条，继续输入关键词可缩小范围</Empty>}
        </Card>
      </ScrollView>

      {picking && preview && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                添加：{picking.name}
              </Text>
              <Button label="关闭" size="sm" tone="ghost" onPress={() => setPicking(null)} />
            </View>

            <View style={styles.actionRow}>
              <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
                <Text style={styles.fieldLabel}>份量（克）</Text>
                <TextInput
                  style={styles.input}
                  value={grams}
                  onChangeText={setGrams}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                />
              </View>
              <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
                <Text style={styles.fieldLabel}>餐次</Text>
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
              </View>
            </View>

            <ChipRow>
              {picking.servingG ? (
                <Chip
                  label={`1${picking.servingLabel ?? "份"} ≈ ${picking.servingG}g`}
                  onPress={() => setGrams(String(picking.servingG))}
                />
              ) : null}
              {[50, 100, 200, 300].map((g) => (
                <Chip key={g} label={`${g}g`} onPress={() => setGrams(String(g))} />
              ))}
            </ChipRow>

            <Divider />
            <View style={styles.statRow}>
              <Stat label="热量" value={Math.round(preview.kcal)} unit="kcal" />
              <Stat label="蛋白质" value={round(preview.protein, 1)} unit="g" />
              <Stat label="碳水" value={round(preview.carb, 1)} unit="g" />
              <Stat label="脂肪" value={round(preview.fat, 1)} unit="g" />
            </View>

            <View style={[styles.actionRow, { justifyContent: "flex-end" }]}>
              <Button label="取消" onPress={() => setPicking(null)} />
              <Button
                label={`加入${SLOTS.find((s) => s.id === slot)?.label}`}
                tone="primary"
                onPress={confirmAdd}
              />
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** 新建自定义食物。支持按每 100g 或按每份录入，自动换算。 */
function NewFoodCard({ onDone }: { onDone: () => void }) {
  const { addCustomFood } = useStore();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("自定义");
  const [per, setPer] = useState<"100g" | "serving">("100g");
  const [servingG, setServingG] = useState("100");
  const [servingLabel, setServingLabel] = useState("一份");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carb, setCarb] = useState("");
  const [fiber, setFiber] = useState("");

  const sg = Math.max(1, Number(servingG) || 100);
  const scale = per === "serving" ? 100 / sg : 1;
  const num = (v: string) => Number(v) || 0;
  const valid = name.trim().length > 0 && num(kcal) > 0;

  const save = () => {
    addCustomFood({
      name: name.trim(),
      category: category.trim() || "自定义",
      per100: {
        kcal: num(kcal) * scale,
        protein: num(protein) * scale,
        fat: num(fat) * scale,
        carb: num(carb) * scale,
        fiber: num(fiber) * scale,
      },
      servingG: sg,
      servingLabel,
    });
    onDone();
  };

  const fields: { label: string; value: string; set: (v: string) => void }[] = [
    { label: "热量 kcal", value: kcal, set: setKcal },
    { label: "蛋白质 g", value: protein, set: setProtein },
    { label: "脂肪 g", value: fat, set: setFat },
    { label: "碳水 g", value: carb, set: setCarb },
    { label: "膳食纤维 g", value: fiber, set: setFiber },
  ];

  return (
    <Card>
      <CardTitle
        right={<Button label="收起" size="sm" tone="ghost" onPress={onDone} />}
      >
        新建食物
      </CardTitle>

      <View style={{ gap: 6 }}>
        <Text style={styles.fieldLabel}>名称</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="例如：自制鸡胸沙拉"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.actionRow}>
        <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
          <Text style={styles.fieldLabel}>分类</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
          <Text style={styles.fieldLabel}>营养标注基准</Text>
          <ChipRow>
            <Chip label="每 100 克" active={per === "100g"} onPress={() => setPer("100g")} />
            <Chip label="每份" active={per === "serving"} onPress={() => setPer("serving")} />
          </ChipRow>
        </View>
      </View>

      <View style={styles.actionRow}>
        <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
          <Text style={styles.fieldLabel}>份量（克）</Text>
          <TextInput
            style={styles.input}
            value={servingG}
            onChangeText={setServingG}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        </View>
        <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
          <Text style={styles.fieldLabel}>份量名称</Text>
          <TextInput
            style={styles.input}
            value={servingLabel}
            onChangeText={setServingLabel}
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>

      {fields.map((f) => (
        <View key={f.label} style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <TextInput
            style={styles.input}
            value={f.value}
            onChangeText={f.set}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
        </View>
      ))}

      {per === "serving" && (
        <Text style={styles.help}>
          已按份量 {sg}g 换算为每 100g：热量 {(num(kcal) * scale).toFixed(1)} kcal、蛋白{" "}
          {(num(protein) * scale).toFixed(1)}g。
        </Text>
      )}

      <View style={[styles.actionRow, { justifyContent: "flex-end" }]}>
        <Button label="取消" onPress={onDone} />
        <Button label="保存并添加" tone="primary" disabled={!valid} onPress={save} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  macroRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
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
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 19, color: colors.muted },
  count: { fontFamily: font.sans, fontSize: 12, color: colors.muted },
  fieldLabel: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },
  slotHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  slotLabel: { fontFamily: font.sansMedium, fontSize: 14, color: colors.paper },
  slotKcal: { fontFamily: font.mono, fontSize: 11.5, color: colors.muted },
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: radius.pill },
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
    gap: space.sm,
  },
  sheetTitle: { fontFamily: font.serif, fontSize: 17, color: colors.paper, flex: 1 },
});
