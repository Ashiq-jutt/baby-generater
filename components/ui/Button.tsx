import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BG: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-surface-2 border border-border",
  ghost: "bg-transparent",
  danger: "bg-danger",
};
const FG: Record<Variant, string> = {
  primary: "text-on-accent",
  secondary: "text-text",
  ghost: "text-text",
  danger: "text-on-danger",
};
const H: Record<Size, string> = { sm: "min-h-9 px-3", md: "min-h-touch px-4", lg: "min-h-13 px-5" };
const TS: Record<Size, string> = { sm: "text-sm", md: "text-sm", lg: "text-base" };

export function Button({
  label, onPress, variant = "primary", size = "md",
  disabled, loading, full, left,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  left?: ReactNode;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      className={[
        "flex-row items-center justify-center gap-2 rounded-md",
        BG[variant], H[size], full ? "w-full" : "self-start",
        off ? "opacity-45" : "active:opacity-80",
      ].join(" ")}
    >
      {loading ? <ActivityIndicator size="small" /> : left}
      {/* the label stays visible while loading, for screen readers and for nerves */}
      <Text className={`font-semibold ${TS[size]} ${FG[variant]}`}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`flex-row flex-wrap items-center gap-2 ${className}`}>{children}</View>;
}
