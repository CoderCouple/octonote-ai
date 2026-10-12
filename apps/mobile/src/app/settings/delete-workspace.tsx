/**
 * Delete the active workspace (owners only). Type its name to confirm — same
 * rule as the web app's Danger zone.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SettingsScreen } from "@/components/settings-ui";
import { useActiveMembership } from "@/features/resources";
import { api } from "@/lib/api";
import { usePalette } from "@/lib/theme";

export default function DeleteWorkspace() {
  const c = usePalette();
  const router = useRouter();
  const qc = useQueryClient();
  const ws = useActiveMembership()?.workspace;
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = Boolean(ws) && typed.trim() === ws?.name;

  async function remove() {
    if (!ws) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${ws.id}`);
      // /me re-syncs: the next workspace becomes active (or a fresh one is made).
      await qc.invalidateQueries();
      router.back();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.replace(/^Octonote API \S+ \d+: /, "")
          : "";
      Alert.alert(
        "Couldn't delete the workspace",
        message || "Please try again.",
      );
      setDeleting(false);
    }
  }

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Delete workspace" }} />
      <View style={styles.body}>
        <Text style={[styles.lead, { color: c.textStrong }]}>
          Delete “{ws?.name}”?
        </Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          This permanently deletes the workspace and all its notes, canvases,
          projects, notebooks and shares. We don't keep backups.
        </Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          Type{" "}
          <Text style={{ color: c.textStrong, fontWeight: "600" }}>
            {ws?.name}
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={ws?.name}
          placeholderTextColor={c.textSubtle}
          autoCorrect={false}
          editable={!deleting}
          accessibilityLabel="Workspace name"
          style={[
            styles.input,
            {
              color: c.textStrong,
              backgroundColor: c.card,
              borderColor: c.separator,
            },
          ]}
        />
        <Pressable
          onPress={remove}
          disabled={!matches || deleting}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: c.danger,
              opacity: !matches || deleting ? 0.4 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Delete workspace</Text>
          )}
        </Pressable>
      </View>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingHorizontal: 4 },
  lead: { fontSize: 18, fontWeight: "700" },
  text: { fontSize: 15, lineHeight: 21 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
    letterSpacing: 0,
    marginTop: 4,
  },
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
