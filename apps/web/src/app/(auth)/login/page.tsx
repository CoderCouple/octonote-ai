import { AuthBackdrop, LoginForm } from "@/features/auth";
import { DevAutoLogin } from "@/features/auth/dev-auto-login";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6 md:p-10">
      <AuthBackdrop showOrb={false} />
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <LoginForm mode="login" />
      </div>
      <DevAutoLogin />
    </div>
  );
}
