import type { LucideIcon } from "lucide-react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";
import { usePalette } from "@/lib/theme";

/** SF Symbol on iOS; the Lucide icon (same set as the web app) on Android. */
export function HeaderIconButton({
  sf,
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  sf: SymbolViewProps["name"];
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 },
      ]}
    >
      <SymbolView
        name={sf}
        size={22}
        tintColor={c.textStrong}
        fallback={<Icon size={22} color={c.textStrong} strokeWidth={2} />}
      />
    </Pressable>
  );
}

/** Several header buttons side by side (e.g. new + menu on the right). */
export function HeaderButtons({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: { padding: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
