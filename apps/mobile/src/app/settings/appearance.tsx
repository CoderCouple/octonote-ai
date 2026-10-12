import { Stack } from "expo-router";
import { Check } from "lucide-react-native";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { usePalette } from "@/lib/theme";
import {
  setThemeChoice,
  useThemeChoice,
  type ThemeChoice,
} from "@/lib/theme-preference";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AppearanceSettings() {
  const c = usePalette();
  const theme = useThemeChoice();
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Appearance" }} />
      <Group footer="System follows your phone's light or dark setting.">
        {OPTIONS.map((o, i) => (
          <Item
            key={o.value}
            first={i === 0}
            label={o.label}
            chevron={false}
            onPress={() => setThemeChoice(o.value)}
            trailing={
              theme === o.value ? (
                <Check size={20} color={c.textStrong} />
              ) : undefined
            }
          />
        ))}
      </Group>
    </SettingsScreen>
  );
}
