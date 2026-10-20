"use client";

/**
 * A world map shaded by a number per country (darker = more), for the admin
 * portal. Monochrome like the rest of the design: the shade is the text colour
 * at a strength that grows with the number. Click a country to pick it, click
 * it again (or the sea) to clear. Loaded only on admin pages.
 */
import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import countries from "i18n-iso-countries";
import { useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { cn } from "@/lib/utils";

const W = 960;
const H = 470;

type Country = Feature<Geometry, { name: string }> & { id?: string };

export function WorldMap({
  values,
  selected,
  onSelect,
  unit,
}: {
  /** ISO alpha-2 code → number shown for that country. */
  values: Map<string, number>;
  selected: string | null;
  onSelect: (code: string | null) => void;
  /** Shown in the hover title, e.g. "universities". */
  unit: string;
}) {
  const [shapes, setShapes] = useState<{ code: string | null; name: string; d: string }[] | null>(null);

  useEffect(() => {
    let live = true;
    // 50m keeps small countries (Singapore, Malta…) that 110m drops.
    void import("world-atlas/countries-50m.json").then((mod) => {
      const topo = (mod.default ?? mod) as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
      const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
      const projection = geoEqualEarth().fitSize([W, H], fc);
      const path = geoPath(projection);
      const out = (fc.features as Country[])
        .filter((f) => f.properties.name !== "Antarctica")
        .map((f) => ({
          code: f.id != null ? (countries.numericToAlpha2(String(f.id)) ?? null) : null,
          name: f.properties.name,
          d: path(f) ?? "",
        }));
      if (live) setShapes(out);
    });
    return () => {
      live = false;
    };
  }, []);

  const max = useMemo(() => Math.max(0, ...values.values()), [values]);
  // Log scale: one country with hundreds of schools shouldn't wash out the rest.
  const strength = (v: number) => (v > 0 && max > 0 ? 0.22 + 0.78 * (Math.log1p(v) / Math.log1p(max)) : 0);

  if (!shapes) {
    return <div className="bg-muted/40 aspect-[960/470] w-full animate-pulse rounded-lg" />;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="text-foreground-strong h-auto w-full"
      role="img"
      aria-label={`World map of ${unit} by country`}
      onClick={() => onSelect(null)}
    >
      {shapes.map((s, i) => {
        const v = s.code ? (values.get(s.code) ?? 0) : 0;
        const isSelected = s.code !== null && s.code === selected;
        return (
          <path
            key={`${s.code ?? s.name}-${i}`}
            d={s.d}
            fill="currentColor"
            fillOpacity={v > 0 ? strength(v) : 0.06}
            stroke="currentColor"
            strokeOpacity={isSelected ? 1 : 0.18}
            strokeWidth={isSelected ? 1.6 : 0.4}
            className={cn(s.code && v > 0 && "cursor-pointer hover:opacity-80")}
            onClick={(e) => {
              e.stopPropagation();
              if (!s.code || v === 0) return;
              onSelect(isSelected ? null : s.code);
            }}
          >
            <title>{`${s.name}: ${v.toLocaleString()} ${unit}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
