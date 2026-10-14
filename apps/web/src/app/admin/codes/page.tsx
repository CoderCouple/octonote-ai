"use client";

/**
 * Admin → Promo codes. Octonote staff create discount and free-Pro codes for
 * founders, creators, students and partners, see who used each, and switch
 * codes off. The API enforces admin-only (users.is_admin, web sessions only);
 * everyone else sees "Admins only".
 */
import {
  describePromo,
  type PromoAudience,
  type PromoCodeCreate,
  type PromoCodeDto,
  type PromoDuration,
  type PromoKind,
  type PromoRedemptionDto,
} from "@octonote/shared";
import { Loader2, Plus, ShieldCheck, Ticket, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createPromoCodeClientApi,
  listPromoCodesClientApi,
  listPromoRedemptionsClientApi,
  setPromoCodeEnabledClientApi,
} from "@/features/billing";
import { cn } from "@/lib/utils";

const AUDIENCES: PromoAudience[] = [
  "founder",
  "creator",
  "student",
  "partner",
  "general",
];
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const errorText = (err: unknown) =>
  err instanceof Error
    ? err.message.replace(/^Octonote API \S+ \d+(?: \[[A-Z_]+\])?: /, "")
    : "Something went wrong.";

export default function AdminCodesPage() {
  const [codes, setCodes] = useState<PromoCodeDto[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PromoCodeDto | null>(null);

  const load = useCallback(() => {
    listPromoCodesClientApi()
      .then(setCodes)
      .catch(() => setForbidden(true));
  }, []);
  useEffect(load, [load]);

  async function toggle(code: PromoCodeDto, enabled: boolean) {
    setCodes(
      (list) =>
        list?.map((c) => (c.id === code.id ? { ...c, enabled } : c)) ?? null,
    );
    try {
      await setPromoCodeEnabledClientApi(code.id, enabled);
      toast.success(
        `${code.code} ${enabled ? "switched on" : "switched off"}.`,
      );
    } catch (err) {
      toast.error(errorText(err));
      load();
    }
  }

  if (forbidden) {
    return (
      <div className="text-muted-foreground flex min-h-[60vh] flex-col items-center justify-center gap-2 text-sm">
        <ShieldCheck className="size-6" />
        Admins only.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-2xs font-semibold tracking-[0.12em] uppercase">
            Admin
          </p>
          <h1 className="text-foreground-strong text-2xl font-bold tracking-tight">
            Promo codes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discounts are applied through Stripe at checkout; free codes give
            Pro straight away, no card.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New code
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Code</TableHead>
              <TableHead>Gives</TableHead>
              <TableHead className="hidden md:table-cell">For</TableHead>
              <TableHead>Used</TableHead>
              <TableHead className="hidden lg:table-cell">Expires</TableHead>
              <TableHead className="hidden lg:table-cell">Personal</TableHead>
              <TableHead className="pr-4 text-right">On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes === null ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : codes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-12 text-center text-sm"
                >
                  No codes yet. Create one for your founders, creators or
                  students.
                </TableCell>
              </TableRow>
            ) : (
              codes.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn("cursor-pointer", !c.enabled && "opacity-60")}
                  onClick={() => setViewing(c)}
                >
                  <TableCell className="pl-4">
                    <span className="text-foreground-strong font-mono font-semibold">
                      {c.code}
                    </span>
                    {c.note ? (
                      <span className="text-muted-foreground block max-w-56 truncate text-xs">
                        {c.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell className="hidden capitalize md:table-cell">
                    <Badge variant="outline">{c.audience}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {c.redemptionCount} / {c.maxRedemptions ?? "∞"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {fmtDate(c.expiresAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-48 truncate lg:table-cell">
                    {c.assignedEmail ?? "—"}
                  </TableCell>
                  <TableCell
                    className="pr-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => void toggle(c, v)}
                      aria-label={`${c.code} on`}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateCodeDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => {
          setCodes((list) => [c, ...(list ?? [])]);
          toast.success(`Created ${c.code}: ${c.description}.`);
        }}
      />
      <RedemptionsSheet code={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function randomCode(prefix: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

function CreateCodeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (code: PromoCodeDto) => void;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<PromoKind>("free_pro");
  const [audience, setAudience] = useState<PromoAudience>("creator");
  const [percentOff, setPercentOff] = useState("40");
  const [amountOff, setAmountOff] = useState("5");
  const [duration, setDuration] = useState<PromoDuration>("forever");
  const [durationMonths, setDurationMonths] = useState("3");
  const [freeMonths, setFreeMonths] = useState("6");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expires, setExpires] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      describePromo({
        kind,
        percentOff: Number(percentOff) || 0,
        amountOffCents: Math.round((Number(amountOff) || 0) * 100),
        duration,
        durationMonths: Number(durationMonths) || 0,
        freeMonths: Number(freeMonths) || 0,
      }),
    [kind, percentOff, amountOff, duration, durationMonths, freeMonths],
  );

  async function submit() {
    setBusy(true);
    setError(null);
    const discount = kind !== "free_pro";
    const body: PromoCodeCreate = {
      code: code.trim().toUpperCase(),
      kind,
      audience,
      ...(kind === "percent_off" ? { percentOff: Number(percentOff) } : {}),
      ...(kind === "amount_off"
        ? { amountOffCents: Math.round(Number(amountOff) * 100) }
        : {}),
      ...(discount ? { duration } : {}),
      ...(discount && duration === "repeating"
        ? { durationMonths: Number(durationMonths) }
        : {}),
      ...(kind === "free_pro" ? { freeMonths: Number(freeMonths) } : {}),
      ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
      // End of the chosen day, local time.
      ...(expires
        ? { expiresAt: new Date(`${expires}T23:59:59`).toISOString() }
        : {}),
      ...(email.trim() ? { assignedEmail: email.trim().toLowerCase() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    try {
      onCreated(await createPromoCodeClientApi(body));
      onOpenChange(false);
      setCode("");
      setEmail("");
      setNote("");
      setMaxRedemptions("");
      setExpires("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = "flex flex-col gap-1.5";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New promo code</DialogTitle>
          <DialogDescription>
            <Ticket className="mr-1 inline size-3.5" />
            {code.trim() ? (
              <b className="font-mono">{code.trim().toUpperCase()}</b>
            ) : (
              "This code"
            )}{" "}
            gives <b>{preview}</b>
            {email.trim() ? ` — only for ${email.trim()}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={field}>
            <Label htmlFor="pc-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="pc-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FOUNDER"
                className="font-mono uppercase"
                maxLength={40}
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setCode(randomCode(audience.toUpperCase()))}
              >
                <Wand2 className="size-4" />
                Generate
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              3–40 letters, digits, - or _. Matched without caring about case.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={field}>
              <Label>Gives</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as PromoKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free_pro">Free Pro (no card)</SelectItem>
                  <SelectItem value="percent_off">Percent off</SelectItem>
                  <SelectItem value="amount_off">Amount off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={field}>
              <Label>For</Label>
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as PromoAudience)}
              >
                <SelectTrigger className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a} className="capitalize">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "free_pro" ? (
            <div className={field}>
              <Label htmlFor="pc-free">Months of free Pro</Label>
              <Input
                id="pc-free"
                type="number"
                min={1}
                max={36}
                value={freeMonths}
                onChange={(e) => setFreeMonths(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {kind === "percent_off" ? (
                <div className={field}>
                  <Label htmlFor="pc-pct">Percent off</Label>
                  <Input
                    id="pc-pct"
                    type="number"
                    min={1}
                    max={100}
                    value={percentOff}
                    onChange={(e) => setPercentOff(e.target.value)}
                  />
                </div>
              ) : (
                <div className={field}>
                  <Label htmlFor="pc-amt">Amount off (USD)</Label>
                  <Input
                    id="pc-amt"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={amountOff}
                    onChange={(e) => setAmountOff(e.target.value)}
                  />
                </div>
              )}
              <div className={field}>
                <Label>For how long</Label>
                <Select
                  value={duration}
                  onValueChange={(v) => setDuration(v as PromoDuration)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">First payment</SelectItem>
                    <SelectItem value="repeating">Some months</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {duration === "repeating" ? (
                <div className={field}>
                  <Label htmlFor="pc-months">Months</Label>
                  <Input
                    id="pc-months"
                    type="number"
                    min={1}
                    max={36}
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={field}>
              <Label htmlFor="pc-max">Max uses</Label>
              <Input
                id="pc-max"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
              />
            </div>
            <div className={field}>
              <Label htmlFor="pc-exp">Expires</Label>
              <Input
                id="pc-exp"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </div>
          </div>

          <div className={field}>
            <Label htmlFor="pc-email">
              Personal code — only this email (optional)
            </Label>
            <Input
              id="pc-email"
              type="email"
              placeholder="creator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={field}>
            <Label htmlFor="pc-note">Note (optional)</Label>
            <Textarea
              id="pc-note"
              rows={2}
              placeholder="e.g. YouTube partnership, Oct 2026"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || code.trim().length < 3}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Create code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedemptionsSheet({
  code,
  onClose,
}: {
  code: PromoCodeDto | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PromoRedemptionDto[] | null>(null);
  useEffect(() => {
    if (!code) return;
    setRows(null);
    listPromoRedemptionsClientApi(code.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [code]);

  return (
    <Sheet open={code !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono">{code?.code}</SheetTitle>
          <SheetDescription>
            {code?.description} · used {code?.redemptionCount} /{" "}
            {code?.maxRedemptions ?? "∞"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
          {rows === null ? (
            <Loader2 className="text-muted-foreground mx-auto my-8 size-5 animate-spin" />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nobody has used this code yet.
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-lg border px-3 py-2.5 text-sm">
                <p className="text-foreground-strong font-medium">
                  {r.user?.name ?? "Deleted account"}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {r.user?.email ?? "—"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {r.workspace?.name ?? "Deleted workspace"} ·{" "}
                  {fmtDate(r.createdAt)}
                  {r.proUntil
                    ? ` · Pro until ${fmtDate(r.proUntil)}`
                    : r.stripeSubscriptionId
                      ? " · paying"
                      : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
