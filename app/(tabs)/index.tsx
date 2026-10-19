// S01 - home. The tool list. Every tool is the same editor with a different
// config row, so this list is the only thing that knows they are different.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { data } from "../../lib/data";
import { modelById } from "../../lib/catalogue";
import type { Balance, Tool } from "../../lib/types";
import { BalanceChip } from "../../components/ui/BalanceChip";
import { Button } from "../../components/ui/Button";

export default function Home() {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const signedIn = data.currentUserId() !== null;

  const load = useCallback(() => {
    let alive = true;
    data.listTools().then((t) => alive && setTools(t));
    if (data.currentUserId()) {
      data.getBalance().then((b) => alive && setBalance(b));
    } else {
      setBalance(null);
    }
    return () => { alive = false; };
  }, []);

  useFocusEffect(load);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-1">
        <Text className="text-xl font-bold text-text">Make something</Text>
        {signedIn ? (
          <BalanceChip balance={balance} onPress={() => router.push("/credits")} />
        ) : null}
      </View>

      <ScrollView contentContainerClassName="gap-3 px-4 pb-8">
        {!signedIn ? (
          <View className="gap-3 rounded-lg border border-border bg-surface p-4">
            <Text className="text-base font-semibold text-text">
              Your first video is free
            </Text>
            <Text className="text-sm text-text-muted">
              Sign in and we'll put 30 credits in your account. No subscription,
              nothing to cancel.
            </Text>
            <Button label="Get started" full onPress={() => router.push("/sign-in")} />
          </View>
        ) : null}

        {tools === null ? (
          <Text className="text-sm text-text-muted">Loading…</Text>
        ) : (
          tools.map((t) => {
            const m = modelById(t.defaultModelId);
            return (
              <Pressable
                key={t.slug}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}. ${t.blurb}`}
                onPress={() => router.push(`/tool/${t.slug}`)}
                className="gap-1 rounded-lg border border-border bg-surface p-4 active:opacity-80"
              >
                <Text className="text-base font-semibold text-text">{t.label}</Text>
                <Text className="text-sm text-text-muted">{t.blurb}</Text>
                <Text className="mt-1 text-xs text-text-muted">
                  {m.kind === "image" ? "Image" : "Video"} · {m.label}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
