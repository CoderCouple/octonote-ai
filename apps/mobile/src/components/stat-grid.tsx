/**
 * The four stat cards above a list — same numbers and copy as the web app
 * (libraryStats in @octonote/shared), laid out 2×2 for a phone.
 */
import { libraryStats } from "@octonote/shared";
import { StyleSheet, Text, View } from "react-native";
import type { ListItem } from "@/features/resources";
import { usePalette } from "@/lib/theme";

export function StatGrid({ items, noun }: { items: ListItem[]; noun: string }) {
  const c = usePalette();
  const tiles = libraryStats(
    items.map((i) => ({
      access: i.access ?? "private",
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    })),
    noun,
  );
  return (
    <View style={styles.grid}>
      {tiles.map((t) => (
        <View
          key={t.key}
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.separator },
          ]}
        >
          <View style={styles.top}>
            <Text
              style={[styles.label, { color: c.textSecondary }]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
            <View style={[styles.badge, { borderColor: c.separator }]}>
              <Text style={[styles.badgeText, { color: c.text }]}>
                {t.up ? "↗" : "↘"} {t.badge}
              </Text>
            </View>
          </View>
          <Text style={[styles.value, { color: c.textStrong }]}>
            {t.value.toLocaleString()}
          </Text>
          <Text
            style={[styles.bold, { color: c.textStrong }]}
            numberOfLines={1}
          >
            {t.bold}
          </Text>
          <Text
            style={[styles.hint, { color: c.textSecondary }]}
            numberOfLines={1}
          >
            {t.hint}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  label: { fontSize: 13, flexShrink: 1 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  value: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  bold: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  hint: { fontSize: 12, marginTop: 2 },
});
