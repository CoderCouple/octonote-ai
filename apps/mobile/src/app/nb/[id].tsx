/**
 * Inside a notebook — mirrors the web page: a header (name, item count, last
 * updated, published), All / Notes / Canvases / Projects tabs with counts,
 * sorting, and + to add a note, canvas or project to the notebook.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { BookOpen, Plus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ActionSheet } from "@/components/action-sheet";
import { FilterBar, type Tab } from "@/components/filter-bar";
import { HeaderIconButton } from "@/components/header-buttons";
import { ResourceList } from "@/components/resource-list";
import {
  createResource,
  LABEL,
  ROUTE,
  useNotebook,
  useWorkspaceId,
  type ListItem,
  type ResourceKind,
} from "@/features/resources";
import { usePalette } from "@/lib/theme";
import { handlePlanLimit } from "@/lib/upgrade";

type KindTab = "all" | "page" | "canvas" | "project";
type ChildKind = Exclude<ResourceKind, "notebook">;
type SortKey = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

const KIND_TABS: { key: KindTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "page", label: "Notes" },
  { key: "canvas", label: "Canvases" },
  { key: "project", label: "Projects" },
];
const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: "updated-desc", label: "Updated (newest)", short: "Newest" },
  { key: "updated-asc", label: "Updated (oldest)", short: "Oldest" },
  { key: "name-asc", label: "Name (A → Z)", short: "A → Z" },
  { key: "name-desc", label: "Name (Z → A)", short: "Z → A" },
];
const CHILD_KINDS: ChildKind[] = ["page", "canvas", "project"];

export default function NotebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const c = usePalette();
  const workspaceId = useWorkspaceId();
  const nb = useNotebook(id);
  const [tab, setTab] = useState<KindTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated-desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const canEdit =
    nb.data?.notebook.myRole === "editor" ||
    nb.data?.notebook.myRole === "owner";
  const items = useMemo(() => nb.data?.items ?? [], [nb.data]);

  const tabs: Tab<KindTab>[] = KIND_TABS.map((t) => ({
    ...t,
    count:
      t.key === "all"
        ? items.length
        : items.filter((i) => i.kind === t.key).length,
  }));

  const visible = useMemo(() => {
    const rows = tab === "all" ? items : items.filter((i) => i.kind === tab);
    const by: Record<SortKey, (a: ListItem, b: ListItem) => number> = {
      "updated-desc": (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      "updated-asc": (a, b) => a.updatedAt.localeCompare(b.updatedAt),
      "name-asc": (a, b) => a.title.localeCompare(b.title),
      "name-desc": (a, b) => b.title.localeCompare(a.title),
    };
    return [...rows].sort(by[sortKey]);
  }, [items, tab, sortKey]);

  const lastUpdated = items.reduce<string | null>(
    (max, i) => (!max || i.updatedAt > max ? i.updatedAt : max),
    null,
  );

  async function create(kind: ChildKind) {
    // New items go in the notebook's own workspace, not necessarily the active one.
    const target = nb.data?.notebook.workspaceId ?? workspaceId;
    if (!target) return;
    try {
      const newId = await createResource(kind, target, id);
      void qc.invalidateQueries({ queryKey: ["notebook", id] });
      router.push(ROUTE[kind](newId));
    } catch (e) {
      if (handlePlanLimit(e)) return;
      Alert.alert(
        "Couldn't create",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const name = nb.data?.notebook.name ?? "";
  const meta = [
    `${items.length} ${items.length === 1 ? "item" : "items"}`,
    lastUpdated
      ? `Updated ${new Date(lastUpdated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : null,
    nb.data?.notebook.publishedAt ? "Published" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: canEdit
            ? () => (
                <HeaderIconButton
                  sf="plus"
                  icon={Plus}
                  label="Add to notebook"
                  onPress={() => setAddOpen(true)}
                />
              )
            : undefined,
        }}
      />
      <ResourceList
        readOnly={!canEdit}
        items={nb.data ? visible : undefined}
        loading={nb.isLoading}
        refreshing={nb.isRefetching}
        onRefresh={() => void nb.refetch()}
        error={nb.error}
        emptyKind={items.length ? undefined : "notebook"}
        emptyText={
          items.length
            ? `No ${KIND_TABS.find((t) => t.key === tab)!.label.toLowerCase()} in this notebook.`
            : "This notebook is empty. Add notes, canvases and projects — they're shared and published along with the notebook."
        }
        emptyAction={
          canEdit
            ? { label: "Add to notebook", onPress: () => setAddOpen(true) }
            : undefined
        }
        header={
          nb.data ? (
            <View>
              <View style={styles.head}>
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: c.fill, borderColor: c.separator },
                  ]}
                >
                  <BookOpen size={22} color={c.textStrong} strokeWidth={1.8} />
                </View>
                <View style={styles.headText}>
                  <Text
                    numberOfLines={2}
                    style={[styles.name, { color: c.textStrong }]}
                  >
                    {name || "Untitled notebook"}
                  </Text>
                  <Text style={[styles.meta, { color: c.textSecondary }]}>
                    {meta}
                  </Text>
                </View>
              </View>
              {items.length ? (
                <FilterBar
                  tabs={tabs}
                  active={tab}
                  onSelect={setTab}
                  sortLabel={SORTS.find((s) => s.key === sortKey)!.short}
                  onSort={() => setSortOpen(true)}
                />
              ) : null}
            </View>
          ) : null
        }
      />
      <ActionSheet
        visible={addOpen}
        title="Add to notebook"
        onClose={() => setAddOpen(false)}
        options={CHILD_KINDS.map((kind) => ({
          label: `New ${LABEL[kind].one}`,
          onPress: () => void create(kind),
        }))}
      />
      <ActionSheet
        visible={sortOpen}
        title="Sort by"
        onClose={() => setSortOpen(false)}
        options={SORTS.map((s) => ({
          label: s.label,
          selected: s.key === sortKey,
          onPress: () => setSortKey(s.key),
        }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, gap: 2 },
  name: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  meta: { fontSize: 14 },
});
