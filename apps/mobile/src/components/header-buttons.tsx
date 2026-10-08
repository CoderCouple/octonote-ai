import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text } from "react-native";
import { usePalette } from "@/lib/theme";

/** SF Symbol on iOS; the text fallback renders on Android. */
export function HeaderIconButton({
  sf,
  fallback,
  label,
  onPress,
  disabled,
}: {
  sf: SymbolViewProps["name"];
  fallback: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 }]}
    >
      <SymbolView
        name={sf}
        size={22}
        tintColor={c.tint}
        fallback={<Text style={[styles.fallback, { color: c.tint }]}>{fallback}</Text>}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 4 },
  fallback: { fontSize: 22, fontWeight: "400" },
});
