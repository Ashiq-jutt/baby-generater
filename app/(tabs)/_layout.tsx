import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useColorScheme } from "nativewind";
import { themes } from "../../lib/theme";

/**
 * The glyph is decoration; the tab's own label carries the meaning. Without
 * hiding it, a screen reader announces "star star Make" (BUG-001).
 */
function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return (
    <Text
      style={{ color, fontSize: 18 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {glyph}
    </Text>
  );
}

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // an inactive tab's content must leave the accessibility tree, or a
        // screen reader on Credits still reads the tool list (BUG-006)
        freezeOnBlur: true,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t["text-muted"],
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Make",
          tabBarIcon: ({ color }) => <Icon glyph="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="creations"
        options={{
          title: "Yours",
          tabBarIcon: ({ color }) => <Icon glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="credits"
        options={{
          title: "Credits",
          tabBarIcon: ({ color }) => <Icon glyph="◆" color={color} />,
        }}
      />
    </Tabs>
  );
}
