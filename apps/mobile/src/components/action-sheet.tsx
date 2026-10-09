/**
 * A small bottom sheet of choices — used for sorting and row actions. Plain
 * RN Modal so it works in Expo Go on both platforms.
 */
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/lib/theme";

export interface SheetOption {
  label: string;
  onPress: () => void;
  selected?: boolean;
  destructive?: boolean;
}

export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.card,
            borderColor: c.separator,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: c.separator }]} />
        {title ? (
          <Text style={[styles.title, { color: c.textSecondary }]}>
            {title}
          </Text>
        ) : null}
        {options.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => {
              onClose();
              o.onPress();
            }}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: pressed ? c.pressed : "transparent" },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: o.selected }}
          >
            <Text
              style={[
                styles.optionText,
                { color: o.destructive ? c.danger : c.textStrong },
              ]}
            >
              {o.label}
            </Text>
            {o.selected ? (
              <Text style={[styles.check, { color: c.textStrong }]}>✓</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionText: { flex: 1, fontSize: 17 },
  check: { fontSize: 16, fontWeight: "700" },
});
