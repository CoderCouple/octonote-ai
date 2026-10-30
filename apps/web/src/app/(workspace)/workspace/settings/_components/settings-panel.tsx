"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  CreditCard,
  Handshake,
  Info,
  Check,
  Bot,
  Copy,
  Layers,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  Terminal,
  User as UserIcon,
  UserPlus,
  Users,
} from "lucide-react";
import type { SupportAccessStatus } from "@octonote/shared";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  deleteWorkspaceAction,
  renameWorkspaceAction,
  setActiveWorkspaceAction,
} from "@/features/workspaces";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { setAnalyticsAllowed } from "@/lib/product-analytics/posthog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { BillingSection } from "./billing-section";
import { CliSection } from "./cli-section";
import { ConnectedAppsSection } from "./connected-apps-section";
import { CreatorSection } from "./creator-section";
import { CopyButton, Row, SectionShell } from "./settings-ui";
import { clientApi } from "@/lib/api/client-fetch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL, supportMailto, type CreatorDashboard } from "@octonote/shared";

type Role = "OWNER" | "ADMIN" | "MEMBER";

interface MembershipRow {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

interface SettingsPanelProps {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  workspace: { id: string; name: string; slug: string };
  viewerRole: Role;
  memberships: MembershipRow[];
  activeWorkspaceId: string;
}

const SECTIONS = [
  { id: "account", label: "Account", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "memberships", label: "Memberships", icon: Layers },
  { id: "billing", label: "Plan & billing", icon: CreditCard },
  { id: "cli", label: "CLI & agents", icon: Terminal },
  { id: "connected-apps", label: "Connected apps", icon: Bot },
  { id: "creator", label: "Creator program", icon: Handshake },
  { id: "about", label: "About", icon: Info },
  { id: "danger", label: "Danger zone", icon: AlertTriangle },
  { id: "delete-account", label: "Delete account", icon: Trash2 },
] as const;

export function SettingsPanel({
  user,
  workspace,
  viewerRole,
  memberships,
  activeWorkspaceId,
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<string>("account");
  // Only our creators get the Creator program section.
  const [creator, setCreator] = useState<CreatorDashboard | null>(null);
  useEffect(() => {
    clientApi
      .get<{ creator: CreatorDashboard | null }>("/me/creator")
      .then((r) => setCreator(r.creator))
      .catch(() => setCreator(null));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // Again once the Creator program section appears.
  }, [creator]);

  const isOwner = viewerRole === "OWNER";

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-10 px-6 py-10 lg:px-10">
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-6">
          <p className="text-muted-foreground mb-3 px-2 text-xs font-medium uppercase tracking-wider">
            Settings
          </p>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => {
              if (s.id === "danger" && !isOwner) return null;
              if (s.id === "creator" && !creator) return null;
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {s.label}
                </a>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="flex-1 space-y-12 pb-24">
        <header>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage your account, appearance, and the{" "}
            <span className="text-foreground font-medium">
              {workspace.name}
            </span>{" "}
            workspace.
          </p>
        </header>

        <AccountSection user={user} />
        <AppearanceSection />
        <NotificationsSection />
        <PrivacySection userId={user.id} />
        <WorkspaceSection workspace={workspace} viewerRole={viewerRole} />
        <MembershipsSection
          memberships={memberships}
          activeWorkspaceId={activeWorkspaceId}
        />
        <BillingSection workspaceId={workspace.id} />
        <CliSection />
        <ConnectedAppsSection />
        {creator ? <CreatorSection creator={creator} /> : null}
        <AboutSection user={user} workspace={workspace} />
        {isOwner ? (
          <DangerSection
            workspaceId={workspace.id}
            workspaceName={workspace.name}
          />
        ) : null}
        <DeleteAccountSection email={user.email} />
      </main>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant="outline" className="font-normal uppercase tracking-wider">
      {role.toLowerCase()}
    </Badge>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function AccountSection({
  user,
}: {
  user: { name: string; email: string; avatarUrl: string | null };
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <SectionShell
      id="account"
      icon={UserIcon}
      title="Account"
      description="Your personal profile. Used everywhere you appear in Octonote AI."
    >
      <Row label="Profile" description="Pulled from your sign-in identity.">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.name} />
            ) : null}
            <AvatarFallback className="text-sm">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-foreground truncate text-sm font-medium">
              {user.name}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {user.email}
            </div>
          </div>
        </div>
      </Row>
      <DisplayNameRow name={user.name} email={user.email} />
      <Row
        label="Email"
        description="Change requires re-verifying via your identity provider."
      >
        <div className="flex items-center gap-2">
          <Input value={user.email} readOnly className="font-mono text-xs" />
          <CopyButton value={user.email} />
        </div>
      </Row>
      <Row label="Sign out" description="End your session on this device.">
        <Button variant="outline" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          Sign out
        </Button>
      </Row>
    </SectionShell>
  );
}

/** Your display name: shown in the app and as the author on published pages. */
function DisplayNameRow({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  // Accounts without a name start as the email's first part, which is never published.
  const placeholderName = name === email.split("@")[0];
  const dirty = value.trim() !== "" && value.trim() !== name;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await clientApi.patch("/me", { name: value.trim() });
      toast.success("Name updated.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update your name.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Row
      label="Name"
      description={
        placeholderName
          ? "Not set yet — published pages show no author name until you add one."
          : "Shown in the app and as the author on pages you publish."
      }
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          aria-label="Your name"
          placeholder="Your name"
          disabled={saving}
        />
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </form>
    </Row>
  );
}

function AppearanceSection() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (mounted ? theme : undefined) ?? "system";

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <SectionShell
      id="appearance"
      icon={Palette}
      title="Appearance"
      description="Octonote AI is monochrome on purpose. Pick the brightness you prefer."
    >
      <Row
        label="Theme"
        description={
          mounted ? `Currently resolving to ${resolvedTheme}.` : undefined
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {options.map((o) => {
            const Icon = o.icon;
            const active = current === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                className={cn(
                  "border-border flex flex-col items-center justify-center gap-2 rounded-md border px-3 py-4 text-xs transition-colors",
                  active
                    ? "border-foreground bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <Icon className="size-4" />
                {o.label}
              </button>
            );
          })}
        </div>
      </Row>
      <Row
        label="Accent"
        description="Strict monochrome — black, white, and grey only."
      >
        <div className="flex items-center gap-2">
          <div className="border-border size-6 rounded-full border bg-black" />
          <div className="border-border size-6 rounded-full border bg-white" />
          <div className="border-border bg-muted size-6 rounded-full border" />
          <span className="text-muted-foreground ml-2 text-xs">
            No color accents.
          </span>
        </div>
      </Row>
    </SectionShell>
  );
}

function NotificationsSection() {
  const [emailOnShare, setEmailOnShare] = useState<boolean | null>(null);
  useEffect(() => {
    clientApi
      .get<{ emailOnShare: boolean }>("/me/preferences")
      .then((p) => setEmailOnShare(p.emailOnShare))
      .catch(() => setEmailOnShare(true));
  }, []);

  async function toggle(next: boolean) {
    setEmailOnShare(next);
    try {
      await clientApi.patch("/me/preferences", { emailOnShare: next });
    } catch (err) {
      setEmailOnShare(!next);
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  return (
    <SectionShell
      id="notifications"
      icon={Bell}
      title="Notifications"
      description="New shares also show up on Home under “Shared with you”."
    >
      <Row
        label="Email me when someone shares with me"
        description="A note, canvas, project or notebook shared with your email."
      >
        <Switch
          checked={emailOnShare ?? true}
          disabled={emailOnShare === null}
          onCheckedChange={toggle}
          aria-label="Email me when someone shares with me"
        />
      </Row>
    </SectionShell>
  );
}

/**
 * "Help improve Octonote": usage analytics (PostHog) for this person. On by
 * default; off stops both the browser and the API from sending anything.
 */
function PrivacySection({ userId }: { userId: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    clientApi
      .get<{ analytics?: boolean }>("/me/preferences")
      .then((p) => setAllowed(p.analytics !== false))
      .catch(() => setAllowed(true));
  }, []);

  async function toggle(next: boolean) {
    setAllowed(next);
    setAnalyticsAllowed(userId, next);
    try {
      await clientApi.patch("/me/preferences", { analytics: next });
    } catch (err) {
      setAllowed(!next);
      setAnalyticsAllowed(userId, !next);
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  return (
    <SectionShell
      id="privacy"
      icon={ShieldCheck}
      title="Privacy"
      description="Published pages and the people who read them are never tracked."
    >
      <Row
        label="Help improve Octonote"
        description="Share how you use the app (which features, where you get stuck) with the Octonote team. Never what you write or draw: text is hidden and notes and canvases are left out. No cookies."
      >
        <Switch
          checked={allowed ?? true}
          disabled={allowed === null}
          onCheckedChange={toggle}
          aria-label="Help improve Octonote"
        />
      </Row>
      <SupportAccessRow />
    </SectionShell>
  );
}

const SUPPORT_CHOICES = [
  { value: "off", label: "Not allowed" },
  { value: "1", label: "For 24 hours" },
  { value: "7", label: "For 7 days" },
] as const;

/**
 * Support access: let Octonote support view this account read-only while
 * they look into a problem, plus every past visit. Withdrawing it ends a
 * visit in progress at once.
 */
function SupportAccessRow() {
  const [status, setStatus] = useState<SupportAccessStatus | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    clientApi
      .get<SupportAccessStatus>("/me/support-access")
      .then(setStatus)
      .catch(() => setStatus({ grantedUntil: null, sessions: [] }));
  }, []);

  async function choose(value: string) {
    setSaving(true);
    try {
      setStatus(
        value === "off"
          ? await clientApi.delete<SupportAccessStatus>("/me/support-access")
          : await clientApi.put<SupportAccessStatus>("/me/support-access", { days: Number(value) }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const until = status?.grantedUntil ? new Date(status.grantedUntil) : null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <Row
        label="Support access"
        description={
          until
            ? `Octonote support can view your account, read-only, until ${when(until.toISOString())}. They can't change anything.`
            : "Let Octonote support view your account, read-only, while they look into a problem you reported. They can't change anything, and every visit is listed here."
        }
      >
        <Select value={until ? "on" : "off"} onValueChange={choose} disabled={!status || saving}>
          <SelectTrigger className="w-40" aria-label="Support access">
            <SelectValue>{until ? "Allowed" : "Not allowed"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_CHOICES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {status && status.sessions.length > 0 ? (
        <div className="text-muted-foreground px-1 pb-2 text-xs">
          <p className="text-foreground mb-1 font-medium">Support visits</p>
          <ul className="space-y-0.5">
            {status.sessions.slice(0, 5).map((s) => (
              <li key={s.id}>
                {when(s.startedAt)} · read-only
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function AboutSection({
  user,
  workspace,
}: {
  user: SettingsPanelProps["user"];
  workspace: SettingsPanelProps["workspace"];
}) {
  // Built on click so the time and page are current.
  const openSupportEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = supportMailto({
      platform: "Web",
      system: navigator.userAgent,
      userId: user.id,
      email: user.email,
      workspaceName: workspace.name,
      workspaceId: workspace.id,
      location: window.location.pathname,
    });
  };

  return (
    <SectionShell
      id="about"
      icon={Info}
      title="About"
      description="The fine print."
    >
      <Row label="Terms of Service">
        <a
          href="/terms"
          className="text-foreground-strong text-sm font-medium underline underline-offset-4"
        >
          Read the terms
        </a>
      </Row>
      <Row label="Privacy Notice">
        <a
          href="/privacy"
          className="text-foreground-strong text-sm font-medium underline underline-offset-4"
        >
          Read the privacy notice
        </a>
      </Row>
      <Row
        label="Help & feedback"
        description="Opens an email with a few details that help us look into problems."
      >
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          onClick={openSupportEmail}
          className="text-foreground-strong text-sm font-medium underline underline-offset-4"
        >
          {SUPPORT_EMAIL}
        </a>
      </Row>
    </SectionShell>
  );
}

function WorkspaceSection({
  workspace,
  viewerRole,
}: {
  workspace: { id: string; name: string; slug: string };
  viewerRole: Role;
}) {
  const router = useRouter();
  const canManage = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const [name, setName] = useState(workspace.name);
  const [renaming, setRenaming] = useState(false);

  const handleRename = async () => {
    if (!name.trim() || name === workspace.name) return;
    setRenaming(true);
    const r = await renameWorkspaceAction(workspace.id, name.trim());
    setRenaming(false);
    if (!r.success) {
      toast.error(r.message);
      return;
    }
    toast.success("Workspace renamed");
    router.refresh();
  };

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${workspace.slug}`
      : `/p/${workspace.slug}`;

  return (
    <SectionShell
      id="workspace"
      icon={Building2}
      title="Workspace"
      description="The shared container for your projects, notes, and canvases."
    >
      <Row
        label="Name"
        description="Shown in the sidebar, breadcrumbs, and shared links."
      >
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            disabled={!canManage || renaming}
            className="flex-1"
          />
          <Button
            onClick={handleRename}
            disabled={
              !canManage || renaming || !name.trim() || name === workspace.name
            }
          >
            {renaming ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </Row>
      <Row
        label="Slug"
        description="Used in URLs for published pages and canvases."
      >
        <div className="flex items-center gap-2">
          <Input
            value={workspace.slug}
            readOnly
            className="font-mono text-xs"
          />
          <CopyButton value={publicUrl} label="Copy URL" />
        </div>
      </Row>
      <Row
        label="Workspace ID"
        description="Use this when filing support requests."
      >
        <div className="flex items-center gap-2">
          <Input value={workspace.id} readOnly className="font-mono text-xs" />
          <CopyButton value={workspace.id} />
        </div>
      </Row>
      <Row label="Your role">
        <RoleBadge role={viewerRole} />
      </Row>
    </SectionShell>
  );
}

function MembershipsSection({
  memberships,
  activeWorkspaceId,
}: {
  memberships: MembershipRow[];
  activeWorkspaceId: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);

  const onSwitch = async (id: string) => {
    if (id === activeWorkspaceId) return;
    setSwitching(id);
    await setActiveWorkspaceAction(id);
    router.refresh();
    setSwitching(null);
  };

  return (
    <SectionShell
      id="memberships"
      icon={Layers}
      title="Memberships"
      description="Every workspace you belong to. Pick one to make it active."
    >
      <div className="divide-border divide-y">
        {memberships.map((m) => {
          const active = m.id === activeWorkspaceId;
          return (
            <div key={m.id} className="flex items-center gap-4 p-5">
              <div className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-md text-xs font-semibold uppercase">
                {m.name.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground truncate text-sm font-medium">
                    {m.name}
                  </span>
                  {active ? (
                    <Badge variant="secondary" className="h-5 px-1.5 text-2xs">
                      Active
                    </Badge>
                  ) : null}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  octonote.ai/p/{m.slug}
                </div>
              </div>
              <RoleBadge role={m.role} />
              <Button
                variant={active ? "ghost" : "outline"}
                size="sm"
                disabled={active || switching === m.id}
                onClick={() => onSwitch(m.id)}
              >
                {switching === m.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {active ? "Current" : "Switch"}
              </Button>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function DangerSection({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== workspaceName) return;
    setDeleting(true);
    const r = await deleteWorkspaceAction(workspaceId);
    if (!r.success) {
      toast.error(r.message);
      setDeleting(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  };

  return (
    <>
      <section id="danger" className="scroll-mt-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="text-destructive bg-destructive/10 mt-0.5 grid size-8 place-items-center rounded-md">
            <AlertTriangle className="size-4" />
          </div>
          <div>
            <h2 className="text-foreground text-lg font-semibold leading-tight">
              Danger zone
            </h2>
            <p className="text-muted-foreground text-sm">
              Irreversible actions. Owner-only.
            </p>
          </div>
        </div>
        <div className="border-destructive/30 bg-card rounded-lg border">
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="text-foreground text-sm font-medium">
                Delete workspace
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                Removes all projects, notes, canvases, and shares. Cannot be
                undone.
              </div>
            </div>
            <Button variant="destructive" onClick={() => setOpen(true)}>
              Delete workspace
            </Button>
          </div>
          <Separator />
          <div className="text-muted-foreground p-5 text-xs">
            We don&apos;t keep backups of deleted workspaces. Export anything
            you need first.
          </div>
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirmName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{workspaceName}&rdquo;?</DialogTitle>
            <DialogDescription>
              This will permanently delete the workspace and all its contents.
              Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={workspaceName}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            disabled={deleting}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmName !== workspaceName}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Permanently deletes the signed-in account (and every workspace only you use). */
function DeleteAccountSection({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    try {
      await clientApi.delete("/me", {
        body: JSON.stringify({ confirmEmail: typed }),
      });
      await createSupabaseBrowserClient().auth.signOut();
      toast.success("Your account has been deleted.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      // "Octonote API /me 409: You're the only owner…" → just the reason.
      const message =
        err instanceof Error
          ? err.message.replace(/^Octonote API \S+ \d+: /, "")
          : "";
      toast.error(message || "Couldn't delete your account.");
      setDeleting(false);
    }
  }

  return (
    <>
      <section id="delete-account" className="scroll-mt-6">
        <div className="border-destructive/30 bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
          <div className="min-w-0">
            <div className="text-foreground text-sm font-medium">
              Delete account
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              Permanently deletes your account, your workspace and everything in
              it, and removes you from anything shared with you. Cannot be
              undone.
            </div>
          </div>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Your notes, canvases, projects and notebooks, published pages and
              shares will be deleted for good. Type your email address to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={email}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label="Your email address"
            disabled={deleting}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!matches || deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
