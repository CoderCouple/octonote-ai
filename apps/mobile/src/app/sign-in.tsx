/**
 * Email + 6-digit code sign-in. The code is in the same email as the web
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
import { LogoMark } from "@/components/logo-mark";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { usePalette } from "@/lib/theme";

type Step = "email" | "code";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!devLogin) return;
    setNotice("Dev mode: signing you in automatically…");
    void supabase.auth.signInWithPassword(devLogin).then(({ error: err }) => {
      if (err)
        setError(`Dev auto-login failed: ${err.message} (run pnpm dev:user)`);
      else router.replace("/notes");
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
    router.replace("/notes");
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
              "Sign in or create an account with a one-time code."
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
