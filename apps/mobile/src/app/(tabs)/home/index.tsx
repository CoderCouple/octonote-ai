/**
 * Home: pick up where you left off. Title search (in the header), what's been
 * shared with you (new shares marked "New"), then your most recently edited
 * notes, canvases, projects and notebooks as horizontal rows of cards.
 * Mirrors the web app's Home; "recent" means edits you made yourself.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, type Href } from "expo-router";
import { Plus, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActionSheet } from "@/components/action-sheet";
import { TAB_BAR_SPACE } from "@/components/floating-tab-bar";
import {
  HeaderAvatarButton,
  HeaderButtons,
  HeaderIconButton,
} from "@/components/header-buttons";
import {
  createResource,
  LABEL,
  useBilling,
  ROUTE,
  useMe,
  useRecentEdits,
  useResourceList,
  useSharedWithMe,
  useWorkspaceId,
  type ListItem,
  type ResourceKind,
} from "@/features/resources";
import { ACCESS_LABEL } from "@octonote/shared";
import { isNewShare, useSharedSeenAt } from "@/lib/shared-seen";
import { KIND_ICON } from "@/lib/kind-icons";
import { usePalette, type Palette } from "@/lib/theme";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { handlePlanLimit, nudgeIfAtLimit } from "@/lib/upgrade";

const PER_ROW = 6;
const ICON = KIND_ICON;
const SECTIONS: { kind: ResourceKind; tab: Href }[] = [
  { kind: "page", tab: "/notes" },
  { kind: "canvas", tab: "/canvases" },
  { kind: "project", tab: "/projects" },
  { kind: "notebook", tab: "/notebooks" },
];
const kindName = (kind: ResourceKind) =>
  LABEL[kind].one[0]!.toUpperCase() + LABEL[kind].one.slice(1);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export default function HomeTab() {
  const router = useRouter();
  const c = usePalette();
  const qc = useQueryClient();
  const me = useMe().data;
  const workspaceId = useWorkspaceId();
  const recent = useRecentEdits();
  const shared = useSharedWithMe();
  const seen = useSharedSeenAt();
  const lists = {
    page: useResourceList("page"),
    canvas: useResourceList("canvas"),
    project: useResourceList("project"),
    notebook: useResourceList("notebook"),
  };
  const billing = useBilling();
  const refetchAll = () =>
    Promise.all([
      billing.refetch(),
      recent.refetch(),
      shared.refetch(),
      ...Object.values(lists).map((l) => l.refetch()),
    ]);
  useRefreshOnFocus(refetchAll);
  const [pulling, setPulling] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Any kind at its free limit → upgrade prompt, at most once a day.
  useEffect(() => {
    if (workspaceId && billing.data)
      void nudgeIfAtLimit(workspaceId, billing.data);
  }, [workspaceId, billing.data]);
  const [query, setQuery] = useState("");

  async function create(kind: ResourceKind) {
    if (!workspaceId) return;
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
    }
  }

  // Title search across everything you can open, including what's shared with you.
  const q = query.trim().toLowerCase();
  const allItems = [
    ...Object.values(lists).flatMap((l) => l.data ?? []),
    ...(shared.data ?? []),
  ];
  const results = useMemo(() => {
    if (!q) return [];
    const keys = new Set<string>();
    return allItems
      .filter((i) => {
        const key = `${i.kind}:${i.id}`;
        if (keys.has(key)) return false;
        keys.add(key);
        return i.title.toLowerCase().includes(q);
      })
      .sort(
        (a, b) =>
          a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q),
      )
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, allItems.length]);

  const latestShared = [...(shared.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PER_ROW);
  const firstName = me?.user.name.split(" ")[0];
  const edits = recent.data;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Home",
          headerLeft: () => <HeaderAvatarButton />,
          headerRight: () => (
            <HeaderButtons>
              <HeaderIconButton
                sf="plus"
                icon={Plus}
                label="Create"
                onPress={() => setCreateOpen(true)}
              />
            </HeaderButtons>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE, gap: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={async () => {
              setPulling(true);
              await refetchAll().finally(() => setPulling(false));
            }}
          />
        }
      >
        {/* Our own field, not the native header search: on newer iOS that moves to
            the bottom of the screen, under the floating tab bar. */}
        <View style={[styles.search, { backgroundColor: c.fill }]}>
          <Search size={18} color={c.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title"
            placeholderTextColor={c.textSubtle}
            style={[styles.searchInput, { color: c.textStrong }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            accessibilityLabel="Search by title"
          />
          {query ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <X size={18} color={c.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {q ? (
          <SearchResults
            c={c}
            query={query.trim()}
            results={results}
            onOpen={(i) => router.push(ROUTE[i.kind](i.id))}
          />
        ) : (
          <>
            <View style={styles.greeting}>
              <Text style={[styles.hello, { color: c.textStrong }]}>
                Welcome back{firstName ? `, ${firstName}` : ""}
              </Text>
              <Text style={[styles.sub, { color: c.textSecondary }]}>
                Pick up where you left off.
              </Text>
            </View>

            {latestShared.length > 0 ? (
              <Section
                c={c}
                title="Shared with you"
                onViewAll={() => router.push("/shared")}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.row}
                >
                  {latestShared.map((item) => (
                    <Card
                      key={`${item.kind}:${item.id}`}
                      item={item}
                      meta={item.subtitle ?? kindName(item.kind)}
                      isNew={isNewShare(item.createdAt, seen)}
                      c={c}
                      onPress={() => router.push(ROUTE[item.kind](item.id))}
                    />
                  ))}
                </ScrollView>
              </Section>
            ) : null}

            {SECTIONS.map(({ kind, tab }) => {
              const items = (lists[kind].data ?? [])
                .flatMap((item) => {
                  const editedAt = edits?.get(`${kind}:${item.id}`);
                  return editedAt ? [{ item, editedAt }] : [];
                })
                .sort((a, b) => b.editedAt.localeCompare(a.editedAt))
                .slice(0, PER_ROW);
              return (
                <Section
                  key={kind}
                  c={c}
                  title={`Recent ${LABEL[kind].many.toLowerCase()}`}
                  onViewAll={() => router.navigate(tab)}
                >
                  {items.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.row}
                    >
                      {items.map(({ item, editedAt }) => (
                        <Card
                          key={item.id}
                          item={item}
                          meta={`${item.access ? `${ACCESS_LABEL[item.access]} · ` : ""}You edited ${formatDate(editedAt)}`}
                          c={c}
                          onPress={() => router.push(ROUTE[kind](item.id))}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={[styles.empty, { borderColor: c.separator }]}>
                      <Text
                        style={[styles.emptyText, { color: c.textSecondary }]}
                      >
                        {recent.isError || lists[kind].isError
                          ? "Couldn't load this. Pull down to try again."
                          : edits && lists[kind].data
                            ? `${LABEL[kind].many} you edit will show up here.`
                            : "Loading…"}
                      </Text>
                    </View>
                  )}
                </Section>
              );
            })}
          </>
        )}
      </ScrollView>
      <ActionSheet
        visible={createOpen}
        title="Create"
        onClose={() => setCreateOpen(false)}
        options={SECTIONS.map(({ kind }) => ({
          label: `New ${LABEL[kind].one}`,
          onPress: () => void create(kind),
        }))}
      />
    </>
  );
}

function Section({
  c,
  title,
  onViewAll,
  children,
}: {
  c: Palette;
  title: string;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: c.textStrong }]}>
          {title}
        </Text>
        <Pressable onPress={onViewAll} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.viewAll, { color: c.textSecondary }]}>
            View all
          </Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function SearchResults({
  c,
  query,
  results,
  onOpen,
}: {
  c: Palette;
  query: string;
  results: ListItem[];
  onOpen: (item: ListItem) => void;
}) {
  if (results.length === 0) {
    return (
      <Text style={[styles.noResults, { color: c.textSecondary }]}>
        Nothing called “{query}”.
      </Text>
    );
  }
  return (
    <View
      style={[
        styles.results,
        { borderColor: c.separator, backgroundColor: c.card },
      ]}
    >
      {results.map((item, i) => {
        const Icon = ICON[item.kind];
        return (
          <Pressable
            key={`${item.kind}:${item.id}`}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [
              styles.result,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: c.separator,
              },
              pressed && { backgroundColor: c.pressed },
            ]}
          >
            <Icon size={18} color={c.textSecondary} />
            <Text
              numberOfLines={1}
              style={[styles.resultTitle, { color: c.textStrong }]}
            >
              {item.title}
            </Text>
            <Text style={[styles.resultKind, { color: c.textSecondary }]}>
              {kindName(item.kind)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Card({
  item,
  meta,
  isNew,
  c,
  onPress,
}: {
  item: ListItem;
  meta: string;
  isNew?: boolean;
  c: Palette;
  onPress: () => void;
}) {
  const Icon = ICON[item.kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isNew ? `${item.title}, new` : item.title}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.card, borderColor: c.separator },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={[
          styles.preview,
          { backgroundColor: c.fill, borderColor: c.separator },
        ]}
      >
        {item.thumbnailUrl ? (
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : item.kind === "page" && item.subtitle && !isNew ? (
          <Text
            numberOfLines={4}
            style={[styles.snippet, { color: c.textSecondary }]}
          >
            {item.subtitle}
          </Text>
        ) : (
          <Icon size={36} strokeWidth={1.25} color={c.textSubtle} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Icon size={14} color={c.textSecondary} />
          <Text
            numberOfLines={1}
            style={[styles.cardTitle, { color: c.textStrong }]}
          >
            {item.title}
          </Text>
          {isNew ? (
            <View style={[styles.newBadge, { backgroundColor: c.tint }]}>
              <Text style={[styles.newText, { color: c.onTint }]}>NEW</Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: c.textSecondary }]}
        >
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: -12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  // Explicit spacing + line height: iOS otherwise drew the text letter-spaced here.
  searchInput: {
    flex: 1,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 20,
    paddingVertical: 0,
  },
  greeting: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  hello: { fontSize: 24, fontWeight: "700", letterSpacing: -0.4 },
  sub: { fontSize: 15 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", letterSpacing: -0.2 },
  viewAll: { fontSize: 15, fontWeight: "500" },
  row: { paddingHorizontal: 20, gap: 12 },
  card: {
    width: 168,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  preview: {
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  snippet: { fontSize: 12, lineHeight: 17, alignSelf: "stretch" },
  cardBody: { paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 13 },
  newBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  newText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  empty: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: { fontSize: 15 },
  noResults: {
    fontSize: 15,
    textAlign: "center",
    paddingTop: 32,
    paddingHorizontal: 20,
  },
  results: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  resultTitle: { flex: 1, fontSize: 16, fontWeight: "500" },
  resultKind: { fontSize: 13 },
});
