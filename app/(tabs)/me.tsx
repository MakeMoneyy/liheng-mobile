import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
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
  Notice,
  PageHeader,
  Stat,
} from "../../src/components/ui";
import {
  ACTIVITY_LABEL,
  GOAL_LABEL,
  computeTargets,
  latestWeight,
  round,
} from "../../src/domain/calc";
import type { ActivityLevel, AppState, Goal, Sex } from "../../src/domain/types";
import { useAiSettings } from "../../src/ai/settings";
import { DEFAULT_AI_CONFIG } from "../../src/ai/settings";
import { chat, describeAiError } from "../../src/ai/client";
import { colors, font, radius, space } from "../../src/theme";

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const { state, setProfile, importState, reset } = useStore();
  const [msg, setMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const targets = useMemo(
    () => computeTargets(state.profile, state.body),
    [state.profile, state.body],
  );
  const weight = latestWeight(state.body, 70);

  const exportJson = async () => {
    try {
      const payload = JSON.stringify(state, null, 2);
      await Share.share({
        title: `练衡-备份-${new Date().toISOString().slice(0, 10)}`,
        message: payload,
      });
      setMsg("已生成备份，请在分享面板里选择「存储到文件」或发给自己。");
    } catch {
      setMsg("导出失败，请重试。");
    }
  };

  const doImport = () => {
    try {
      const parsed = JSON.parse(importText) as AppState;
      if (typeof parsed !== "object" || !parsed.profile) throw new Error("格式不正确");
      importState({ ...parsed, schema: 1 });
      setImportText("");
      setImportOpen(false);
      setMsg("导入成功，数据已替换。");
    } catch (e) {
      setMsg(e instanceof Error ? `导入失败：${e.message}` : "导入失败");
    }
  };

  const activityKeys = Object.keys(ACTIVITY_LABEL) as ActivityLevel[];
  const goalKeys = Object.keys(GOAL_LABEL) as Goal[];

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
        <PageHeader title="我的" sub="目标由你的身体数据和训练强度算出来，不是拍脑袋定的。" />

        <Card>
          <CardTitle>基础信息</CardTitle>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>称呼</Text>
            <TextInput
              style={styles.input}
              value={state.profile.name}
              onChangeText={(t) => setProfile({ name: t })}
              placeholder="怎么称呼你"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>性别</Text>
            <ChipRow>
              {(["male", "female"] as Sex[]).map((s) => (
                <Chip
                  key={s}
                  label={s === "male" ? "男" : "女"}
                  active={state.profile.sex === s}
                  onPress={() => setProfile({ sex: s })}
                />
              ))}
            </ChipRow>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>出生年份</Text>
              <TextInput
                style={styles.input}
                value={String(state.profile.birthYear)}
                onChangeText={(t) => setProfile({ birthYear: Number(t) || 1995 })}
                keyboardType="number-pad"
                inputMode="numeric"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>身高 cm</Text>
              <TextInput
                style={styles.input}
                value={String(state.profile.heightCm)}
                onChangeText={(t) => setProfile({ heightCm: Number(t) || 170 })}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>日常活动量</Text>
            <ChipRow>
              {activityKeys.map((k) => (
                <Chip
                  key={k}
                  label={ACTIVITY_LABEL[k]}
                  active={state.profile.activity === k}
                  onPress={() => setProfile({ activity: k })}
                />
              ))}
            </ChipRow>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>目标</Text>
            <ChipRow>
              {goalKeys.map((k) => (
                <Chip
                  key={k}
                  label={GOAL_LABEL[k]}
                  active={state.profile.goal === k}
                  onPress={() =>
                    setProfile({
                      goal: k,
                      weeklyRateKg: k === "cut" ? -0.4 : k === "bulk" ? 0.25 : 0,
                    })
                  }
                />
              ))}
            </ChipRow>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>每周变化速率 kg（减脂为负）</Text>
              <TextInput
                style={styles.input}
                value={String(state.profile.weeklyRateKg)}
                onChangeText={(t) => {
                  const n = Number(t.replace(/[^0-9.\-]/g, ""));
                  setProfile({ weeklyRateKg: Number.isFinite(n) ? n : 0 });
                }}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>蛋白质目标 g/kg 体重</Text>
              <TextInput
                style={styles.input}
                value={String(state.profile.proteinPerKg)}
                onChangeText={(t) => {
                  const n = Number(t.replace(/[^0-9.]/g, ""));
                  setProfile({ proteinPerKg: Number.isFinite(n) && n > 0 ? n : 1.8 });
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            </View>
          </View>

          <Divider />
          <View style={styles.statRow}>
            <Stat label="当前体重" value={round(weight, 1)} unit="kg" />
            <Stat label="基础代谢 BMR" value={targets.bmr} unit="kcal" />
            <Stat label="维持热量 TDEE" value={targets.tdee} unit="kcal" />
          </View>
          <View style={styles.statRow}>
            <Stat label="每日热量目标" value={targets.kcal} unit="kcal" color={colors.gold} />
            <Stat label="蛋白质" value={targets.protein} unit="g" />
            <Stat label="脂肪" value={targets.fat} unit="g" />
            <Stat label="碳水" value={targets.carb} unit="g" />
          </View>
          <Notice>
            BMR 用 Mifflin-St Jeor 公式；TDEE = BMR × 活动系数；再按每周目标变化加减，
            并设安全下限（男 1500 / 女 1200 kcal）。
          </Notice>
        </Card>

        <AiSettingsCard />

        <Card delay={60}>
          <CardTitle>数据</CardTitle>
          <Notice>
            数据保存在本机的 SQLite 里，不上传云端。导出会调起系统分享面板，
            把整份 JSON 发给自己即可作为备份。
          </Notice>
          <View style={styles.actionRow}>
            <Button label="导出全量 JSON" onPress={() => void exportJson()} />
            <Button label="导入 JSON" onPress={() => setImportOpen((v) => !v)} />
          </View>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          {importOpen && (
            <>
              <Text style={styles.fieldLabel}>把备份 JSON 粘贴到这里</Text>
              <TextInput
                style={[styles.input, styles.jsonInput]}
                value={importText}
                onChangeText={setImportText}
                placeholder='{"schema":1,"profile":{...}}'
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.actionRow}>
                <Button label="确认导入（会替换现有数据）" tone="primary" onPress={doImport} />
                <Button
                  label="取消"
                  tone="ghost"
                  onPress={() => {
                    setImportOpen(false);
                    setImportText("");
                  }}
                />
              </View>
            </>
          )}

          <Divider />
          <Notice tone="danger">
            清空会删除本机上的全部训练、饮食与身体记录，且无法恢复。
          </Notice>
          <View style={styles.actionRow}>
            <Button
              label="清空全部数据"
              tone="danger"
              onPress={() => {
                reset();
                setMsg("已清空本机数据。");
              }}
            />
          </View>
        </Card>

        <Card delay={80}>
          <CardTitle>关于</CardTitle>
          <Text style={styles.help}>
            练衡 0.1.0 · 训练 / 饮食 / 身体一体化。原创实现，不使用任何第三方 App 的
            服务端接口、付费数据或素材。动作库来自 free-exercise-db（Unlicense）与自建整理；
            食物营养为公开资料整理与自建录入，仅供参考，以实际包装营养标签为准。
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** AI 设置：填 key、改 baseUrl 与模型、连通性自检 */
function AiSettingsCard() {
  const { config, apiKey, ready, configured, save } = useAiSettings();
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseDraft, setBaseDraft] = useState("");
  const [visionDraft, setVisionDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);

  // 首次读取完成后把值灌进输入框（只灌一次，之后由用户控制）
  const [seeded, setSeeded] = useState(false);
  if (ready && !seeded) {
    setSeeded(true);
    setBaseDraft(config.baseUrl);
    setVisionDraft(config.visionModel);
    setTextDraft(config.textModel);
  }

  const effectiveKey = keyDraft.trim() || apiKey;

  const persist = async () => {
    await save({
      config: {
        baseUrl: baseDraft.trim() || DEFAULT_AI_CONFIG.baseUrl,
        visionModel: visionDraft.trim() || DEFAULT_AI_CONFIG.visionModel,
        textModel: textDraft.trim() || DEFAULT_AI_CONFIG.textModel,
      },
      apiKey: keyDraft.trim() ? keyDraft : undefined,
    });
    setKeyDraft("");
    setStatus("已保存。");
  };

  const test = async () => {
    setTesting(true);
    setStatus("正在测试…");
    try {
      // 用输入框里的值优先：这样用户改完 key 还没点保存也能先验证再存
      await chat({
        apiKey: effectiveKey,
        baseUrl: baseDraft.trim() || DEFAULT_AI_CONFIG.baseUrl,
        model: textDraft.trim() || DEFAULT_AI_CONFIG.textModel,
        messages: [
          { role: "system", content: '只返回 JSON：{"ok": true}' },
          { role: "user", content: "连通性测试" },
        ],
        timeoutMs: 30_000,
      });
      setStatus("连通正常，AI 功能可用。");
    } catch (e) {
      setStatus(describeAiError(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card delay={40}>
      <CardTitle
        right={
          <Chip
            label={configured ? "已配置" : "未配置"}
            tone={configured ? "jade" : "accent"}
          />
        }
      >
        AI 设置
      </CardTitle>
      <Notice>
        默认接智谱 GLM 的 OpenAI 兼容接口，glm-4.6v-flash（视觉）与 glm-4.7-flash（文本）
        目前免费。API Key 存在设备的安全存储里（iOS Keychain / Android Keystore），
        不写进代码也不进安装包。也可以在 bigmodel.cn 申请后填进来，或换成任意
        OpenAI 兼容服务。
      </Notice>

      <View style={{ gap: 6 }}>
        <Text style={styles.fieldLabel}>
          API Key{configured && !keyDraft ? "（已保存，留空则不改）" : ""}
        </Text>
        <TextInput
          style={styles.input}
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={configured ? "••••••••（已保存）" : "粘贴你的 API Key"}
          placeholderTextColor={colors.muted}
          secureTextEntry={!showKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          label={showKey ? "隐藏" : "显示"}
          size="sm"
          tone="ghost"
          onPress={() => setShowKey((v) => !v)}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={styles.fieldLabel}>接口地址 baseUrl</Text>
        <TextInput
          style={styles.input}
          value={baseDraft}
          onChangeText={setBaseDraft}
          placeholder={DEFAULT_AI_CONFIG.baseUrl}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.actionRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>视觉模型（拍照识别）</Text>
          <TextInput
            style={styles.input}
            value={visionDraft}
            onChangeText={setVisionDraft}
            placeholder={DEFAULT_AI_CONFIG.visionModel}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>文本模型（配餐）</Text>
          <TextInput
            style={styles.input}
            value={textDraft}
            onChangeText={setTextDraft}
            placeholder={DEFAULT_AI_CONFIG.textModel}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        <Button label="保存设置" tone="primary" onPress={() => void persist()} />
        <Button
          label="连通性自检"
          loading={testing}
          disabled={!effectiveKey}
          onPress={() => void test()}
        />
      </View>
      {status ? <Text style={styles.msg}>{status}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-end" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  field: { flex: 1, minWidth: 150, gap: 6 },
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
  },
  jsonInput: { minHeight: 150, paddingTop: space.md, fontFamily: font.mono, fontSize: 11 },
  msg: { fontFamily: font.sans, fontSize: 12.5, color: colors.gold, lineHeight: 19 },
  help: { fontFamily: font.sans, fontSize: 12, color: colors.muted, lineHeight: 20 },
});
