import { Stack, useRouter } from "expo-router";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { replaySplash } from "@/components/animated-splash";
import { useMe } from "@/features/resources";
import { useThemeChoice } from "@/lib/theme-preference";
import { useOnboarding } from "@/providers/onboarding";

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" } as const;

export default function Settings() {
  const router = useRouter();
  const me = useMe().data;
  const theme = useThemeChoice();
  const onboarding = useOnboarding();

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Settings" }} />
      <Group>
        <Item
          first
          label="Account"
          detail={me?.user.email}
          onPress={() => router.push("/settings/account")}
        />
        <Item
          label="Appearance"
          detail={THEME_LABEL[theme]}
          onPress={() => router.push("/settings/appearance")}
        />
        <Item
          label="Notifications"
          onPress={() => router.push("/settings/notifications")}
        />
      </Group>
      <Group>
        <Item
          first
          label="Workspace"
          detail={me?.memberships[0]?.workspace.name}
          onPress={() => router.push("/settings/workspace")}
        />
        <Item
          label="Plan"
          detail="Free (beta)"
          onPress={() => router.push("/plan")}
        />
      </Group>
      <Group>
        <Item
          first
          label="About"
          onPress={() => router.push("/settings/about")}
        />
      </Group>
      {__DEV__ ? (
        <Group title="Developer">
          <Item
            first
            label="Replay intro"
            onPress={() => {
              onboarding.reset();
              if (router.canDismiss()) router.dismissAll();
              router.push("/onboarding");
            }}
          />
          <Item
            label="Replay splash"
            onPress={() => {
              if (router.canDismiss()) router.dismissAll();
              replaySplash();
            }}
          />
        </Group>
      ) : null}
    </SettingsScreen>
  );
}
