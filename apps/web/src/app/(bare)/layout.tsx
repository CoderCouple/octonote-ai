/** Pages without the site's chrome: the embed player and print layouts. */
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-background text-foreground min-h-svh">{children}</div>;
}
