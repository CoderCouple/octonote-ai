/**
 * Native analytics for one note / canvas / project / notebook: unique
 * visitors and views of its published page, with ranges — the twin of the
 * web Analytics panel. Opened from a list row's long-press menu.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ViewsChart } from "@/components/views-chart";
import {
  LABEL,
  useAnalytics,
  usePublishState,
  type AnalyticsRange,
  type ResourceKind,
} from "@/features/resources";
import { usePalette } from "@/lib/theme";

const RANGES: { value: AnalyticsRange; label: string; long: string }[] = [
  { value: "24h", label: "24h", long: "Last 24 hours" },
  { value: "7d", label: "7d", long: "Last 7 days" },
  { value: "30d", label: "30d", long: "Last 30 days" },
  { value: "6mo", label: "6mo", long: "Last 6 months" },
  { value: "1y", label: "1y", long: "Last year" },
];

type Metric = "visitors" | "views";

export default function AnalyticsScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{
    kind: ResourceKind;
    id: string;
    title?: string;
  }>();
  const kind = params.kind;
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [metric, setMetric] = useState<Metric>("visitors");
  const q = useAnalytics(kind, params.id, range);
  const publish = usePublishState(kind, params.id);
  const a = q.data;
  const rangeLong = RANGES.find((r) => r.value === range)!.long;

  return (
    <>
      <Stack.Screen options={{ title: "Analytics" }} />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.body}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.kicker, { color: c.textSecondary }]}>
          {LABEL[kind]?.one ?? "Item"} analytics
        </Text>
        <Text style={[styles.title, { color: c.textStrong }]} numberOfLines={2}>
          {params.title || "Untitled"}
        </Text>
        <Text style={[styles.lede, { color: c.textSecondary }]}>
          Readers of the published page. Anonymous — no cookies; bots and your
          own visits excluded.
        </Text>

        <View style={[styles.segment, { backgroundColor: c.fill }]}>
          {RANGES.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => setRange(r.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: range === r.value }}
              style={[
                styles.segmentItem,
                range === r.value && { backgroundColor: c.card },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: range === r.value ? c.textStrong : c.textSecondary },
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View
          style={[
            styles.card,
            { borderColor: c.separator, backgroundColor: c.card },
          ]}
        >
          <View style={[styles.metrics, { borderColor: c.separator }]}>
            {(["visitors", "views"] as const).map((m, i) => {
              const now = a ? (m === "views" ? a.total : a.visitors) : null;
              const before = a
                ? m === "views"
                  ? a.previousTotal
                  : a.previousVisitors
                : 0;
              const selected = metric === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMetric(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[
                    styles.metric,
                    i === 0 && {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderColor: c.separator,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.metricLabel,
                      { color: selected ? c.textStrong : c.textSecondary },
                    ]}
                  >
                    {m === "visitors" ? "Unique visitors" : "Views"}
                  </Text>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricValue, { color: c.textStrong }]}>
                      {now === null ? "—" : now.toLocaleString()}
                    </Text>
                    {now !== null ? <Change now={now} before={before} /> : null}
                  </View>
                  {selected ? (
                    <View
                      style={[
                        styles.underline,
                        { backgroundColor: c.textStrong },
                      ]}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chart}>
            {!a ? (
              <View style={styles.placeholder}>
                {q.isError ? (
                  <Text style={{ color: c.textSecondary }}>
                    Couldn&apos;t load analytics.
                  </Text>
                ) : (
                  <ActivityIndicator color={c.textSecondary} />
                )}
              </View>
            ) : a.allTime === 0 ? (
              <View style={styles.placeholder}>
                <Text style={[styles.emptyTitle, { color: c.textStrong }]}>
                  No views yet
                </Text>
                <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                  {publish.data?.published
                    ? "Views appear here when people open the published page."
                    : "Views are counted only while it's published. Publish it from the Share menu."}
                </Text>
              </View>
            ) : (
              <ViewsChart
                buckets={a.buckets.map((b) => ({
                  start: b.start,
                  value: b[metric],
                }))}
                unit={a.unit}
                noun={
                  metric === "views"
                    ? ["view", "views"]
                    : ["visitor", "visitors"]
                }
              />
            )}
          </View>
        </View>

        <View style={styles.tiles}>
          <Tile
            label="All-time visitors"
            value={a?.allTimeVisitors.toLocaleString()}
          />
          <Tile label="All-time views" value={a?.allTime.toLocaleString()} />
          <Tile
            label="Views per visitor"
            value={
              a
                ? a.visitors > 0
                  ? (a.total / a.visitors).toFixed(1)
                  : "—"
                : undefined
            }
            hint={rangeLong}
          />
          <Tile
            label="Last viewed"
            value={
              a
                ? a.lastViewedAt
                  ? relative(a.lastViewedAt)
                  : "Never"
                : undefined
            }
          />
        </View>

        <View style={[styles.fields, { borderColor: c.separator }]}>
          <Field label="Status">
            {publish.data
              ? publish.data.published
                ? publish.data.publishedVia
                  ? `Published via ${publish.data.publishedVia.name}`
                  : "Published"
                : "Not published"
              : "…"}
          </Field>
          {publish.data?.publicUrl ? (
            <Pressable
              onPress={() =>
                void Share.share({
                  message: publish.data!.publicUrl!,
                  url: publish.data!.publicUrl!,
                })
              }
            >
              <Field label="Public link">
                <Text
                  style={[styles.link, { color: c.textStrong }]}
                  numberOfLines={1}
                >
                  {publish.data.publicUrl.replace(/^https?:\/\//, "")} ↗
                </Text>
              </Field>
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.footnote, { color: c.textSecondary }]}>
          A visitor is counted once per day per page. Signed-in readers are
          counted by account; others by an anonymous hash that resets every day,
          so the same person on different days counts again.
        </Text>
      </ScrollView>
    </>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const c = usePalette();
  if (before === 0)
    return now > 0 ? (
      <Text style={[styles.badge, { borderColor: c.separator, color: c.text }]}>
        New
      </Text>
    ) : null;
  const change = Math.round(((now - before) / before) * 100);
  return (
    <Text style={[styles.badge, { borderColor: c.separator, color: c.text }]}>
      {change >= 0 ? "↗" : "↘"} {change > 0 ? "+" : ""}
      {change}%
    </Text>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string;
  hint?: string;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.tile,
        { borderColor: c.separator, backgroundColor: c.card },
      ]}
    >
      <Text style={[styles.tileLabel, { color: c.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.tileValue, { color: c.textStrong }]}>
        {value ?? "—"}
      </Text>
      {hint ? (
        <Text style={[styles.tileHint, { color: c.textSecondary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const c = usePalette();
  return (
    <View style={[styles.field, { borderColor: c.separator }]}>
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
        {label}
      </Text>
      {typeof children === "string" ? (
        <Text style={[styles.fieldValue, { color: c.textStrong }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

function relative(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "This hour";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 16 },
  kicker: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.6,
    marginTop: -8,
  },
  lede: { fontSize: 14, lineHeight: 20, marginTop: -6 },
  segment: { flexDirection: "row", borderRadius: 10, padding: 3 },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentText: { fontSize: 13, fontWeight: "600" },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
  metrics: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metric: { flex: 1, padding: 14 },
  metricLabel: { fontSize: 13 },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  underline: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  chart: { padding: 14 },
  placeholder: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600" },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  tileLabel: { fontSize: 12 },
  tileValue: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  tileHint: { fontSize: 11, marginTop: 2 },
  fields: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontSize: 14 },
  fieldValue: {
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  link: { fontSize: 13, fontFamily: "monospace", flexShrink: 1 },
  footnote: { fontSize: 12, lineHeight: 18 },
});
