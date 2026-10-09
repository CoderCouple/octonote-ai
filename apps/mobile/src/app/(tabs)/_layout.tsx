import { Redirect, Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/floating-tab-bar";
import { useAuth } from "@/providers/auth";

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  // Each tab keeps its own native stack (large titles, swipe back); only the
  // bottom bar is custom.
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="canvases" />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="notebooks" />
      <Tabs.Screen name="shared" />
    </Tabs>
  );
}
