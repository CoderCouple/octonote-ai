import { redirect } from "next/navigation";

/** Promo codes moved to the admin portal. */
export default function OldAdminCodesPage() {
  redirect("/workspace/admin-open?to=/admin/codes");
}
