import { AuthShell, LoginForm } from "@/features/auth";
import { getEnabledProviders } from "@/features/auth/lib/enabled-providers";
import { DevAutoLogin } from "@/features/auth/dev-auto-login";
import { ReviewerLogin } from "@/features/auth/reviewer-login";

export const metadata = {
  title: "Sign in · Octonote AI",
  robots: { index: false, follow: true },
};

export default async function LoginPage() {
  const providers = await getEnabledProviders();
  return (
    <AuthShell>
      <LoginForm mode="login" providers={providers} />
      <ReviewerLogin />
      <DevAutoLogin />
    </AuthShell>
  );
}
