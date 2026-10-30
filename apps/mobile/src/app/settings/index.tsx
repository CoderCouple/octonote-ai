/**
 * Settings — one page with the same sections as the web app's Settings:
 * Account, Appearance, Notifications, Workspace, Memberships, Plan & billing,
 * About, Danger zone and Delete account.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { initials, useOpenSupportEmail } from "@/components/account-panel";
import { replaySplash } from "@/components/animated-splash";
import { Field, Item, Section, SettingsScreen } from "@/components/settings-ui";
import {
  useActiveMembership,
  useBilling,
  useMe,
  type WorkspaceRole,
} from "@/features/resources";
import { openPlans } from "@/lib/upgrade";
import { FREE_LIMIT, PRO_PRICE, type LimitedKind, type SupportAccessStatus } from "@octonote/shared";
import { setActiveWorkspaceId } from "@/lib/active-workspace";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { usePalette, type Palette } from "@/lib/theme";
import {
  setThemeChoice,
  useThemeChoice,
  type ThemeChoice,
} from "@/lib/theme-preference";
import { useAuth } from "@/providers/auth";
import { useOnboarding } from "@/providers/onboarding";

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function Settings() {
  const c = usePalette();
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const me = useMe().data;
  const active = useActiveMembership();
  const theme = useThemeChoice();
  const onboarding = useOnboarding();
  const openSupportEmail = useOpenSupportEmail();

  const role = active?.membership.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const publicUrl = active ? `${env.WEB_URL}/p/${active.workspace.slug}` : "";

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Settings" }} />

      <Section
        title="Account"
        description="Your personal profile. Used everywhere you appear in Octonote AI."
      >
        <Field
          first
          label="Profile"
          description="Pulled from your sign-in identity."
        >
          <View style={[styles.avatar, { backgroundColor: c.tint }]}>
            <Text style={[styles.avatarText, { color: c.onTint }]}>
              {initials(me?.user.name)}
            </Text>
          </View>
        </Field>
        <DisplayName
          c={c}
          name={me?.user.name ?? ""}
          email={me?.user.email ?? ""}
        />
        <Field label="Email" description={me?.user.email}>
          <CopyButton c={c} value={me?.user.email ?? ""} />
        </Field>
        <Field label="Sign out" description="End your session on this device.">
          <SmallButton
            c={c}
            label="Sign out"
            onPress={async () => {
              await signOut();
              qc.clear();
              if (router.canDismiss()) router.dismissAll();
              router.replace("/sign-in");
            }}
          />
        </Field>
      </Section>

      <Section
        title="Appearance"
        description="Octonote AI is monochrome on purpose. Pick the brightness you prefer."
      >
        <Field first label="Theme" stacked>
          <View style={styles.segment}>
            {THEMES.map((t) => {
              const on = theme === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setThemeChoice(t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.segmentItem,
                    {
                      borderColor: on ? c.textStrong : c.separator,
                      backgroundColor: on ? c.pressed : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: on ? c.textStrong : c.textSecondary },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      </Section>

      <NotificationsSection c={c} />
      <PrivacySection c={c} />

      <Section
        title="Workspace"
        description="The shared container for your projects, notes, and canvases."
      >
        <WorkspaceName
          c={c}
          workspaceId={active?.workspace.id}
          name={active?.workspace.name ?? ""}
          canManage={canManage}
        />
        <Field label="Public URL" description={publicUrl || " "}>
          <CopyButton c={c} value={publicUrl} />
        </Field>
        <Field label="Workspace ID" description={active?.workspace.id ?? " "}>
          <CopyButton c={c} value={active?.workspace.id ?? ""} />
        </Field>
        <Field label="Your role">
          {role ? <RoleBadge c={c} role={role} /> : null}
        </Field>
      </Section>

      <Section
        title="Memberships"
        description="Every workspace you belong to. Pick one to make it active."
      >
        {(me?.memberships ?? []).map((m, i) => {
          const current = m.workspace.id === active?.workspace.id;
          return (
            <Field
              key={m.workspace.id}
              first={i === 0}
              label={m.workspace.name}
              description={m.membership.role.toLowerCase()}
            >
              {current ? (
                <Text style={[styles.current, { color: c.textSecondary }]}>
                  Current
                </Text>
              ) : (
                <SmallButton
                  c={c}
                  label="Switch"
                  onPress={() => {
                    setActiveWorkspaceId(m.workspace.id);
                    void Haptics.selectionAsync().catch(() => {});
                  }}
                />
              )}
            </Field>
          );
        })}
      </Section>

      <PlanSection c={c} />

      <Section title="About" description="The fine print.">
        <Item
          first
          label="Terms of Service"
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${env.WEB_URL}/terms`)
          }
        />
        <Item
          label="Privacy Notice"
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${env.WEB_URL}/privacy`)
          }
        />
        <Item label="Help & feedback" onPress={openSupportEmail} />
        <Item label="Version" detail={Constants.expoConfig?.version ?? "—"} />
      </Section>

      {role === "OWNER" && active ? (
        <Section
          title="Danger zone"
          description="Irreversible actions. Owner-only."
          danger
        >
          <Field
            first
            label="Delete workspace"
            description="Removes all projects, notes, canvases, and shares. Cannot be undone."
            stacked
          >
            <SmallButton
              c={c}
              danger
              label="Delete workspace"
              onPress={() => router.push("/settings/delete-workspace")}
            />
          </Field>
        </Section>
      ) : null}

      <Section title="Delete account" danger>
        <Field
          first
          label="Delete account"
          description="Permanently deletes your account, your workspace and everything in it, and removes you from anything shared with you. Cannot be undone."
          stacked
        >
          <SmallButton
            c={c}
            danger
            label="Delete account"
            onPress={() => router.push("/settings/delete-account")}
          />
        </Field>
      </Section>

      {__DEV__ ? (
        <Section title="Developer">
          <Item
            first
            label="Replay intro"
            onPress={() => {
              onboarding.reset();
              if (router.canDismiss()) router.dismissAll();
              router.push("/onboarding");
            }}
          />
          <Item
            label="Replay splash"
            onPress={() => {
              if (router.canDismiss()) router.dismissAll();
              replaySplash();
            }}
          />
        </Section>
      ) : null}
    </SettingsScreen>
  );
}

type Prefs = { emailOnShare: boolean; analytics?: boolean };

/** The preference switches (Notifications and Privacy share one query). */
function usePrefs() {
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.get<Prefs>("/me/preferences"),
  });
  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api.patch("/me/preferences", patch),
    onMutate: (patch) =>
      qc.setQueryData<Prefs>(["preferences"], (p) => (p ? { ...p, ...patch } : p)),
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ["preferences"] });
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    },
  });
  return { prefs, save };
}

function NotificationsSection({ c }: { c: Palette }) {
  const { prefs, save } = usePrefs();
  return (
    <Section
      title="Notifications"
      description="New shares also show up on Home under “Shared with you”."
    >
      <Field
        first
        label="Email me when someone shares with me"
        description="A note, canvas, project or notebook shared with your email."
      >
        <Switch
          value={prefs.data?.emailOnShare ?? true}
          disabled={!prefs.data}
          onValueChange={(v) => save.mutate({ emailOnShare: v })}
          trackColor={{ true: c.tint }}
        />
      </Field>
    </Section>
  );
}

/** "Help improve Octonote": usage analytics for this person (off stops the API sending anything). */
function PrivacySection({ c }: { c: Palette }) {
  const { prefs, save } = usePrefs();
  return (
    <Section title="Privacy" description="Published pages and the people who read them are never tracked.">
      <Field
        first
        label="Help improve Octonote"
        description="Share how you use the app with the Octonote team. Never what you write or draw."
      >
        <Switch
          value={prefs.data?.analytics ?? true}
          disabled={!prefs.data}
          onValueChange={(v) => save.mutate({ analytics: v })}
          trackColor={{ true: c.tint }}
        />
      </Field>
      <SupportAccessField c={c} />
    </Section>
  );
}

/**
 * Support access (staff call it Piggyback): let Octonote support view this
 * account read-only while they look into a problem, for 24 hours or 7 days.
 * Turning it off ends a visit in progress. Same API as web Settings.
 */
function SupportAccessField({ c }: { c: Palette }) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["support-access"],
    queryFn: () => api.get<SupportAccessStatus>("/me/support-access"),
  });
  const save = useMutation({
    mutationFn: (days: 0 | 1 | 7) =>
      days
        ? api.put<SupportAccessStatus>("/me/support-access", { days })
        : api.delete<SupportAccessStatus>("/me/support-access"),
    onSuccess: (data) => qc.setQueryData(["support-access"], data),
    onError: (e) => Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e)),
  });

  const until = status.data?.grantedUntil ? new Date(status.data.grantedUntil) : null;
  const when = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  function toggle(on: boolean) {
    if (!on) return save.mutate(0);
    Alert.alert("Allow support access?", "Octonote support can view your account, read-only. They can't change anything.", [
      { text: "Cancel", style: "cancel" },
      { text: "For 24 hours", onPress: () => save.mutate(1) },
      { text: "For 7 days", onPress: () => save.mutate(7) },
    ]);
  }

  const visits = status.data?.sessions ?? [];
  return (
    <Field
      label="Support access"
      description={
        (until
          ? `Support can view your account, read-only, until ${when(until)}.`
          : "Let Octonote support view your account, read-only, while they look into a problem you reported.") +
        (visits.length
          ? `\nLast support visit: ${when(new Date(visits[0]!.startedAt))}.`
          : "")
      }
    >
      <Switch
        value={Boolean(until)}
        disabled={!status.data || save.isPending}
        onValueChange={toggle}
        trackColor={{ true: c.tint }}
      />
    </Field>
  );
}

/** Your display name — shown in the app and as the author on published pages. */
function DisplayName({
  c,
  name,
  email,
}: {
  c: Palette;
  name: string;
  email: string;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(name), [name]);
  const placeholderName = name !== "" && name === email.split("@")[0];
  const dirty = value.trim() !== "" && value.trim() !== name;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await api.patch("/me", { name: value.trim() });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      Alert.alert(
        "Couldn't update your name",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Field
      label="Name"
      description={
        placeholderName
          ? "Not set yet — published pages show no author name until you add one."
          : "Shown in the app and as the author on pages you publish."
      }
      stacked
    >
      <View style={styles.nameRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          editable={!saving}
          maxLength={80}
          placeholder="Your name"
          placeholderTextColor={c.textSubtle}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Your name"
          style={[
            styles.input,
            { color: c.textStrong, borderColor: c.separator },
          ]}
        />
        <SmallButton
          c={c}
          label={saving ? "" : "Save"}
          busy={saving}
          disabled={!dirty}
          onPress={save}
        />
      </View>
    </Field>
  );
}

function WorkspaceName({
  c,
  workspaceId,
  name,
  canManage,
}: {
  c: Palette;
  workspaceId?: string;
  name: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(name), [name]);
  const dirty = value.trim() !== "" && value.trim() !== name;

  async function save() {
    if (!workspaceId || !dirty) return;
    setSaving(true);
    try {
      await api.patch(`/workspaces/${workspaceId}`, { name: value.trim() });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      Alert.alert(
        "Couldn't rename",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Field
      first
      label="Name"
      description={
        canManage
          ? "Shown in the app, breadcrumbs, and shared links."
          : "Only owners and admins can rename the workspace."
      }
      stacked
    >
      <View style={styles.nameRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          editable={canManage && !saving}
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[
            styles.input,
            {
              color: c.textStrong,
              borderColor: c.separator,
              opacity: canManage ? 1 : 0.6,
            },
          ]}
        />
        {canManage ? (
          <SmallButton
            c={c}
            label={saving ? "" : "Save"}
            busy={saving}
            disabled={!dirty}
            onPress={save}
          />
        ) : null}
      </View>
    </Field>
  );
}

function CopyButton({ c, value }: { c: Palette; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <SmallButton
      c={c}
      label={copied ? "Copied" : "Copy"}
      icon={copied ? <Check size={14} color={c.textStrong} /> : undefined}
      disabled={!value}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        void Haptics.selectionAsync().catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}

function SmallButton({
  c,
  label,
  onPress,
  danger,
  disabled,
  busy,
  icon,
}: {
  c: Palette;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label || "Working"}
      style={({ pressed }) => [
        styles.button,
        danger
          ? { backgroundColor: c.danger, borderColor: c.danger }
          : {
              borderColor: c.separator,
              backgroundColor: pressed ? c.pressed : c.card,
            },
        { opacity: disabled ? 0.4 : pressed && danger ? 0.8 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={c.textSecondary} /> : icon}
      {label ? (
        <Text
          style={[styles.buttonText, { color: danger ? "#fff" : c.textStrong }]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RoleBadge({ c, role }: { c: Palette; role: WorkspaceRole }) {
  return (
    <View style={[styles.role, { borderColor: c.separator }]}>
      <Text style={[styles.roleText, { color: c.textSecondary }]}>{role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700" },
  segment: { flexDirection: "row", gap: 8 },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  segmentText: { fontSize: 14, fontWeight: "600" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    letterSpacing: 0,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
  },
  buttonText: { fontSize: 14, fontWeight: "600" },
  current: { fontSize: 14, fontWeight: "500" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  meter: { width: 120, gap: 6, alignItems: "flex-end" },
  meterText: { fontSize: 14, fontVariant: ["tabular-nums"] },
  meterTrack: { width: "100%", height: 6, borderRadius: 3, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 3 },
  role: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6 },
});

const USAGE_ROWS: [LimitedKind, string][] = [
  ["page", "Notes"],
  ["canvas", "Canvases"],
  ["project", "Projects"],
  ["notebook", "Notebooks"],
];

/** Plan, usage against the free limits, and the way to upgrade (on the web). */
function PlanSection({ c }: { c: Palette }) {
  const billing = useBilling().data;
  const pro = billing?.plan === "pro";
  const student = billing?.source === "student";
  return (
    <Section
      title="Plan & billing"
      description="Plans belong to the workspace. Pro removes every limit."
    >
      <Field
        first
        label="Current plan"
        description={
          student && billing?.currentPeriodEnd
            ? `Free for students until ${new Date(billing.currentPeriodEnd).toLocaleDateString()}. After that, Pro is $${PRO_PRICE.month}/month.`
            : pro
              ? billing?.currentPeriodEnd
                ? `${billing.cancelAtPeriodEnd ? "Ends" : "Renews"} on ${new Date(billing.currentPeriodEnd).toLocaleDateString()}.`
                : undefined
              : `Free includes ${FREE_LIMIT} of each and one workspace.`
        }
      >
        <View style={[styles.badge, { backgroundColor: c.tint }]}>
          <Text style={[styles.badgeText, { color: c.onTint }]}>
            {pro ? (student ? "Pro · Student" : "Pro") : "Free"}
          </Text>
        </View>
      </Field>
      {billing?.limits
        ? USAGE_ROWS.map(([k, label]) => {
            const used = billing.usage[k];
            const limit = billing.limits![k];
            return (
              <Field key={k} label={label}>
                <View style={styles.meter}>
                  <Text
                    style={[
                      styles.meterText,
                      { color: used >= limit ? c.textStrong : c.textSecondary },
                    ]}
                  >
                    {used} / {limit}
                  </Text>
                  <View
                    style={[styles.meterTrack, { backgroundColor: c.fill }]}
                  >
                    <View
                      style={[
                        styles.meterFill,
                        {
                          backgroundColor: c.textStrong,
                          width: `${Math.min(100, (used / limit) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </Field>
            );
          })
        : null}
      {billing?.billingEnabled && !student ? (
        <Field
          label={pro ? "Manage billing" : "Upgrade to Pro"}
          description={
            pro
              ? "Invoices, payment method and cancelling are on the web."
              : `$${PRO_PRICE.month}/month or $${PRO_PRICE.year}/year per workspace, on the web.`
          }
          stacked
        >
          <SmallButton
            c={c}
            label={pro ? "Manage on the web" : "See plans"}
            onPress={openPlans}
          />
        </Field>
      ) : null}
    </Section>
  );
}
