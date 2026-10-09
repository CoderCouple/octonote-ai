import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  createResource,
  LABEL,
  ROUTE,
  useResourceList,
  useWorkspaceId,
  type ResourceKind,
} from "@/features/resources";
import { Menu, Plus } from "lucide-react-native";
import { HeaderButtons, HeaderIconButton } from "./header-buttons";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { ResourceList } from "./resource-list";
import { StatGrid } from "./stat-grid";
import { ActionSheet } from "./action-sheet";
import { FilterBar, matchesFilter, type Filter } from "./filter-bar";

const EMPTY: Record<ResourceKind, string> = {
  page: "No notes yet.\nTap + to start writing.",
  canvas: "No canvases yet.\nTap + to start drawing.",
  project: "No projects yet.\nA project pairs one note with one canvas.",
  notebook:
    "No notebooks yet.\nGroup notes, canvases and projects — then share or publish them together.",
};

type SortKey = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: "updated-desc", label: "Updated (newest)", short: "Newest" },
  { key: "updated-asc", label: "Updated (oldest)", short: "Oldest" },
  { key: "name-asc", label: "Name (A → Z)", short: "A → Z" },
  { key: "name-desc", label: "Name (Z → A)", short: "Z → A" },
];

/** One tab: native large-title header, + to create, stats, filters and the list. */
export function KindTabScreen({ kind }: { kind: ResourceKind }) {
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = useWorkspaceId();
  const list = useResourceList(kind);
  const [creating, setCreating] = useState(false);
  // Only a pull shows the spinner; background refreshes stay silent.
  const [pulling, setPulling] = useState(false);
  useRefreshOnFocus(list.refetch);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated-desc");
  const [sortOpen, setSortOpen] = useState(false);

  const visible = useMemo(() => {
    const rows = (list.data ?? []).filter((i) =>
      matchesFilter(i.access, filter),
    );
    const by = {
      "updated-desc": (a: (typeof rows)[0], b: (typeof rows)[0]) =>
        b.updatedAt.localeCompare(a.updatedAt),
      "updated-asc": (a: (typeof rows)[0], b: (typeof rows)[0]) =>
        a.updatedAt.localeCompare(b.updatedAt),
      "name-asc": (a: (typeof rows)[0], b: (typeof rows)[0]) =>
        a.title.localeCompare(b.title),
      "name-desc": (a: (typeof rows)[0], b: (typeof rows)[0]) =>
        b.title.localeCompare(a.title),
    }[sortKey];
    return [...rows].sort(by);
  }, [list.data, filter, sortKey]);

  async function create() {
    if (!workspaceId) return;
    setCreating(true);
    try {
      const id = await createResource(kind, workspaceId);
      void qc.invalidateQueries({ queryKey: ["list", kind] });
      router.push(ROUTE[kind](id));
    } catch (e) {
      Alert.alert(
        "Couldn't create",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: LABEL[kind].many,
          // New + account menu both on the right (menu on the left felt off).
          headerRight: () => (
            <HeaderButtons>
              <HeaderIconButton
                sf="plus"
                icon={Plus}
                label={`New ${LABEL[kind].one}`}
                onPress={create}
                disabled={creating}
              />
              <HeaderIconButton
                sf="line.3.horizontal"
                icon={Menu}
                label="Account and settings"
                onPress={() => router.push("/settings")}
              />
            </HeaderButtons>
          ),
        }}
      />
      <ResourceList
        items={list.data ? visible : undefined}
        loading={list.isLoading}
        refreshing={pulling}
        onRefresh={() => {
          setPulling(true);
          void list.refetch().finally(() => setPulling(false));
        }}
        emptyText={
          list.data?.length
            ? `No ${LABEL[kind].many.toLowerCase()} match this filter.`
            : EMPTY[kind]
        }
        error={list.error}
        header={
          list.data?.length ? (
            <>
              <StatGrid
                items={list.data}
                noun={LABEL[kind].many.toLowerCase()}
              />
              <FilterBar
                items={list.data}
                filter={filter}
                onFilter={setFilter}
                sortLabel={SORTS.find((s) => s.key === sortKey)!.short}
                onSort={() => setSortOpen(true)}
              />
            </>
          ) : null
        }
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
