import { Pressable, Text, View } from "react-native";

/**
 * The differentiator (F31). None of the original's 12 tools has this.
 *
 * It exists because of 10 reviews, two of them explicit race complaints:
 * "put two darker individuals and somehow I have a Chinese baby".
 *
 * Design rules, from components.md:
 *   - default to UNSET and infer from the photo; never default to the lightest
 *   - never auto-pick for the user
 *   - every swatch has a text label, never colour alone
 *   - no numeric scale labels
 *   - one tap from the photo, not buried in Advanced
 */
export const TONES = [
  { value: "light", label: "Light", swatch: "#f7ddc9", dark: false },
  { value: "light-medium", label: "Light medium", swatch: "#e8bd9a", dark: false },
  { value: "medium", label: "Medium", swatch: "#c98f63", dark: true },
  { value: "medium-deep", label: "Medium deep", swatch: "#a3663c", dark: true },
  { value: "deep", label: "Deep", swatch: "#6f4327", dark: true },
  { value: "rich-deep", label: "Rich deep", swatch: "#422619", dark: true },
] as const;

export function SkinToneControl({
  value, onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const current = TONES.find((t) => t.value === value);
  return (
    <View className="gap-2">
      <Text className="text-xs font-medium text-text-muted">Skin tone</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Skin tone"
        className="flex-row flex-wrap gap-2"
      >
        {TONES.map((t) => {
          const on = t.value === value;
          return (
            <Pressable
              key={t.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              // react-native-web does not emit aria-checked from
              // accessibilityState, and a radio without it cannot convey
              // selection to a screen reader (BUG-004)
              aria-checked={on}
              accessibilityLabel={`${t.label} skin tone`}
              onPress={() => onChange(on ? null : t.value)}
              style={{ backgroundColor: t.swatch }}
              className={[
                "h-touch w-touch items-center justify-center rounded-pill border border-border",
                on ? "border-2 border-focus" : "",
              ].join(" ")}
            >
              {on ? (
                <Text className={`text-base font-bold ${t.dark ? "text-white" : "text-black"}`}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-text-muted">
        {current
          ? `${current.label} — tap again to clear`
          : "Nothing selected — we'll read it from your photo"}
      </Text>
    </View>
  );
}
