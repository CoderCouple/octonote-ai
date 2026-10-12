import { Stack } from "expo-router";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { useMe } from "@/features/resources";

export default function AccountSettings() {
  const me = useMe().data;
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Account" }} />
      <Group footer="You sign in with a code sent to this email. Change your name on the web, in Settings → Account.">
        <Item first label="Name" detail={me?.user.name} />
        <Item label="Email" detail={me?.user.email} />
      </Group>
    </SettingsScreen>
  );
}
