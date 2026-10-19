import { Text, View } from "react-native";
import type { Generation } from "../../lib/types";
import { Button } from "./Button";

/**
 * Save to Photos, not "Download" - it is a phone. AI labelling is baked in
 * rather than optional (F40).
 */
export function ResultCard({
  gen, onSave, onShare, onReroll, saved,
}: {
  gen: Generation;
  onSave: () => void;
  onShare: () => void;
  onReroll?: () => void;
  saved?: boolean;
}) {
  return (
    <View className="overflow-hidden rounded-lg border border-border">
      <View
        accessibilityLabel={`Your ${gen.toolSlug.replace(/-/g, " ")} video, ready to play`}
        className="aspect-[9/16] max-h-56 items-center justify-center bg-surface-2"
      >
        <View className="h-13 w-13 items-center justify-center rounded-pill bg-text/60">
          <Text className="text-xl text-bg">▶</Text>
        </View>
        <View className="absolute bottom-2 left-2 rounded-sm bg-text/70 px-2 py-1">
          <Text className="text-xs font-semibold text-bg">AI generated</Text>
        </View>
      </View>
      <View className="flex-row gap-2 bg-surface p-2.5">
        <View className="flex-1">
          <Button
            label={saved ? "Saved" : "Save to Photos"}
            size="sm"
            full
            disabled={saved}
            onPress={onSave}
          />
        </View>
        <Button label="Share" variant="secondary" size="sm" onPress={onShare} />
      </View>
      {onReroll ? (
        <View className="border-t border-border bg-surface px-2.5 pb-2.5">
          <Button label="Not quite? One more, free" variant="ghost" size="sm" onPress={onReroll} />
        </View>
      ) : null}
    </View>
  );
}
