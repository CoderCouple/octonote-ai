import { Stack } from "expo-router";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";

/** Plan placeholder: free during the beta. Paid plans will be managed on the web, not bought in the app. */
export default function Plan() {
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Plan" }} />
      <Group footer="Every feature is included while Octonote AI is in beta. Paid plans arrive after the beta and will be managed on the web — you'll hear from us first.">
        <Item first label="Current plan" detail="Free (beta)" />
      </Group>
    </SettingsScreen>
  );
}
