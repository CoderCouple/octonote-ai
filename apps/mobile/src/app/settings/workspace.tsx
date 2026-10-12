import { Stack } from "expo-router";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { useMe } from "@/features/resources";

export default function WorkspaceSettings() {
  const me = useMe().data;
  const ws = me?.memberships[0]?.workspace;
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Workspace" }} />
      <Group footer="Rename the workspace, switch between workspaces and manage members on the web, in Settings.">
        <Item first label="Name" detail={ws?.name} />
      </Group>
    </SettingsScreen>
  );
}
