import type { LucideIcon } from "lucide-react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMe } from "@/features/resources";
import { initials, useAccountPanel, useNewShareCount } from "./account-panel";
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
  avatarBtn: { padding: 4 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "700" },
  dot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});

/** Your initials in a circle; opens the account side panel. Shows a dot when something new was shared. */
export function HeaderAvatarButton() {
  const c = usePalette();
  const me = useMe().data;
  const panel = useAccountPanel();
  const newShares = useNewShareCount();
  return (
    <Pressable
      onPress={panel.open}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        newShares > 0
          ? `Account and settings, ${newShares} new shared`
          : "Account and settings"
      }
      style={({ pressed }) => [
        styles.avatarBtn,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: c.tint }]}>
        <Text style={[styles.avatarText, { color: c.onTint }]}>
          {initials(me?.user.name)}
        </Text>
      </View>
      {newShares > 0 ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: c.textStrong, borderColor: c.background },
          ]}
        />
      ) : null}
    </Pressable>
  );
}
