import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { replaySplash } from "@/components/animated-splash";
import { useMe } from "@/features/resources";
import { usePalette } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { useOnboarding } from "@/providers/onboarding";

export default function Settings() {
  const c = usePalette();
  const router = useRouter();
  const { signOut } = useAuth();
  const me = useMe();
  const onboarding = useOnboarding();

  return (
    <View style={[styles.fill, { backgroundColor: c.grouped }]}>
      <View
        style={[
          styles.group,
          { backgroundColor: c.card, borderColor: c.separator },
        ]}
      >
        <Text style={[styles.name, { color: c.text }]}>
          {me.data?.user.name ?? " "}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {me.data?.user.email ?? " "}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          Workspace: {me.data?.memberships[0]?.workspace.name ?? "—"}
        </Text>
      </View>
      <Pressable
        onPress={async () => {
          await signOut();
          if (router.canDismiss()) router.dismissAll();
          router.replace("/sign-in");
        }}
        style={({ pressed }) => [
          styles.group,
          {
            backgroundColor: pressed ? c.pressed : c.card,
            borderColor: c.separator,
          },
        ]}
      >
        <Text style={[styles.signOut, { color: c.danger }]}>Sign out</Text>
      </Pressable>
      {__DEV__ ? (
        <Pressable
          onPress={() => {
            onboarding.reset();
            if (router.canDismiss()) router.dismissAll();
            router.push("/onboarding");
          }}
          style={({ pressed }) => [
            styles.group,
            {
              backgroundColor: pressed ? c.pressed : c.card,
              borderColor: c.separator,
            },
          ]}
        >
          <Text style={[styles.signOut, { color: c.text }]}>
            Replay intro (dev)
          </Text>
        </Pressable>
      ) : null}
      {__DEV__ ? (
        <Pressable
          onPress={() => {
            // iOS modals sit above the root view, so close Account first.
            if (router.canDismiss()) router.dismissAll();
            replaySplash();
          }}
          style={({ pressed }) => [
            styles.group,
            {
              backgroundColor: pressed ? c.pressed : c.card,
              borderColor: c.separator,
            },
          ]}
        >
          <Text style={[styles.signOut, { color: c.text }]}>
            Replay splash (dev)
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: 16, gap: 16 },
  group: {
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 17, fontWeight: "600" },
  meta: { fontSize: 14 },
  signOut: { fontSize: 17, textAlign: "center" },
});
