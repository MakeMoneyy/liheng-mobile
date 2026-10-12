import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// 按字重逐个深引入：包根 index 会把全部字重都 require 进来，
// 中文字体每个字重十几 MB，全量打包会让安装包直接超过应用商店上限。
import { NotoSansSC_400Regular } from "@expo-google-fonts/noto-sans-sc/400Regular";
import { NotoSansSC_500Medium } from "@expo-google-fonts/noto-sans-sc/500Medium";
import { NotoSerifSC_700Bold } from "@expo-google-fonts/noto-serif-sc/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import * as SplashScreen from "expo-splash-screen";
import { StoreProvider, useStore } from "../src/store";
import { colors, font } from "../src/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Loading() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingMark}>衡</Text>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.loadingText}>正在打开账本…</Text>
    </View>
  );
}

/** 等 SQLite 首次读取完成再渲染，避免页面闪一下空数据 */
function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useStore();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);
  if (loading) return <Loading />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSerifSC_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  // 字体没加载完也放行，只是回落到系统字体，不阻塞使用
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="light" />
        <Gate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ink },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="capture"
              options={{ presentation: "modal", animation: "slide_from_bottom" }}
            />
            <Stack.Screen
              name="plan"
              options={{ presentation: "modal", animation: "slide_from_bottom" }}
            />
          </Stack>
        </Gate>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingMark: {
    fontFamily: font.serif,
    fontSize: 54,
    color: colors.accent,
  },
  loadingText: { fontFamily: font.sans, fontSize: 13, color: colors.muted },
});
