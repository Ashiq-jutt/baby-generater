import { Image, Pressable, Text, View } from "react-native";
import { Progress } from "./GenerationProgress";

export type DropState = "empty" | "uploading" | "ready" | "error";

/** Validation happens before upload, so the error arrives before the wait. */
export const LIMITS = {
  image: { bytes: 10 * 1024 * 1024, label: "10 MB" },
  audio: { bytes: 25 * 1024 * 1024, seconds: 60, label: "25 MB or 60 seconds" },
  video: { bytes: 50 * 1024 * 1024, seconds: 30, label: "50 MB or 30 seconds" },
} as const;

export function MediaDropzone({
  label, hint, state, uri, fileName, progress, error, onPick, onClear,
}: {
  label: string;
  hint?: string;
  state: DropState;
  uri?: string | null;
  fileName?: string | null;
  progress?: number;
  error?: string | null;
  onPick: () => void;
  onClear?: () => void;
}) {
  if (state === "uploading") {
    return (
      <View className="gap-2 rounded-lg border border-border bg-surface p-4">
        <View className="flex-row justify-between">
          <Text className="text-sm text-text-muted">Adding your photo</Text>
          <Text className="text-sm text-text-muted" style={{ fontVariant: ["tabular-nums"] }}>
            {Math.round((progress ?? 0) * 100)}%
          </Text>
        </View>
        <Progress value={progress ?? 0} />
      </View>
    );
  }

  if (state === "ready" && uri) {
    return (
      <View className="flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <Image
          source={{ uri }}
          accessibilityLabel="The photo you picked"
          className="h-11 w-11 rounded-sm"
          resizeMode="cover"
        />
        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} className="text-sm font-semibold text-text">
            {fileName ?? "Your photo"}
          </Text>
          <Text className="text-xs text-text-muted">Ready</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove this photo"
          onPress={onClear}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <Text className="text-sm font-semibold text-text-muted">Change</Text>
        </Pressable>
      </View>
    );
  }

  const bad = state === "error";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bad ? `${label}. ${error}` : `${label}. ${hint ?? ""}`}
      onPress={onPick}
      className={[
        "min-h-28 items-center justify-center gap-1 rounded-lg p-4",
        bad ? "border border-danger bg-surface" : "border-2 border-dashed border-border-input bg-surface",
      ].join(" ")}
    >
      <Text className={`text-sm font-semibold ${bad ? "text-danger" : "text-text"}`}>
        {bad ? error : label}
      </Text>
      <Text className="text-center text-xs text-text-muted">
        {bad ? "Tap to pick another" : hint}
      </Text>
    </Pressable>
  );
}
