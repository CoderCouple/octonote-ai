import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AnimatedSplash, useSplashReplays } from "@/components/animated-splash";
import { AuthProvider, useAuth } from "@/providers/auth";
import { OnboardingProvider, useOnboarding } from "@/providers/onboarding";
import { QueryProvider } from "@/providers/query";

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <QueryProvider>
        <AuthProvider>
          <OnboardingProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, animation: "fade" }}
              />
              <Stack.Screen
                name="sign-in"
                options={{ headerShown: false, animation: "fade" }}
              />
              <Stack.Screen name="analytics/[kind]/[id]" options={{ title: "Analytics" }} />
              <Stack.Screen
                name="settings"
                options={{ presentation: "modal", title: "Account" }}
              />
            </Stack>
            <Splash />
          </OnboardingProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

/** Holds the splash until we know where to send the user. */
function Splash() {
  const { loading } = useAuth();
  const { seen } = useOnboarding();
  const replays = useSplashReplays();
  return <AnimatedSplash key={replays} ready={!loading && seen !== null} />;
}
