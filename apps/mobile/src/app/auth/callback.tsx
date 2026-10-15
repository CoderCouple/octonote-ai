/**
 * Landing route for OAuth redirects. The sign-in screen's browser session
 * normally captures the redirect itself (lib/oauth.ts); on Android the deep
 * link can also open the app here, so send the user on instead of showing an
 * unmatched-route screen.
 */
import { Redirect } from "expo-router";

export default function AuthCallback() {
  return <Redirect href="/" />;
}
