/**
 * Google / Apple / Microsoft (lib/oauth.ts) or email + 6-digit code sign-in.
 * The code is in the same email as the web
 * magic link; entering it in-app avoids deep-link round-trips through the
 * mail app, which are fragile across mail clients and Expo Go.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { LogoMark } from "@/components/logo-mark";
import { env } from "@/lib/env";
import {
  getEnabledProviders,
  signInWithProvider,
  type OAuthProvider,
} from "@/lib/oauth";
import { supabase } from "@/lib/supabase";
import { usePalette } from "@/lib/theme";

type Step = "email" | "code";

const PROVIDERS: { id: OAuthProvider; label: string; icon: string }[] = [
  {
    id: "google",
    label: "Google",
    icon: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  },
  {
    id: "apple",
    label: "Apple",
    icon: "M16.37 12.75c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65l.04-.04zM14.1 6.01c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z",
  },
  {
    id: "azure",
    label: "Microsoft",
    icon: "M2 2h9.5v9.5H2zM12.5 2H22v9.5h-9.5zM2 12.5h9.5V22H2zM12.5 12.5H22V22h-9.5z",
  },
];

/** DEVELOPMENT ONLY: __DEV__ is false in release builds, so this never ships. */
const devLogin =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN === "true"
    ? {
        email: process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? "",
        password: process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD ?? "",
      }
    : null;

export default function SignIn() {
  const c = usePalette();
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  const [enabled, setEnabled] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    void getEnabledProviders().then(setEnabled);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!devLogin) return;
    setNotice("Dev mode: signing you in automatically…");
    void supabase.auth.signInWithPassword(devLogin).then(({ error: err }) => {
      if (err)
        setError(`Dev auto-login failed: ${err.message} (run pnpm dev:user)`);
      else router.replace("/home");
    });
  }, [router]);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setEmail(trimmed);
    setStep("code");
  }

  async function verify(token: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setBusy(false);
    if (err) {
      setCode("");
      return setError(
        err.message.includes("expired")
          ? "That code has expired. Send a new one."
          : "That code isn't right. Try again.",
      );
    }
    router.replace("/home");
  }

  async function continueWith(provider: OAuthProvider) {
    setOauthBusy(provider);
    setError(null);
    setNotice(null);
    try {
      if ((await signInWithProvider(provider)) === "signed-in")
        router.replace("/home");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in didn't finish. Try again.",
      );
    } finally {
      setOauthBusy(null);
    }
  }

  async function resend() {
    setNotice(null);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    if (err) setError(err.message);
    else setNotice("New code sent.");
  }

  // Form near the top + the screen lifting with the keyboard (padding works on
  // both platforms with Android edge-to-edge), so the field and button are
  // never hidden behind the keyboard; scrolls on very small screens.
  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: c.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <LogoMark size={48} />
          <Text style={[styles.brand, { color: c.textStrong }]}>
            {step === "email"
              ? "Welcome to\nOctonote AI."
              : "Check your\nemail."}
          </Text>
          <Text style={[styles.tagline, { color: c.textSecondary }]}>
            {step === "email" ? (
              "Sign in or create your free account."
            ) : (
              <>
                Enter the 6-digit code we sent to{" "}
                <Text style={{ color: c.textStrong, fontWeight: "600" }}>
                  {email}
                </Text>
                .
              </>
            )}
          </Text>

          {step === "email" ? (
            <View style={styles.form}>
              {PROVIDERS.filter((p) => enabled.includes(p.id)).map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => void continueWith(p.id)}
                  disabled={busy || oauthBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${p.label}`}
                  style={({ pressed }) => [
                    styles.button,
                    styles.oauthButton,
                    {
                      borderColor: c.separator,
                      backgroundColor: pressed ? c.card : c.background,
                      opacity: oauthBusy && oauthBusy !== p.id ? 0.5 : 1,
                    },
                  ]}
                >
                  {oauthBusy === p.id ? (
                    <ActivityIndicator color={c.textStrong} />
                  ) : (
                    <>
                      <Svg width={18} height={18} viewBox="0 0 24 24">
                        <Path d={p.icon} fill={c.textStrong} />
                      </Svg>
                      <Text style={[styles.oauthText, { color: c.textStrong }]}>
                        Continue with {p.label}
                      </Text>
                    </>
                  )}
                </Pressable>
              ))}
              {enabled.length > 0 && (
                <View style={styles.divider}>
                  <View
                    style={[styles.rule, { backgroundColor: c.separator }]}
                  />
                  <Text style={[styles.or, { color: c.textSubtle }]}>or</Text>
                  <View
                    style={[styles.rule, { backgroundColor: c.separator }]}
                  />
                </View>
              )}
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={c.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={sendCode}
                accessibilityLabel="Email address"
                style={[
                  styles.input,
                  {
                    color: c.textStrong,
                    backgroundColor: c.card,
                    borderColor: c.separator,
                  },
                ]}
              />
              <PrimaryButton
                label="Continue with email"
                busy={busy}
                onPress={sendCode}
                disabled={!email.trim()}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                value={code}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, "").slice(0, 6);
                  setCode(digits);
                  setError(null);
                  if (digits.length === 6) void verify(digits);
                }}
                placeholder="000000"
                placeholderTextColor={c.textSubtle}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                maxLength={6}
                style={[
                  styles.input,
                  styles.code,
                  {
                    color: c.textStrong,
                    backgroundColor: c.card,
                    borderColor: c.separator,
                  },
                ]}
                accessibilityLabel="6-digit sign-in code"
              />
              <PrimaryButton
                label="Sign in"
                busy={busy}
                onPress={() => void verify(code)}
                disabled={code.length !== 6}
              />
              <View style={styles.links}>
                <Text
                  style={[styles.link, { color: c.textSecondary }]}
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                    setNotice(null);
                  }}
                  suppressHighlighting
                >
                  ← Different email
                </Text>
                <Text
                  style={[styles.link, { color: c.textStrong }]}
                  onPress={resend}
                  suppressHighlighting
                >
                  Send a new code
                </Text>
              </View>
            </View>
          )}
          {error ? (
            <Text style={[styles.message, { color: c.danger }]}>{error}</Text>
          ) : null}
          {notice ? (
            <Text style={[styles.message, { color: c.textSecondary }]}>
              {notice}
            </Text>
          ) : null}

          <View style={styles.spacer} />
          <Text style={[styles.legal, { color: c.textSubtle }]}>
            By continuing, you agree to our{" "}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(`${env.WEB_URL}/terms`)}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(`${env.WEB_URL}/privacy`)}
            >
              Privacy Notice
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
  disabled,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: c.tint,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.onTint} />
      ) : (
        <Text style={[styles.buttonText, { color: c.onTint }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  brand: {
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 24,
  },
  tagline: { fontSize: 16, lineHeight: 23, marginTop: 10, marginBottom: 28 },
  form: { gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    fontSize: 17,
  },
  code: {
    fontSize: 28,
    letterSpacing: 10,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  button: {
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 17, fontWeight: "600" },
  oauthButton: {
    flexDirection: "row",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  oauthText: { fontSize: 17, fontWeight: "500" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  or: { fontSize: 14 },
  links: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  link: { fontSize: 15, fontWeight: "500", paddingVertical: 6 },
  message: { fontSize: 14, lineHeight: 20, marginTop: 12 },
  spacer: { flex: 1, minHeight: 32 },
  legal: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  legalLink: { textDecorationLine: "underline" },
});
