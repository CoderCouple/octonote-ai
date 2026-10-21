"use client";

/**
 * Add a creator, or edit one. Adding suggests a unique code from the name
 * (PRIYA, or PRIYA2 if taken) and can create their audience offer — a promo
 * code with the same name. The code can't change after that: it's already in
 * their posts.
 */
import type { PartnerCreate, PartnerDetail, PartnerDiscount } from "@octonote/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPartner, suggestPartnerCode, updatePartner } from "../api";
import { errorText } from "./ui";

const FOREVER = "forever";
const MONTH_CHOICES = ["6", "12", "24", FOREVER];

/** The audience offers we hand out; "none" = only the tracking link. */
const OFFERS: { value: string; label: string; discount: PartnerDiscount | null }[] = [
  { value: "none", label: "No offer, just the link", discount: null },
  { value: "free1", label: "1 month of Pro free", discount: { kind: "free_pro", freeMonths: 1 } },
  { value: "free3", label: "3 months of Pro free", discount: { kind: "free_pro", freeMonths: 3 } },
  { value: "off20", label: "20% off the first year", discount: { kind: "percent_off", percentOff: 20, duration: "repeating", durationMonths: 12 } },
  { value: "off30", label: "30% off the first 3 months", discount: { kind: "percent_off", percentOff: 30, duration: "repeating", durationMonths: 3 } },
];

export function PartnerDialog({
  open,
  onOpenChange,
  partner,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The creator to edit; null to add one. */
  partner: PartnerDetail | null;
  onSaved: (partner: PartnerDetail) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [percent, setPercent] = useState("30");
  const [months, setMonths] = useState("12");
  const [offer, setOffer] = useState("free1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Once staff type a code themselves, stop replacing it with suggestions.
  const codeTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    codeTouched.current = false;
    setName(partner?.name ?? "");
    setCode(partner?.code ?? "");
    setEmail(partner?.email ?? "");
    setPercent(String(partner?.commissionPercent ?? 30));
    setMonths(partner ? (partner.commissionMonths === null ? FOREVER : String(partner.commissionMonths)) : "12");
    setOffer("free1");
    setNote(partner?.note ?? "");
  }, [open, partner]);

  // Suggest a free code from the name as staff type it.
  useEffect(() => {
    if (partner || codeTouched.current || !name.trim()) return;
    const t = setTimeout(() => {
      suggestPartnerCode(name.trim())
        .then((r) => {
          if (!codeTouched.current) setCode(r.code);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [name, partner]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const common = {
      name: name.trim(),
      email: email.trim(),
      commissionPercent: Number(percent),
      commissionMonths: months === FOREVER ? null : Number(months),
      note,
    };
    try {
      const saved = partner
        ? await updatePartner(partner.id, common)
        : await createPartner({
            ...common,
            code: code.trim() || undefined,
            discount: OFFERS.find((o) => o.value === offer)?.discount ?? undefined,
          } as PartnerCreate);
      onSaved(saved);
      toast.success(partner ? `Saved ${saved.name}.` : `Added ${saved.name} with the code ${saved.code}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const pct = Number(percent);
  const valid = name.trim() && Number.isInteger(pct) && pct >= 0 && pct <= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{partner ? `Edit ${partner.name}` : "Add a creator"}</DialogTitle>
            <DialogDescription>
              {partner
                ? `Their code ${partner.code} stays the same: it's already in their posts.`
                : "They get a unique code: a link that counts everyone they bring in, and an offer for their audience."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pt-name">Name</Label>
              <Input id="pt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Bagde" autoFocus />
            </div>
            {partner ? null : (
              <div className="grid gap-1.5">
                <Label htmlFor="pt-code">Code</Label>
                <Input
                  id="pt-code"
                  value={code}
                  onChange={(e) => {
                    codeTouched.current = true;
                    setCode(e.target.value.toUpperCase());
                  }}
                  placeholder="PRIYA"
                  className="font-mono"
                />
                <p className="text-muted-foreground text-xs">
                  Link: octonote.ai/?ref={(code || "code").toLowerCase()}
                </p>
              </div>
            )}
            <div className={partner ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
              <Label htmlFor="pt-email">Email (for reports)</Label>
              <Input id="pt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pt-percent">Their share of payments</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pt-percent"
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pt-months">For how long</Label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger id="pt-months" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_CHOICES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === FOREVER ? "As long as they pay" : `First ${m} months of each person`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {partner ? null : (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pt-offer">Offer for their audience (code {code || "…"})</Label>
                <Select value={offer} onValueChange={setOffer}>
                  <SelectTrigger id="pt-offer" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFERS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pt-note">Note</Label>
              <Textarea id="pt-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Frontend educator, 55k on LinkedIn" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {partner ? "Save" : "Add creator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
