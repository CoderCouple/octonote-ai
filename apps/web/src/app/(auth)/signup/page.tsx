import { AuthBackdrop, LoginForm } from "@/features/auth";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6 md:p-10">
      <AuthBackdrop showOrb={false} />
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <LoginForm mode="signup" />
      </div>
    </div>
  );
}
