"use client";

/**
 * Admin → Student emails: the email endings that get the free student year
 * on first sign-in ("edu", "ac.uk", or one school like "ox.ac.uk"). About
 * 8,000 come from the world university list (scripts/university-domains-sql.mjs)
 * with their country, state or province and website.
 *
 * A world map and a by-country table show where they are; filters narrow the
 * list, and every row can be edited or switched off. Switching one off only
 * stops new sign-ups getting it; students already on it keep it.
 */
import type { StudentDomain } from "@octonote/shared";
import { ExternalLink, Loader2, Pencil, Plus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listStudentDomains, updateStudentDomain } from "@/features/admin/api";
import { StudentDomainDialog } from "@/features/admin/components/student-domain-dialog";
import { errorText, fmtDate, PageBody, PageHeader } from "@/features/admin/components/ui";
import { cn } from "@/lib/utils";

// The map's shapes are large; only this page loads them.
const WorldMap = dynamic(() => import("@/features/admin/components/world-map").then((m) => m.WorldMap), {
  ssr: false,
  loading: () => <div className="bg-muted/40 aspect-[960/470] w-full animate-pulse rounded-lg" />,
});

/** Rows shown at once; filters and search narrow the rest. */
const SHOWN = 100;
const ALL = "all";

type Source = typeof ALL | StudentDomain["source"];
type Status = typeof ALL | "on" | "off";
type Metric = "universities" | "students";

interface CountryGroup {
  code: string;
  name: string;
  endings: number;
  on: number;
  students: number;
}

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<StudentDomain[] | null>(null);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [source, setSource] = useState<Source>(ALL);
  const [status, setStatus] = useState<Status>(ALL);
  const [metric, setMetric] = useState<Metric>("universities");
  const [tab, setTab] = useState("endings");
  const [editing, setEditing] = useState<StudentDomain | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    listStudentDomains().then(setRows).catch((err) => toast.error(errorText(err)));
  }, []);

  function pickCountry(code: string | null) {
    setCountry(code);
    setRegion(null);
  }

  /** Every filter except country and state, so the map and country table stay whole. */
  const base = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase().replace(/^[.@]+/, "");
    return rows.filter(
      (d) =>
        (source === ALL || d.source === source) &&
        (status === ALL || d.enabled === (status === "on")) &&
        (!q ||
          d.suffix.includes(q) ||
          d.university?.toLowerCase().includes(q) ||
          d.label?.toLowerCase().includes(q) ||
          d.region?.toLowerCase().includes(q)),
    );
  }, [rows, query, source, status]);

  const byCountry = useMemo(() => {
    const groups = new Map<string, CountryGroup>();
    for (const d of base) {
      if (!d.countryCode) continue;
      const g = groups.get(d.countryCode) ?? {
        code: d.countryCode,
        name: d.country ?? d.countryCode,
        endings: 0,
        on: 0,
        students: 0,
      };
      g.endings += 1;
      if (d.enabled) g.on += 1;
      g.students += d.activeStudents;
      groups.set(d.countryCode, g);
    }
    return [...groups.values()].sort((a, b) => b.endings - a.endings || a.name.localeCompare(b.name));
  }, [base]);

  const mapValues = useMemo(
    () => new Map(byCountry.map((g) => [g.code, metric === "universities" ? g.endings : g.students])),
    [byCountry, metric],
  );

  const inCountry = useMemo(() => (country ? base.filter((d) => d.countryCode === country) : base), [base, country]);

  const regions = useMemo(() => {
    if (!country) return [];
    const counts = new Map<string, number>();
    for (const d of inCountry) if (d.region) counts.set(d.region, (counts.get(d.region) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [country, inCountry]);

  const matching = useMemo(
    () => (region ? inCountry.filter((d) => d.region === region) : inCountry),
    [inCountry, region],
  );
  const shown = useMemo(
    () =>
      [...matching]
        .sort((a, b) => b.activeStudents - a.activeStudents || a.suffix.localeCompare(b.suffix))
        .slice(0, SHOWN),
    [matching],
  );

  const countryName = country ? (byCountry.find((g) => g.code === country)?.name ?? country) : null;

  function saved(d: StudentDomain) {
    setRows((rs) => (rs ? (rs.some((r) => r.id === d.id) ? rs.map((r) => (r.id === d.id ? d : r)) : [...rs, d]) : [d]));
  }

  async function toggle(d: StudentDomain, enabled: boolean) {
    try {
      saved(await updateStudentDomain(d.id, { enabled }));
      toast.success(`${d.suffix} ${enabled ? "switched on" : "switched off"}.`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  function openDialog(d: StudentDomain | null) {
    setEditing(d);
    setDialogOpen(true);
  }

  return (
    <PageBody wide>
      <PageHeader
        title="Student emails"
        description="People who sign up with an email ending in one of these get Pro free for 12 months. Switching one off only affects new sign-ups."
      >
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" />
          Add ending
        </Button>
      </PageHeader>

      {rows === null ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Email endings" value={rows.length} sub={`${rows.filter((d) => d.enabled).length.toLocaleString()} on`} />
            <Stat
              label="Countries"
              value={new Set(rows.map((d) => d.countryCode).filter(Boolean)).size}
              sub={`${rows.filter((d) => !d.countryCode).length} endings span several, like .edu`}
            />
            <Stat
              label="Added by staff"
              value={rows.filter((d) => d.source === "manual").length}
              sub="the rest come from the world university list"
            />
          </div>

          <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-foreground-strong text-base font-semibold">Where they are</h2>
                <p className="text-muted-foreground text-sm">Darker means more. Click a country to filter.</p>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={metric}
                onValueChange={(v) => v && setMetric(v as Metric)}
              >
                <ToggleGroupItem value="universities">Universities</ToggleGroupItem>
                <ToggleGroupItem value="students">Students now</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="mx-auto w-full max-w-5xl">
              <WorldMap values={mapValues} selected={country} onSelect={pickCountry} unit={metric === "universities" ? "universities" : "students now"} />
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search endings, universities, states"
              aria-label="Search student emails"
              className="w-full sm:w-72"
            />
            <Select value={country ?? ALL} onValueChange={(v) => pickCountry(v === ALL ? null : v)}>
              <SelectTrigger className="w-52" aria-label="Country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={ALL}>All countries</SelectItem>
                {[...byCountry]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => (
                    <SelectItem key={g.code} value={g.code}>
                      {g.name} ({g.endings.toLocaleString()})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger className="w-44" aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any source</SelectItem>
                <SelectItem value="hipo">University list</SelectItem>
                <SelectItem value="manual">Added by staff</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger className="w-32" aria-label="On or off">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>On and off</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {country ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => pickCountry(null)}>
                {countryName}
                <X className="size-3.5" />
              </Button>
              {regions.map(([name, n]) => (
                <Button
                  key={name}
                  variant={region === name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRegion(region === name ? null : name)}
                >
                  {name}
                  <span className="text-xs opacity-70">{n}</span>
                </Button>
              ))}
            </div>
          ) : null}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="endings">Endings</TabsTrigger>
              <TabsTrigger value="countries">By country</TabsTrigger>
            </TabsList>

            <TabsContent value="endings" className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Showing {shown.length.toLocaleString()} of {matching.length.toLocaleString()}, most students first
              </p>
              <div className="bg-card overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Ending</TableHead>
                      <TableHead className="w-full min-w-56">University</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="hidden lg:table-cell">State or province</TableHead>
                      <TableHead className="text-right">Students now</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="hidden md:table-cell">Source</TableHead>
                      <TableHead className="text-right">On</TableHead>
                      <TableHead className="pr-4">
                        <span className="sr-only">Edit</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-muted-foreground py-10 text-center">
                          Nothing matches these filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      shown.map((d) => (
                        <TableRow key={d.id} className={cn(!d.enabled && "opacity-60")}>
                          <TableCell className="pl-4 font-mono">.{d.suffix}</TableCell>
                          <TableCell className="w-full max-w-0 min-w-56">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate" title={d.university ?? undefined}>
                                {d.university ?? "—"}
                              </span>
                              {d.website ? (
                                <a
                                  href={d.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground shrink-0"
                                  aria-label={`${d.university ?? d.suffix} website`}
                                >
                                  <ExternalLink className="size-3.5" />
                                </a>
                              ) : null}
                            </div>
                            {d.label ? <p className="text-muted-foreground truncate text-xs">{d.label}</p> : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {d.countryCode ? (
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => pickCountry(d.countryCode)}
                              >
                                {d.country ?? d.countryCode}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden lg:table-cell">{d.region ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.activeStudents}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(d.createdAt)}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline">{d.source === "hipo" ? "List" : "Staff"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch checked={d.enabled} onCheckedChange={(on) => toggle(d, on)} aria-label={`${d.suffix} on`} />
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0"
                              aria-label={`Edit ${d.suffix}`}
                              onClick={() => openDialog(d)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="countries">
              <div className="bg-card overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Country</TableHead>
                      <TableHead className="text-right">Endings</TableHead>
                      <TableHead className="text-right">On</TableHead>
                      <TableHead className="pr-4 text-right">Students now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCountry.map((g) => (
                      <TableRow
                        key={g.code}
                        className={cn("cursor-pointer", g.code === country && "bg-muted/50")}
                        onClick={() => {
                          pickCountry(g.code);
                          setTab("endings");
                        }}
                      >
                        <TableCell className="pl-4">
                          {g.name} <span className="text-muted-foreground text-xs">{g.code}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{g.endings.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.on.toLocaleString()}</TableCell>
                        <TableCell className="pr-4 text-right tabular-nums">{g.students.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <StudentDomainDialog open={dialogOpen} onOpenChange={setDialogOpen} domain={editing} onSaved={saved} />
    </PageBody>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-foreground-strong mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
    </div>
  );
}
