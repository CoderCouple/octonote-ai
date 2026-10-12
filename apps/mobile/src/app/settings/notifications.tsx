import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Alert, Switch } from "react-native";
import { Group, Item, SettingsScreen } from "@/components/settings-ui";
import { api } from "@/lib/api";
import { usePalette } from "@/lib/theme";

interface Prefs {
  emailOnShare: boolean;
}

export default function NotificationSettings() {
  const c = usePalette();
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.get<Prefs>("/me/preferences"),
  });
  const save = useMutation({
    mutationFn: (emailOnShare: boolean) =>
      api.patch<Prefs>("/me/preferences", { emailOnShare }),
    onMutate: (emailOnShare) =>
      qc.setQueryData<Prefs>(["preferences"], (p) =>
        p ? { ...p, emailOnShare } : p,
      ),
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ["preferences"] });
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    },
  });
  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Notifications" }} />
      <Group footer="New shares also appear on Home under “Shared with you”, marked New.">
        <Item
          first
          label="Email me when someone shares with me"
          trailing={
            <Switch
              value={prefs.data?.emailOnShare ?? true}
              disabled={!prefs.data}
              onValueChange={(v) => save.mutate(v)}
              trackColor={{ true: c.tint }}
            />
          }
        />
      </Group>
    </SettingsScreen>
  );
}
