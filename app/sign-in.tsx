// S02 - sign in. Apple first: iOS requires Sign in with Apple once any other
// social login is offered.
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { data } from "../lib/data";
import { Button } from "../components/ui/Button";

export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function go(provider: "apple" | "google" | "email") {
    setBusy(provider);
    try {
      await data.signIn(provider);
      router.back();
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center gap-6 px-5">
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-xl font-bold text-text">
            Sign in to start
          </Text>
          <Text className="text-sm text-text-muted">
            We'll add 30 credits so your first video costs nothing. Credits you buy
            later never expire, and there's no subscription to cancel.
          </Text>
        </View>

        <View className="gap-2">
          <Button label="Continue with Apple" full loading={busy === "apple"}
            onPress={() => go("apple")} />
          <Button label="Continue with Google" variant="secondary" full
            loading={busy === "google"} onPress={() => go("google")} />
          <Button label="Use my email" variant="ghost" full
            loading={busy === "email"} onPress={() => go("email")} />
        </View>

        <Text className="text-xs text-text-muted">
          Only upload photos of a child you're responsible for. We delete the photo
          you send once the video is made, and you can delete everything any time.
        </Text>
      </View>
    </SafeAreaView>
  );
}
