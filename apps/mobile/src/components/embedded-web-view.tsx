/**
 * Hosts a web-app editor route (note, canvas, project) inside a WebView —
 * the Notion model: native chrome, one editor codebase.
 *
 * Auth handoff: the Supabase session goes to the web app's /embed/enter
 * route in the URL *fragment* (never sent to a server or logged), which
 * sets the web session and replaces itself with the target route.
 * Off-origin links open in the system browser instead of trapping the user.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { env } from "@/lib/env";
import { usePalette } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

export function EmbeddedWebView({ path }: { path: string }) {
  const { session } = useAuth();
  const c = usePalette();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uri = useMemo(() => {
    if (!session) return null;
    const at = encodeURIComponent(session.access_token);
    const rt = encodeURIComponent(session.refresh_token);
    return `${env.WEB_URL}/embed/enter?to=${encodeURIComponent(path)}#at=${at}&rt=${rt}`;
    // Tokens refresh in the background; reloading the editor on every rotation would lose edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, Boolean(session)]);

  if (!uri) return null;

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.errorTitle, { color: c.text }]}>Couldn't open the editor</Text>
        <Text style={[styles.errorBody, { color: c.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <WebView
        source={{ uri }}
        style={[styles.fill, { backgroundColor: c.background }]}
        originWhitelist={["*"]}
        // The web app hides its own back/home chrome when it sees this marker.
        applicationNameForUserAgent="OctonoteApp"
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith(env.WEB_URL) || req.url.startsWith("about:")) return true;
          void Linking.openURL(req.url).catch(() => undefined);
          return false;
        }}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => setError(e.nativeEvent.description || "Failed to load.")}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setError(`Server returned ${e.nativeEvent.statusCode}.`);
        }}
      />
      {loading ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.background }]}>
          <ActivityIndicator color={c.textSecondary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: "600" },
  errorBody: { fontSize: 13, marginTop: 6, textAlign: "center" },
});
