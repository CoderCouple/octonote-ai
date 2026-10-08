import { Redirect } from "expo-router";
import { useAuth } from "@/providers/auth";

/** Waits for the stored session so signed-in users never see a sign-in flash. */
export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Redirect href={session ? "/notes" : "/sign-in"} />;
}
