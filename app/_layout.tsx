import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          // the screen underneath must leave the accessibility tree, or a
          // screen reader reads the wrong screen (BUG-003)
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
        {/* headerShown stays false: the native header rendered an empty <h1>
            and a "(tabs), back" link (BUG-002). The screen provides its own
            heading and back control. */}
        <Stack.Screen name="tool/[slug]" />
      </Stack>
    </SafeAreaProvider>
  );
}
