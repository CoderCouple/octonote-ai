import { Redirect } from "expo-router";
import { useAuth } from "@/providers/auth";
import { useOnboarding } from "@/providers/onboarding";

/** Waits for the stored session (and intro flag) so nobody sees the wrong screen flash. */
export default function Index() {
  const { session, loading } = useAuth();
  const { seen } = useOnboarding();
  if (loading || seen === null) return null;
  if (session) return <Redirect href="/notes" />;
  return <Redirect href={seen ? "/sign-in" : "/onboarding"} />;
}
