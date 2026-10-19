import { Text, View } from "react-native";
import { Button } from "./Button";

/** Every empty state names the next action. No shrugs. */
export function EmptyState({
  title, body, actionLabel, onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center gap-2 px-4 py-8">
      <Text accessibilityRole="header" className="text-base font-semibold text-text">
        {title}
      </Text>
      <Text className="max-w-[32ch] text-center text-sm text-text-muted">{body}</Text>
      {actionLabel && onAction ? (
        <View className="mt-1">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
