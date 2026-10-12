import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { env } from "@/lib/env";

export default function About() {
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "About" }} />
      <Group>
        <Item
          first
          label="Terms of Service"
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${env.WEB_URL}/terms`)
          }
        />
        <Item
          label="Privacy Notice"
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${env.WEB_URL}/privacy`)
          }
        />
      </Group>
      <Group>
        <Item
          first
          label="Version"
          detail={Constants.expoConfig?.version ?? "—"}
        />
      </Group>
    </SettingsScreen>
  );
}
