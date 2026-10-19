import { Pressable, Text, View } from "react-native";
import type { Balance } from "../../lib/types";

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/**
 * `expiring` is a real state because free credits expire. The expiry is read
 * out, not only coloured. Tapping always goes to the ledger, never straight
 * to checkout.
 */
export function BalanceChip({
  balance, onPress, cheapestVideo = 25,
}: {
  balance: Balance | null;
  onPress: () => void;
  cheapestVideo?: number;
}) {
  if (!balance) {
    return (
      <View className="min-h-8 justify-center rounded-pill bg-surface-2 px-3">
        <Text className="text-sm text-text-muted">…</Text>
      </View>
    );
  }

  const low = balance.balance < cheapestVideo;
  const expiringSoon = balance.expiring > 0 && balance.nextExpiry != null
    && daysUntil(balance.nextExpiry) <= 3;

  const a11y = [
    `${balance.balance} credits`,
    expiringSoon && balance.nextExpiry
      ? `${balance.expiring} expire in ${daysUntil(balance.nextExpiry)} days`
      : "",
    low ? "not enough for a video" : "",
  ].filter(Boolean).join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className={[
        "min-h-8 flex-row items-center gap-1.5 rounded-pill bg-surface-2 px-3",
        low ? "border border-danger" : expiringSoon ? "border border-warning" : "",
      ].join(" ")}
    >
      <Text
        className={`text-sm font-semibold ${low ? "text-danger" : expiringSoon ? "text-warning" : "text-text"}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {balance.balance}
      </Text>
      <Text className={`text-xs ${low ? "text-danger" : expiringSoon ? "text-warning" : "text-text-muted"}`}>
        {low ? "need more" : expiringSoon ? "some expiring" : "credits"}
      </Text>
    </Pressable>
  );
}
