import { AuthShell, LoginForm } from "@/features/auth";
import { getEnabledProviders } from "@/features/auth/lib/enabled-providers";

export const metadata = {
  title: "Create your account · Octonote AI",
  robots: { index: false, follow: true },
};

export default async function SignupPage() {
  const providers = await getEnabledProviders();
  return (
    <AuthShell>
      <LoginForm mode="signup" providers={providers} />
    </AuthShell>
  );
}
