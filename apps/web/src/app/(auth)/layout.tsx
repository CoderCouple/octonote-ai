import { SiteAnalytics } from "@/lib/product-analytics/analytics-components";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
      <SiteAnalytics />
    </div>
  );
}
