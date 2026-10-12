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
import { Plus } from "lucide-react-native";
import {
  HeaderAvatarButton,
  HeaderButtons,
  HeaderIconButton,
} from "./header-buttons";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { ResourceList } from "./resource-list";
import { StatGrid } from "./stat-grid";
import { ActionSheet } from "./action-sheet";
import {
  accessTabs,
  FilterBar,
  matchesFilter,
  type Filter,
} from "./filter-bar";
import { handlePlanLimit } from "@/lib/upgrade";

// Same wording as the web app's empty tables.
const EMPTY: Record<ResourceKind, string> = {
  page: "No notes yet. Create one to start writing.",
  canvas: "No canvases yet. Create one to start drawing.",
  project:
    "No projects yet. A project pairs one note with one canvas, side by side.",
  notebook:
    "No notebooks yet. Use them to group notes, canvases and projects — and share or publish them together.",
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
      // Free limit reached → upgrade prompt instead of an error.
      if (handlePlanLimit(e)) return;
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
          // Avatar (account panel) on the left, create on the right — same on every tab.
          headerLeft: () => <HeaderAvatarButton />,
          headerRight: () => (
            <HeaderButtons>
              <HeaderIconButton
                sf="plus"
                icon={Plus}
                label={`New ${LABEL[kind].one}`}
                onPress={create}
                disabled={creating}
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
        emptyKind={list.data?.length ? undefined : kind}
        emptyAction={{ label: `New ${LABEL[kind].one}`, onPress: create }}
        header={
          list.data?.length ? (
            <>
              <StatGrid
                items={list.data}
                noun={LABEL[kind].many.toLowerCase()}
              />
              <FilterBar
                tabs={accessTabs(list.data)}
                active={filter}
                onSelect={setFilter}
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
