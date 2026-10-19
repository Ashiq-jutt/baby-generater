// S06 - My Creations.
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { data } from "../../lib/data";
import type { Generation } from "../../lib/types";
import { EmptyState } from "../../components/ui/EmptyState";
import { GenerationProgress } from "../../components/ui/GenerationProgress";
import { ResultCard } from "../../components/ui/ResultCard";

export default function Creations() {
  const router = useRouter();
  const [gens, setGens] = useState<Generation[] | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!data.currentUserId()) { setGens([]); return; }
    const tick = () => data.listGenerations().then((g) => alive && setGens(g)).catch(() => {});
    tick();
    const id = setInterval(tick, 1200);
    return () => { alive = false; clearInterval(id); };
  }, []));

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="px-4 pb-3 pt-1">
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          Your videos
        </Text>
      </View>

      {gens === null ? (
        <Text className="px-4 text-sm text-text-muted">Loading…</Text>
      ) : gens.length === 0 ? (
        <EmptyState
          title="No videos yet"
          body="Your first one is free. Pick a photo and we'll make it move."
          actionLabel="Make my first video"
          onAction={() => router.push("/")}
        />
      ) : (
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
          {gens.map((g) => (
            <View key={g.id} className="gap-2">
              <Text className="text-xs font-medium text-text-muted">
                {g.toolSlug.replace(/-/g, " ")}
                {g.isFreeReroll ? " · free retry" : ""}
              </Text>
              {g.status === "succeeded" ? (
                <ResultCard
                  gen={g}
                  saved={!!saved[g.id]}
                  onSave={() => setSaved((s) => ({ ...s, [g.id]: true }))}
                  onShare={() => {}}
                  onReroll={g.isFreeReroll
                    ? undefined
                    : () => data.rerollGeneration(g.id).then(() => {}).catch(() => {})}
                />
              ) : (
                <GenerationProgress
                  gen={g}
                  onCancel={g.status === "queued" || g.status === "running"
                    ? () => data.cancelGeneration(g.id).then(() => {})
                    : undefined}
                  onRetry={g.status === "failed"
                    ? () => data.rerollGeneration(g.id).then(() => {}).catch(() => {})
                    : undefined}
                />
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
