import { Platform } from "react-native";

/**
 * 视觉方向沿用 Web 版：深墨绿底 + 米黄纸感 + 朱砂强调，像一本训练账本。
 */
export const colors = {
  ink: "#0f120d",
  ink2: "#171b14",
  ink3: "#1f251b",
  line: "#2c3327",
  paper: "#f4efe3",
  paperDim: "#d9d2c1",
  muted: "#8d9184",
  accent: "#d9541f",
  accentSoft: "#f0a271",
  jade: "#4f9c6b",
  jadeSoft: "#86c79c",
  gold: "#d8b25c",
  danger: "#c4453a",
  /** 卡片填充，比 ink2 略亮一点点，用来区分层次 */
  card: "rgba(31,37,27,0.72)",
  cardSolid: "#1f251b",
  hairline: "rgba(244,239,227,0.10)",
  track: "rgba(244,239,227,0.07)",
} as const;

export const radius = {
  sm: 9,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
} as const;

/**
 * 字体族名在加载后由 useFonts 注入。字体未就绪时回落到系统字体，
 * 避免首帧空白。
 */
export const font = {
  serif: "NotoSerifSC_700Bold",
  sans: "NotoSansSC_400Regular",
  sansMedium: "NotoSansSC_500Medium",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
} as const;

/** 数字统一走等宽字体，保证对齐 */
export const numFont = Platform.select({
  default: font.mono,
});

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
} as const;
