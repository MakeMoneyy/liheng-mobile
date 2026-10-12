import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { colors, font, radius, shadow, space } from "../theme";

/* ------------------------------ 基础容器 ------------------------------- */

export function Card({
  children,
  style,
  delay = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 入场动画的错峰延迟，营造自上而下的层次 */
  delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        styles.card,
        shadow.card,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function CardTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.pageHead}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {sub ? <Text style={styles.pageSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

/* -------------------------------- 按钮 --------------------------------- */

export function Button({
  label,
  onPress,
  tone = "default",
  size = "md",
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  tone?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle =
    tone === "primary"
      ? styles.btnPrimary
      : tone === "ghost"
        ? styles.btnGhost
        : tone === "danger"
          ? styles.btnDanger
          : styles.btnDefault;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        size === "sm" && styles.btnSm,
        toneStyle,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.paper} />
      ) : (
        <Text
          style={[
            styles.btnText,
            size === "sm" && styles.btnTextSm,
            tone === "primary" && { color: colors.ink, fontWeight: "700" },
            tone === "danger" && { color: colors.danger },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  tone = "default",
  active,
  onPress,
}: {
  label: string;
  tone?: "default" | "jade" | "accent" | "gold";
  active?: boolean;
  onPress?: () => void;
}) {
  const toneColor =
    tone === "jade"
      ? colors.jadeSoft
      : tone === "accent"
        ? colors.accentSoft
        : tone === "gold"
          ? colors.gold
          : colors.paperDim;
  const content = (
    <Text
      style={[
        styles.chipText,
        { color: active ? colors.ink : toneColor },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
  if (!onPress) {
    return (
      <View style={[styles.chip, { borderColor: `${toneColor}55` }]}>{content}</View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: active ? toneColor : `${toneColor}55` },
        active && { backgroundColor: toneColor },
        pressed && { opacity: 0.75 },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** 横向可滚动的筛选条 */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  );
}

/* ------------------------------- 数据展示 ------------------------------ */

export function Stat({
  label,
  value,
  unit,
  note,
  color,
  style,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stat, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>
        {value}
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </Text>
      {note ? <Text style={styles.statNote}>{note}</Text> : null}
    </View>
  );
}

export function MacroBar({
  label,
  value,
  target,
  unit = "g",
  tone = "accent",
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  tone?: "accent" | "jade";
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.05;
  return (
    <View style={styles.macro}>
      <View style={styles.macroTop}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          <Text style={{ fontFamily: font.monoBold }}>{Math.round(value)}</Text>
          <Text style={styles.macroTarget}>
            {" / "}
            {Math.round(target)} {unit}
          </Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.trackFill,
            {
              width: `${pct}%`,
              backgroundColor: over
                ? colors.danger
                : tone === "jade"
                  ? colors.jade
                  : colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

/** 净摄入环，用 SVG 描边 + strokeDasharray 实现 */
export function Ring({
  value,
  target,
  label,
  size = 168,
}: {
  value: number;
  target: number;
  label: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const over = target > 0 && value > target;
  const color = over ? colors.danger : colors.accent;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.track}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * pct} ${c}`}
          />
        </G>
      </Svg>
      <View style={StyleSheet.absoluteFill as StyleProp<ViewStyle>}>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringValue, over && { color: colors.danger }]}>
            {Math.round(value)}
          </Text>
          <Text style={styles.ringLabel}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------- 图表 --------------------------------- */

export interface Series {
  points: { x: string; y: number }[];
  color: string;
  label: string;
  dashed?: boolean;
}

/** 极简折线图。与 Web 版 LineChart 相同的坐标算法，改用 react-native-svg。 */
export function LineChart({
  series,
  height = 210,
  unit = "",
}: {
  series: Series[];
  height?: number;
  unit?: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <Empty>暂无数据，记录两次以上即可看到趋势</Empty>;
  }

  const W = 720;
  const H = height;
  const pad = { l: 46, r: 16, t: 18, b: 30 };

  const xs = Array.from(new Set(all.map((p) => p.x))).sort();
  const ys = all.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = maxY - minY || 1;
  const lo = minY - spanY * 0.15;
  const hi = maxY + spanY * 0.15;

  const px = (x: string) => {
    const i = xs.indexOf(x);
    return pad.l + (xs.length === 1 ? 0 : (i / (xs.length - 1)) * (W - pad.l - pad.r));
  };
  const py = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);
  const labelStep = xs.length > 7 ? Math.ceil(xs.length / 6) : 1;

  return (
    <>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {tickVals.map((v, i) => (
          <G key={`t${i}`}>
            <Line
              x1={pad.l}
              x2={W - pad.r}
              y1={py(v)}
              y2={py(v)}
              stroke={colors.line}
              strokeWidth={1}
              strokeDasharray="2 5"
            />
            <SvgText
              x={8}
              y={py(v) + 4}
              fill={colors.muted}
              fontSize={11}
              fontFamily={font.mono}
            >
              {v.toFixed(1)}
            </SvgText>
          </G>
        ))}

        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x.localeCompare(b.x));
          const d = pts
            .map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x)} ${py(p.y)}`)
            .join(" ");
          return (
            <G key={s.label}>
              {/* react-native-svg 15 移除了 DashPathEffect 子组件，虚线改用 strokeDasharray */}
              <Path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "6 5" : undefined}
              />
              {pts.map((p) => (
                <Circle key={p.x} cx={px(p.x)} cy={py(p.y)} r={3.2} fill={s.color} />
              ))}
            </G>
          );
        })}

        {xs.map((x, i) => {
          if (i % labelStep !== 0) return null;
          const [, m, d] = x.split("-");
          return (
            <SvgText
              key={x}
              x={px(x)}
              y={H - 8}
              fill={colors.muted}
              fontSize={11}
              textAnchor="middle"
              fontFamily={font.mono}
            >
              {`${Number(m)}/${Number(d)}`}
            </SvgText>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
        {unit ? <Text style={styles.legendText}>单位：{unit}</Text> : null}
      </View>
    </>
  );
}

/** 近 7 天摄入 / 近两周负荷共用的柱状图 */
export function BarChart({
  bars,
  height = 150,
}: {
  bars: { label: string; value: number; over?: boolean; empty?: boolean }[];
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height }}>
      {bars.map((b, i) => {
        const h = Math.max((b.value / max) * (height - 30), b.empty ? 2 : 4);
        return (
          <View key={`${b.label}-${i}`} style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.barValue}>{b.value > 0 ? Math.round(b.value) : ""}</Text>
            <View
              style={{
                width: "100%",
                height: h,
                borderRadius: 6,
                backgroundColor: b.over
                  ? colors.danger
                  : b.empty
                    ? colors.track
                    : colors.accent,
              }}
            />
            <Text style={styles.barLabel}>{b.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* -------------------------------- 表单 --------------------------------- */

export function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Row({
  left,
  main,
  value,
  right,
  onPress,
}: {
  left?: ReactNode;
  main: ReactNode;
  value?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.rowInner}>
      {left}
      <View style={styles.rowMain}>{main}</View>
      {value}
      {right}
    </View>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  );
}

export function RowTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.rowTitle} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function RowSub({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.rowSub} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function RowValue({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Text style={[styles.rowValue, color ? { color } : undefined]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[{ fontFamily: font.mono }, style]}>{children}</Text>;
}

/** 角标 / 提示条 */
export function Notice({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? colors.danger : tone === "warn" ? colors.gold : colors.muted;
  return (
    <View style={[styles.notice, { borderLeftColor: color }]}>
      <Text style={[styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.lg,
    gap: space.md,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  cardTitle: {
    fontFamily: font.serif,
    fontSize: 17,
    color: colors.paper,
    flexShrink: 1,
  },
  pageHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    marginBottom: space.md,
  },
  pageTitle: { fontFamily: font.serif, fontSize: 26, color: colors.paper },
  pageSub: {
    fontFamily: font.sans,
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 19,
  },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: space.sm },
  empty: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.muted,
    paddingVertical: space.md,
    lineHeight: 20,
  },

  btn: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnSm: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnDefault: { backgroundColor: colors.ink3 },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  btnDanger: { backgroundColor: "transparent", borderColor: `${colors.danger}88` },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.8 },
  btnText: { fontFamily: font.sansMedium, fontSize: 14, color: colors.paper },
  btnTextSm: { fontSize: 12.5 },

  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "transparent",
  },
  chipText: { fontFamily: font.sans, fontSize: 12 },
  chipRow: { gap: space.sm, paddingVertical: 2, paddingRight: space.md },

  stat: { flex: 1, minWidth: 96, gap: 3 },
  statLabel: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },
  statValue: { fontFamily: font.monoBold, fontSize: 20, color: colors.paper },
  statUnit: { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  statNote: { fontFamily: font.sans, fontSize: 11, color: colors.muted, lineHeight: 16 },

  macro: { flex: 1, minWidth: 130, gap: 6 },
  macroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  macroLabel: { fontFamily: font.sans, fontSize: 12, color: colors.muted },
  macroValue: { fontFamily: font.sans, fontSize: 12, color: colors.paper },
  macroTarget: { fontFamily: font.sans, fontSize: 11, color: colors.muted },
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: radius.pill },

  ringCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  ringValue: { fontFamily: font.monoBold, fontSize: 30, color: colors.paper },
  ringLabel: { fontFamily: font.sans, fontSize: 11, color: colors.muted, marginTop: 4 },

  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    marginTop: space.sm,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },

  barValue: { fontFamily: font.mono, fontSize: 10, color: colors.muted, marginBottom: 3 },
  barLabel: { fontFamily: font.mono, fontSize: 10, color: colors.muted, marginTop: 5 },

  field: { flex: 1, minWidth: 140, gap: 6 },
  fieldLabel: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted },

  row: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingVertical: space.md,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: font.sansMedium, fontSize: 14, color: colors.paper },
  rowSub: { fontFamily: font.sans, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  rowValue: { fontFamily: font.mono, fontSize: 14, color: colors.paper },

  notice: {
    borderLeftWidth: 3,
    paddingLeft: space.md,
    paddingVertical: 2,
  },
  noticeText: { fontFamily: font.sans, fontSize: 12, lineHeight: 19 },
});
