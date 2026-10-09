/** All / Private / Shared / Published with counts, plus the sort button — mirrors the web tabs. */
import type { Access } from "@octonote/shared";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ListItem } from "@/features/resources";
import { usePalette } from "@/lib/theme";

export type Filter = "all" | "private" | "shared" | "public";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "private", label: "Private" },
  { key: "shared", label: "Shared" },
  { key: "public", label: "Published" },
];

export function matchesFilter(access: Access | undefined, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "shared") return access === "shared" || access === "link";
  return (access ?? "private") === filter;
}

export function FilterBar({
  items,
  filter,
  onFilter,
  sortLabel,
  onSort,
}: {
  items: ListItem[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  sortLabel: string;
  onSort: () => void;
}) {
  const c = usePalette();
  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          const count = items.filter((i) =>
            matchesFilter(i.access, f.key),
          ).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => onFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                { backgroundColor: active ? c.pressed : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? c.textStrong : c.textSecondary },
                ]}
              >
                {f.label}
              </Text>
              <View
                style={[
                  styles.count,
                  { backgroundColor: active ? c.tint : c.fill },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    { color: active ? c.onTint : c.textSecondary },
                  ]}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={onSort}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${sortLabel}`}
        style={({ pressed }) => [
          styles.sort,
          {
            borderColor: c.separator,
            backgroundColor: pressed ? c.pressed : c.card,
          },
        ]}
      >
        <Text style={[styles.sortText, { color: c.textStrong }]}>
          ⇅
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 16,
    paddingBottom: 10,
  },
  chips: { gap: 4, paddingRight: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  chipText: { fontSize: 14, fontWeight: "600" },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  sort: {
    marginLeft: "auto",
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  sortText: { fontSize: 15, fontWeight: "600" },
});
