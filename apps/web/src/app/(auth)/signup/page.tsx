import { AuthShell, LoginForm } from "@/features/auth";

export const metadata = {
  title: "Create your account · Octonote AI",
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return (
    <AuthShell>
      <LoginForm mode="signup" />
    </AuthShell>
  );
}
