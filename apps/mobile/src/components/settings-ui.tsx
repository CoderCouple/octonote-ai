/**
 * Grouped, iOS-Settings-style rows used by the Settings screens. Same look on
 * Android (it reads as a clean Material list there too).
 */
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePalette } from "@/lib/theme";

export function SettingsScreen({ children }: { children: React.ReactNode }) {
  const c = usePalette();
  return (
    <ScrollView
      style={{ backgroundColor: c.grouped }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.screen}
    >
      {children}
    </ScrollView>
  );
}

export function Group({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const c = usePalette();
  return (
    <View style={styles.groupWrap}>
      {title ? (
        <Text style={[styles.groupTitle, { color: c.textSecondary }]}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.group,
          { backgroundColor: c.card, borderColor: c.separator },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <Text style={[styles.footer, { color: c.textSecondary }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function Item({
  label,
  detail,
  onPress,
  trailing,
  destructive,
  chevron = Boolean(onPress),
  first,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  destructive?: boolean;
  chevron?: boolean;
  /** No top hairline on the first row of a group. */
  first?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.item,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.separator,
        },
        pressed && onPress ? { backgroundColor: c.pressed } : null,
      ]}
    >
      <Text
        style={[styles.label, { color: destructive ? c.danger : c.textStrong }]}
      >
        {label}
      </Text>
      {detail ? (
        <Text
          numberOfLines={1}
          style={[styles.detail, { color: c.textSecondary }]}
        >
          {detail}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <ChevronRight size={18} color={c.textSubtle} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 24, paddingBottom: 48 },
  groupWrap: { gap: 8 },
  groupTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 16,
  },
  group: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  footer: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 50,
    paddingVertical: 12,
  },
  label: { flex: 1, fontSize: 16 },
  detail: { fontSize: 15, maxWidth: "55%" },
});
