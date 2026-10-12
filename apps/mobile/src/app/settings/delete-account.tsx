/**
 * Delete account (App Store requirement: deletable from inside the app).
 * Type your email to confirm; on success you're signed out to the sign-in screen.
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
import { useMe } from "@/features/resources";
import { api } from "@/lib/api";
import { usePalette } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

export default function DeleteAccount() {
  const c = usePalette();
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const email = useMe().data?.user.email ?? "";
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches =
    email !== "" && typed.trim().toLowerCase() === email.toLowerCase();

  async function remove() {
    setDeleting(true);
    try {
      await api.delete("/me", {
        body: JSON.stringify({ confirmEmail: typed }),
      });
      await signOut();
      qc.clear();
      if (router.canDismiss()) router.dismissAll();
      router.replace("/sign-in");
      Alert.alert(
        "Account deleted",
        "Your account and everything in it has been deleted.",
      );
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.replace(/^Octonote API \S+ \d+: /, "")
          : "";
      Alert.alert(
        "Couldn't delete your account",
        message || "Please try again.",
      );
      setDeleting(false);
    }
  }

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Delete account" }} />
      <View style={styles.body}>
        <Text style={[styles.lead, { color: c.textStrong }]}>
          This can't be undone.
        </Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          Your notes, canvases, projects and notebooks, your published pages and
          your shares will be deleted for good, and you'll lose access to
          anything shared with you.
        </Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          Type{" "}
          <Text style={{ color: c.textStrong, fontWeight: "600" }}>
            {email}
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={email}
          placeholderTextColor={c.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!deleting}
          accessibilityLabel="Your email address"
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
            <Text style={styles.buttonText}>Delete my account</Text>
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
