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
  sectionWrap: { gap: 10 },
  sectionHead: { gap: 2, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  sectionDesc: { fontSize: 14, lineHeight: 19 },
  field: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  fieldInline: { flexDirection: "row", alignItems: "center" },
  fieldText: { flex: 1, gap: 2 },
  fieldDesc: { fontSize: 13, lineHeight: 18 },
});

/**
 * A titled section like the web Settings page: heading + one-line
 * description above a card of rows. `danger` tints it for destructive actions.
 */
export function Section({
  title,
  description,
  danger,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const c = usePalette();
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHead}>
        <Text
          style={[
            styles.sectionTitle,
            { color: danger ? c.danger : c.textStrong },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.sectionDesc, { color: c.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.group,
          {
            backgroundColor: c.card,
            borderColor: danger ? c.danger : c.separator,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** A row with a label, optional help text underneath, and content on the right or below. */
export function Field({
  label,
  description,
  children,
  stacked,
  first,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  /** Put the control under the label (inputs) instead of to the right. */
  stacked?: boolean;
  first?: boolean;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.field,
        stacked ? null : styles.fieldInline,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.separator,
        },
      ]}
    >
      <View style={stacked ? null : styles.fieldText}>
        <Text style={[styles.label, { color: c.textStrong }]}>{label}</Text>
        {description ? (
          <Text style={[styles.fieldDesc, { color: c.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
