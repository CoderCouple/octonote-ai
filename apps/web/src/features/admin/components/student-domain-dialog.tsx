"use client";

/**
 * Add a student email ending, or edit one row: the ending itself, university,
 * country, state or province, website and the admin's note. Editing a row from
 * the world university list makes it staff's own, so a re-import never
 * overwrites it.
 */
import type { StudentDomain } from "@octonote/shared";
import countries from "i18n-iso-countries";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { addStudentDomain, updateStudentDomain } from "../api";
import { errorText } from "./ui";

const NO_COUNTRY = "none";
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Every ISO country, by English name. */
export function countryOptions() {
  return Object.keys(countries.getAlpha2Codes())
    .map((code) => ({ code, name: regionNames.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface Fields {
  suffix: string;
  university: string;
  countryCode: string;
  region: string;
  website: string;
  label: string;
}

const fieldsOf = (d: StudentDomain | null): Fields => ({
  suffix: d?.suffix ?? "",
  university: d?.university ?? "",
  countryCode: d?.countryCode ?? NO_COUNTRY,
  region: d?.region ?? "",
  website: d?.website ?? "",
  label: d?.label ?? "",
});

export function StudentDomainDialog({
  open,
  onOpenChange,
  domain,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row to edit; null to add a new ending. */
  domain: StudentDomain | null;
  onSaved: (domain: StudentDomain) => void;
}) {
  const [f, setF] = useState<Fields>(fieldsOf(domain));
  const [busy, setBusy] = useState(false);
  const options = useMemo(countryOptions, []);

  useEffect(() => {
    if (open) setF(fieldsOf(domain));
  }, [open, domain]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const details = {
      university: f.university,
      countryCode: f.countryCode === NO_COUNTRY ? "" : f.countryCode,
      region: f.region,
      website: f.website,
      label: f.label,
    };
    try {
      const saved = domain
        ? await updateStudentDomain(domain.id, { suffix: f.suffix, ...details })
        : await addStudentDomain({ suffix: f.suffix, ...details });
      onSaved(saved);
      toast.success(domain ? `Saved ${saved.suffix}.` : `Added ${saved.suffix}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{domain ? `Edit .${domain.suffix}` : "Add a student email ending"}</DialogTitle>
            <DialogDescription>
              {domain?.source === "hipo"
                ? "This row comes from the world university list. Once you edit it, re-importing the list won't change it."
                : "People who sign up with an email ending in this get Pro free for a year."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sd-suffix">Email ending</Label>
              <Input id="sd-suffix" value={f.suffix} onChange={set("suffix")} placeholder="ox.ac.uk" autoFocus={!domain} />
              {domain && f.suffix.trim().replace(/^[.@]+/, "").toLowerCase() !== domain.suffix ? (
                <p className="text-muted-foreground text-xs">
                  Students already on the free year keep it. New sign-ups are matched on the new ending.
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sd-university">University</Label>
              <Input id="sd-university" value={f.university} onChange={set("university")} placeholder="University of Oxford" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sd-country">Country</Label>
              <Select value={f.countryCode} onValueChange={(v) => setF({ ...f, countryCode: v })}>
                <SelectTrigger id="sd-country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NO_COUNTRY}>No country (spans several)</SelectItem>
                  {options.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sd-region">State or province</Label>
              <Input id="sd-region" value={f.region} onChange={set("region")} placeholder="England" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sd-website">Website</Label>
              <Input id="sd-website" type="url" value={f.website} onChange={set("website")} placeholder="https://www.ox.ac.uk" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sd-label">Note</Label>
              <Input id="sd-label" value={f.label} onChange={set("label")} placeholder="Added after a student emailed us" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !f.suffix.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {domain ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
