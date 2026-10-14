import type { AdminPlan } from "@octonote/shared";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "./ui";

const SOURCE: Record<string, string> = {
  stripe: "Paying",
  promo: "Code",
  student: "Student",
  grant: "Given by Octonote",
};

/** "Pro · Code until Mar 3, 2027" or "Free". */
export function PlanBadge({ plan }: { plan: AdminPlan }) {
  if (plan.plan !== "pro") return <Badge variant="outline">Free</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge>Pro</Badge>
      <span className="text-muted-foreground text-xs">
        {plan.source ? SOURCE[plan.source] : null}
        {plan.until ? ` · ${plan.source === "stripe" ? "renews" : "until"} ${fmtDate(plan.until)}` : null}
      </span>
    </span>
  );
}
