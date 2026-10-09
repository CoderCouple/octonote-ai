/**
 * The app's bottom navigation: a floating, rounded bar (black-and-white,
 * like the rest of the app) with icon + label per tab. The active tab gets a
 * filled pill; taps give a light haptic. Replaces the platform tab bar, which
 * looked plain and tinted lavender on Android.
 */
import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import {
  BookOpen,
  FileText,
  FolderKanban,
  PenTool,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/lib/theme";

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  notes: { label: "Notes", icon: FileText },
  canvases: { label: "Canvases", icon: PenTool },
  projects: { label: "Projects", icon: FolderKanban },
  notebooks: { label: "Notebooks", icon: BookOpen },
  shared: { label: "Shared", icon: Users },
};

/** Height of the bar plus its margins — lists pad their bottom by this so nothing hides under it. */
export const TAB_BAR_SPACE = 110;

export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const c = usePalette();
  const insets = useSafeAreaInsets();

  return (
    // Sits clear of the phone's own gesture/nav bar.
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom + 12, 16) }]}
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: c.card, borderColor: c.separator },
        ]}
        accessibilityRole="tablist"
      >
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const Icon = tab.icon;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              style={({ pressed }) => [
                styles.item,
                focused
                  ? { backgroundColor: c.tint }
                  : pressed
                    ? { backgroundColor: c.pressed }
                    : null,
              ]}
            >
              <Icon
                size={20}
                strokeWidth={focused ? 2.3 : 2}
                color={focused ? c.onTint : c.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: focused ? c.onTint : c.textSecondary },
                  focused && styles.labelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  bar: {
    flexDirection: "row",
    gap: 4,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    // Elevation: a soft, wide shadow so the bar floats above the content.
    shadowColor: "#000",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.16,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
      default: { elevation: 16 },
    }),
  },
  // The selected tab's black highlight: a rounded rectangle behind icon + label.
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: 22,
    overflow: "hidden",
  },
  label: { fontSize: 11, fontWeight: "500" },
  labelActive: { fontWeight: "700" },
});
