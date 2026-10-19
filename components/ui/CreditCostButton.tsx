import { ActivityIndicator, Pressable, Text, View } from "react-native";

export type CostState =
  | "quoting"      // price being fetched
  | "ready"        // quoted and affordable
  | "stale"        // a setting changed after the quote
  | "insufficient" // quoted, but the balance will not cover it
  | "submitting"
  | "incomplete";  // required inputs missing

/**
 * The Generate button. The price is part of the control, so it gets its own
 * component. Four rules, from components.md:
 *   1. never show a price we cannot honour -> `quoting`
 *   2. `stale` must re-quote before it can submit
 *   3. `insufficient` routes to packs, it does not just grey out
 *   4. disabled on submit until the job has an id, or a double tap buys twice
 */
export function CreditCostButton({
  state, credits, balance, onPress, onGetCredits, label = "Generate",
}: {
  state: CostState;
  credits: number | null;
  balance: number;
  onPress: () => void;
  onGetCredits: () => void;
  label?: string;
}) {
  const disabled = state === "quoting" || state === "submitting" || state === "incomplete";
  const isInsufficient = state === "insufficient";

  const text =
    state === "incomplete" ? "Add a photo to start"
    : state === "stale" ? "Settings changed"
    : isInsufficient ? "Not enough credits"
    : label;

  const price =
    state === "quoting" ? "pricing…"
    : state === "stale" ? "re-price"
    : credits == null ? ""
    : isInsufficient ? `${credits} needed`
    : `${credits} credits`;

  // No accessibilityLabel: the button's own visible text ("Generate" plus
  // "25 credits") already reads correctly, and overriding it with different
  // wording violates WCAG 2.5.3 Label in Name (BUG-005). Extra context goes
  // in a hint, which is additive rather than replacing the name.
  const hint = isInsufficient && credits != null
    ? `This one costs ${credits}. You have ${balance}. Opens the credit packs.`
    : state === "stale" ? "Your settings changed, so the price needs updating."
    : state === "quoting" ? "Working out the price"
    : undefined;

  const tone = isInsufficient || state === "stale"
    ? "bg-surface-2 border border-border"
    : "bg-accent";
  const fg = isInsufficient || state === "stale" ? "text-text-muted" : "text-on-accent";

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityHint={hint}
        accessibilityState={{ disabled, busy: state === "submitting" }}
        disabled={disabled}
        onPress={isInsufficient ? onGetCredits : onPress}
        className={[
          "w-full min-h-touch flex-row items-center justify-between gap-3",
          "rounded-md px-4", tone,
          disabled ? "opacity-60" : "active:opacity-80",
        ].join(" ")}
      >
        <View className="flex-row items-center gap-2 shrink">
          {state === "submitting" ? <ActivityIndicator size="small" /> : null}
          <Text className={`font-semibold text-sm ${fg}`}>{text}</Text>
        </View>
        {price ? (
          <Text className={`text-sm ${fg} opacity-90`} style={{ fontVariant: ["tabular-nums"] }}>
            {price}
          </Text>
        ) : null}
      </Pressable>

      {isInsufficient && credits != null ? (
        <Text className="text-xs text-danger" accessibilityLiveRegion="polite">
          You have {balance} credits. This one needs {credits}. Tap to get more.
        </Text>
      ) : null}
      {state === "stale" ? (
        <Text className="text-xs text-text-muted" accessibilityLiveRegion="polite">
          The price changed with your settings. Tap to see the new one.
        </Text>
      ) : null}
    </View>
  );
}
