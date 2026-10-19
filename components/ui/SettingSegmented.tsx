import { Pressable, Text, View } from "react-native";

export interface Option {
  value: string;
  label: string;
  /** set when the selected model cannot run this option; stays visible */
  unavailableReason?: string;
}

/**
 * Options come from the model row, never hardcoded: Veo allows 4/6/8s while
 * Vidu allows 1-16s. Unavailable options stay VISIBLE with a reason - hiding
 * them makes the UI feel broken.
 *
 * Changing any segment invalidates the quote, which is the caller's job.
 */
export function SettingSegmented({
  label, options, value, onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length === 0) return null;

  // one legal option is information, not a control
  if (options.length === 1) {
    return (
      <View className="gap-1">
        <Text className="text-xs font-medium text-text-muted">{label}</Text>
        <Text className="text-sm text-text">{options[0].label}</Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-xs font-medium text-text-muted">{label}</Text>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        className="flex-row gap-0.5 rounded-pill bg-surface-2 p-1"
      >
        {options.map((o) => {
          const off = !!o.unavailableReason;
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on, disabled: off }}
              accessibilityLabel={off ? `${o.label}. ${o.unavailableReason}` : o.label}
              disabled={off}
              onPress={() => onChange(o.value)}
              className={[
                "flex-1 min-h-10 items-center justify-center rounded-pill",
                on ? "bg-bg" : "",
                off ? "opacity-40" : "",
              ].join(" ")}
            >
              <Text className={`text-sm font-semibold ${on ? "text-text" : "text-text-muted"}`}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {options.filter((o) => o.unavailableReason).slice(0, 1).map((o) => (
        <Text key={o.value} className="text-xs text-text-muted">
          {o.label}: {o.unavailableReason}
        </Text>
      ))}
    </View>
  );
}
