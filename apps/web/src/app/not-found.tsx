import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ErrorScreen } from "@/components/error-screen";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Page Not Found"
      message="Don't worry, even the best data sometimes gets lost in the internet."
      actions={
        <Button asChild>
          <Link href="/workspace">
            <ArrowLeft className="size-4" />
            Back to workspace
          </Link>
        </Button>
      }
    />
  );
}
