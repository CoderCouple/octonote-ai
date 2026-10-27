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
      {/* One column: the reviewer link sits under the form, not beside it. */}
      <div className="flex flex-col">
        <LoginForm mode="login" providers={providers} />
        <ReviewerLogin />
      </div>
      <DevAutoLogin />
    </AuthShell>
  );
}
