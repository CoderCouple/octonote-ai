/**
 * Tab chips with counts plus the sort button — mirrors the web tabs. Lists use
 * access tabs (All / Private / Shared / Published); a notebook uses type tabs.
 */
import type { Access } from "@octonote/shared";
import { ArrowUpDown, LayoutGrid, List } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ListItem } from "@/features/resources";
import type { ListView } from "@/lib/list-view";
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

/** The access tabs for a list, with counts. */
export function accessTabs(items: ListItem[]): Tab<Filter>[] {
  return FILTERS.map((f) => ({
    ...f,
    count: items.filter((i) => matchesFilter(i.access, f.key)).length,
  }));
}

export interface Tab<K extends string> {
  key: K;
  label: string;
  count: number;
}

export function FilterBar<K extends string>({
  tabs,
  active: activeKey,
  onSelect,
  sortLabel,
  onSort,
  view,
  onView,
}: {
  tabs: Tab<K>[];
  active: K;
  onSelect: (key: K) => void;
  sortLabel: string;
  onSort: () => void;
  /** With onView: a list/grid switch next to sort. */
  view?: ListView;
  onView?: (v: ListView) => void;
}) {
  const c = usePalette();
  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {tabs.map((f) => {
          const active = f.key === activeKey;
          const count = f.count;
          return (
            <Pressable
              key={f.key}
              onPress={() => onSelect(f.key)}
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
        <ArrowUpDown size={16} color={c.textStrong} strokeWidth={2} />
      </Pressable>
      {view && onView ? (
        <Pressable
          onPress={() => onView(view === "grid" ? "list" : "grid")}
          accessibilityRole="button"
          accessibilityLabel={
            view === "grid" ? "Show as a list" : "Show as a grid"
          }
          style={({ pressed }) => [
            styles.sort,
            styles.viewButton,
            {
              borderColor: c.separator,
              backgroundColor: pressed ? c.pressed : c.card,
            },
          ]}
        >
          {view === "grid" ? (
            <List size={16} color={c.textStrong} strokeWidth={2} />
          ) : (
            <LayoutGrid size={16} color={c.textStrong} strokeWidth={2} />
          )}
        </Pressable>
      ) : null}
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
  // Sits right after sort (sort's auto margin already pushes both right).
  viewButton: { marginLeft: 0 },
});
