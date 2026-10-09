/**
 * Monochrome area chart of views or visitors per bucket — the native twin of
 * the web chart. Touch and drag to read a bucket's value.
 */
import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import type { Analytics } from "@/features/resources";
import { usePalette } from "@/lib/theme";

const H = 170;
const PAD_TOP = 10;

export function formatBucket(
  iso: string,
  unit: Analytics["unit"],
  long = false,
) {
  const d = new Date(iso);
  if (unit === "hour")
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  if (unit === "month")
    return d.toLocaleDateString(undefined, {
      month: long ? "long" : "short",
      ...(long ? { year: "numeric" } : {}),
    });
  const day = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return unit === "week" && long ? `Week of ${day}` : day;
}

export function ViewsChart({
  buckets,
  unit,
  noun,
}: {
  buckets: { start: string; value: number }[];
  unit: Analytics["unit"];
  noun: [string, string];
}) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const x = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / max);
  const line = buckets
    .map(
      (b, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(n - 1)},${H} L${x(0)},${H} Z`;
  const pick = (e: GestureResponderEvent) =>
    width > 0 &&
    setActive(
      Math.max(
        0,
        Math.min(
          n - 1,
          Math.round((e.nativeEvent.locationX / width) * (n - 1)),
        ),
      ),
    );
  const a = active !== null ? buckets[active] : null;
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <View>
      <View style={styles.readout}>
        <Text style={[styles.readoutText, { color: c.textSecondary }]}>
          {a
            ? `${formatBucket(a.start, unit, true)} · `
            : "Touch the chart to see a value"}
          {a ? (
            <Text style={{ color: c.textStrong, fontWeight: "700" }}>
              {a.value.toLocaleString()} {a.value === 1 ? noun[0] : noun[1]}
            </Text>
          ) : null}
        </Text>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setActive(null)}
        style={{ height: H }}
        accessibilityLabel={`${noun[1]} chart`}
      >
        {width > 0 ? (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.textStrong} stopOpacity={0.16} />
                <Stop offset="1" stopColor={c.textStrong} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={width}
                y1={PAD_TOP + (H - PAD_TOP) * f}
                y2={PAD_TOP + (H - PAD_TOP) * f}
                stroke={c.separator}
                strokeDasharray="3 4"
              />
            ))}
            <Line
              x1={0}
              x2={width}
              y1={H - 0.5}
              y2={H - 0.5}
              stroke={c.separator}
            />
            <Path d={area} fill="url(#fill)" />
            <Path
              d={line}
              fill="none"
              stroke={c.textStrong}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {active !== null ? (
              <Line
                x1={x(active)}
                x2={x(active)}
                y1={0}
                y2={H}
                stroke={c.textSubtle}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.ticks}>
        {ticks.map((t) => (
          <Text key={t} style={[styles.tick, { color: c.textSecondary }]}>
            {buckets[t] ? formatBucket(buckets[t].start, unit) : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { height: 22, justifyContent: "center", marginBottom: 6 },
  readoutText: { fontSize: 12 },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  tick: { fontSize: 11 },
});
