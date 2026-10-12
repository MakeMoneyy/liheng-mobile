import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors, font } from "../../src/theme";

/** tab 图标沿用 Web 版侧的几何符号，保持同一套视觉语言 */
const ICONS: Record<string, string> = {
  index: "◉",
  train: "⛓",
  food: "◍",
  health: "◈",
  me: "☰",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.ink2,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: font.sans, fontSize: 11 },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18 }}>{ICONS[route.name] ?? "●"}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: "今日" }} />
      <Tabs.Screen name="train" options={{ title: "训练" }} />
      <Tabs.Screen name="food" options={{ title: "饮食" }} />
      <Tabs.Screen name="health" options={{ title: "身体" }} />
      <Tabs.Screen name="me" options={{ title: "我的" }} />
    </Tabs>
  );
}
