import { AuthShell, LoginForm } from "@/features/auth";
import { DevAutoLogin } from "@/features/auth/dev-auto-login";

export const metadata = {
  title: "Sign in · Octonote AI",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm mode="login" />
      <DevAutoLogin />
    </AuthShell>
  );
}
