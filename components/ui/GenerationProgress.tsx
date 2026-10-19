import { Text, View } from "react-native";
import type { Generation } from "../../lib/types";
import { Button } from "./Button";

export function Progress({ value }: { value: number | null }) {
  const pct = value == null ? null : Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={pct == null ? undefined : { min: 0, max: 100, now: Math.round(pct * 100) }}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2"
    >
      <View
        className="h-full rounded-pill bg-accent"
        style={{ width: pct == null ? "35%" : `${pct * 100}%` }}
      />
    </View>
  );
}

function elapsed(from: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(from)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Honest progress only. If the provider gives no percentage, show an
 * indeterminate bar and the elapsed time. A fake 0-90% crawl is what produces
 * "it just continues to load but nothing ever comes up".
 *
 * The failed state says the credits came back, in words.
 */
export function GenerationProgress({
  gen, onRetry, onCancel,
}: {
  gen: Generation;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  if (gen.status === "failed" || gen.status === "cancelled") {
    const cancelled = gen.status === "cancelled";
    return (
      <View className="gap-1 rounded-md bg-surface p-3" accessibilityLiveRegion="polite">
        <Text className="text-sm font-semibold text-danger">
          {cancelled ? "You stopped this one" : "That one didn't render"}
        </Text>
        <Text className="text-xs text-text-muted">
          {gen.errorMessage ?? "Something went wrong on our side."}
        </Text>
        {gen.creditsRefunded > 0 ? (
          <Text className="text-xs text-text-muted">
            Your {gen.creditsRefunded} credits are back in your balance. Nothing was charged.
          </Text>
        ) : null}
        {onRetry && !gen.isFreeReroll ? (
          <View className="mt-1">
            <Button label="Try again, free" variant="secondary" size="sm" onPress={onRetry} />
          </View>
        ) : null}
      </View>
    );
  }

  const running = gen.status === "running";
  return (
    <View className="gap-2" accessibilityLiveRegion="polite">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs font-medium text-text-muted">
          {gen.status === "queued" ? "In the queue" : "Making your video"}
        </Text>
        <Text className="text-xs text-text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          {running && gen.progress != null
            ? `${Math.round(gen.progress * 100)}%`
            : `${elapsed(gen.queuedAt)} elapsed`}
        </Text>
      </View>
      <Progress value={running ? gen.progress : null} />
      {onCancel ? (
        <Button label="Stop and refund" variant="ghost" size="sm" onPress={onCancel} />
      ) : null}
    </View>
  );
}
