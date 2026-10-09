import { AuthShell, LoginForm } from "@/features/auth";

export const metadata = { title: "Create your account · Octonote AI" };

export default function SignupPage() {
  return (
    <AuthShell>
      <LoginForm mode="signup" />
    </AuthShell>
  );
}
