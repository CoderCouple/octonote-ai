/**
 * "Report a bug" / "Request a feature". The same report as the web form: kept
 * in the database for the team and read in Admin → Feedback, with the account,
 * device, screen, time and rough location attached.
 */
import {
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  type FeedbackContext,
  type FeedbackKind,
  type FeedbackScreenshotType,
} from "@octonote/shared";
import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LogoMark } from "@/components/logo-mark";
import { useActiveMembership, useMe } from "@/features/resources";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { usePalette } from "@/lib/theme";

const COPY: Record<FeedbackKind, { prompt: string; hint: string }> = {
  bug: {
    prompt: "What went wrong?",
    hint: "What you did, what you expected, and what happened instead.",
  },
  feature: {
    prompt: "What would you like Octonote to do?",
    hint: "What are you trying to get done? How would this help?",
  },
};

interface Shot {
  uri: string;
  data: string;
  contentType: FeedbackScreenshotType;
}

function deviceDetails(from: string | undefined): FeedbackContext {
  const os = Platform.OS === "ios" ? "iOS" : "Android";
  const { width, height } = Dimensions.get("window");
  return {
    platform: os,
    appVersion: Constants.expoConfig?.version,
    system: `${os} ${Platform.Version}`,
    device: Device.modelName ?? undefined,
    screen: `${Math.round(width)}×${Math.round(height)}`,
    page: from,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Rough location, from the web app; a report still goes out without it. */
async function roughLocation(): Promise<Pick<FeedbackContext, "city" | "region" | "country">> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  try {
    const res = await fetch(`${env.WEB_URL}/api/geo`, { signal: abort.signal });
    return res.ok ? ((await res.json()) as Pick<FeedbackContext, "city" | "region" | "country">) : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export default function Feedback() {
  const c = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; from?: string }>();
  const me = useMe().data;
  const active = useActiveMembership();
  const [kind, setKind] = useState<FeedbackKind>(params.kind === "feature" ? "feature" : "bug");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const details = deviceDetails(params.from);

  const send = useMutation({
    mutationFn: async () =>
      api.post("/feedback", {
        kind,
        message,
        workspaceId: active?.workspace.id,
        context: { ...details, ...(await roughLocation()) },
        ...(shot ? { screenshot: { contentType: shot.contentType, data: shot.data } } : {}),
      }),
    onError: (err) => setProblem(err instanceof Error ? err.message : "That didn't send. Please try again."),
  });

  async function pick() {
    setProblem(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.7,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    // Base64 is 4/3 of the file's size. A shot from the library is re-encoded as JPEG unless it's a PNG.
    if ((asset.base64.length * 3) / 4 > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      setProblem("The screenshot must be under 5 MB.");
      return;
    }
    setShot({
      uri: asset.uri,
      data: asset.base64,
      contentType: asset.mimeType === "image/png" ? "image/png" : asset.mimeType === "image/webp" ? "image/webp" : "image/jpeg",
    });
  }

  function submit() {
    if (!message.trim()) {
      setProblem("Write a few words first.");
      return;
    }
    setProblem(null);
    send.mutate();
  }

  if (send.isSuccess) {
    return (
      <View style={[styles.done, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: "Thanks", headerRight: undefined }} />
        <LogoMark size={64} />
        <Text style={[styles.doneTitle, { color: c.text }]}>Thanks, we got it</Text>
        <Text style={[styles.doneBody, { color: c.textSecondary }]}>
          We read everything. If we need more from you, we&apos;ll write to {me?.user.email ?? "you"}.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.secondary, { borderColor: c.separator }]}
        >
          <Text style={[styles.secondaryText, { color: c.text }]}>Done</Text>
        </Pressable>
      </View>
    );
  }

  const copy = COPY[kind];
  const rows: [string, string | undefined][] = [
    ["User ID", me?.user.id],
    ["Email", me?.user.email],
    ["Workspace", active ? `${active.workspace.name} · ${active.workspace.id}` : undefined],
    ["Device", [details.device, details.system, details.screen].filter(Boolean).join(" · ")],
    ["App version", details.appVersion],
    ["Screen", details.page],
    ["Time", `When you send this (${details.timeZone})`],
    ["Location", "City and country, from your connection. Your IP address isn't kept."],
  ];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: "Send feedback",
          headerRight: () =>
            send.isPending ? (
              <ActivityIndicator color={c.text} />
            ) : (
              <Pressable accessibilityRole="button" onPress={submit} hitSlop={10}>
                <Text style={{ color: c.text, fontWeight: "600", fontSize: 16 }}>Send</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: c.pressed }]}>
          {(["bug", "feature"] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === k }}
              onPress={() => setKind(k)}
              style={[styles.segmentItem, kind === k && { backgroundColor: c.background }]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: kind === k ? c.text : c.textSecondary, fontWeight: kind === k ? "600" : "500" },
                ]}
              >
                {k === "bug" ? "Report a bug" : "Request a feature"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: c.text }]}>{copy.prompt}</Text>
        <TextInput
          multiline
          autoFocus
          maxLength={5000}
          value={message}
          onChangeText={setMessage}
          placeholder={copy.hint}
          placeholderTextColor={c.textSecondary}
          textAlignVertical="top"
          accessibilityLabel={copy.prompt}
          style={[styles.input, { color: c.text, borderColor: c.separator }]}
        />

        <Text style={[styles.label, { color: c.text }]}>
          Screenshot <Text style={{ color: c.textSecondary, fontWeight: "400" }}>(optional)</Text>
        </Text>
        {shot ? (
          <View style={[styles.shot, { borderColor: c.separator }]}>
            <Image source={{ uri: shot.uri }} style={styles.thumb} accessibilityLabel="Your screenshot" />
            <Pressable
              accessibilityRole="button"
              onPress={() => setShot(null)}
              style={[styles.secondary, { borderColor: c.separator, marginTop: 0 }]}
            >
              <Text style={[styles.secondaryText, { color: c.text }]}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void pick()}
            style={[styles.add, { borderColor: c.separator }]}
          >
            <Text style={[styles.secondaryText, { color: c.text }]}>Choose from Photos</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 3 }}>Up to 5 MB</Text>
          </Pressable>
        )}

        <Text style={[styles.note, { color: c.textSecondary }]}>
          We attach your account, device and rough location so we can look into this.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          onPress={() => setShowDetails((v) => !v)}
          hitSlop={10}
        >
          <Text style={[styles.link, { color: c.text }]}>{showDetails ? "Hide" : "See what we attach"}</Text>
        </Pressable>
        {showDetails ? (
          <View style={[styles.details, { backgroundColor: c.pressed }]}>
            {rows.map(([k, v]) =>
              v ? (
                <Text key={k} style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>
                  <Text style={{ color: c.textSecondary }}>{k}: </Text>
                  {v}
                </Text>
              ) : null,
            )}
          </View>
        ) : null}

        {problem ? (
          <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 14 }}>
            {problem}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 10, marginBottom: 6 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 14 },
  label: { fontSize: 15, fontWeight: "500", marginTop: 6 },
  input: { minHeight: 160, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 22 },
  add: { minHeight: 76, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, alignItems: "center", justifyContent: "center", padding: 12 },
  shot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 8 },
  thumb: { width: 84, height: 60, borderRadius: 6 },
  note: { fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  link: { fontSize: 13.5, fontWeight: "500", textDecorationLine: "underline" },
  details: { borderRadius: 8, padding: 12, gap: 4 },
  done: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  doneTitle: { fontSize: 21, fontWeight: "650" as "600", textAlign: "center" },
  doneBody: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
  secondary: { minHeight: 44, paddingHorizontal: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryText: { fontSize: 15, fontWeight: "500" },
});
