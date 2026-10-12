import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ACCESS_LABEL } from "@octonote/shared";
import { useState, type ReactElement } from "react";
import { ActionSheet } from "./action-sheet";
import { EmptyIllustration, type EmptyKind } from "./empty-illustration";
import { TAB_BAR_SPACE } from "./floating-tab-bar";
import {
  deleteResource,
  LABEL,
  ROUTE,
  type ListItem,
} from "@/features/resources";
import { KIND_ICON } from "@/lib/kind-icons";
import { usePalette } from "@/lib/theme";

interface ResourceListProps {
  items: ListItem[] | undefined;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  emptyText: string;
  /** Viewers (e.g. "Shared"): no long-press delete. */
  readOnly?: boolean;
  error?: Error | null;
  /** Rendered above the rows (e.g. stat cards). */
  header?: ReactElement | null;
  /** Picture for the empty state; its first sentence becomes the bold title. */
  emptyKind?: EmptyKind;
  /** Button under the empty state (e.g. "New note"). */
  emptyAction?: { label: string; onPress: () => void };
}

export function ResourceList({
  items,
  loading,
  refreshing,
  onRefresh,
  emptyText,
  readOnly,
  error,
  header,
  emptyKind,
  emptyAction,
}: ResourceListProps) {
  const c = usePalette();
  const router = useRouter();
  const qc = useQueryClient();
  const [menuFor, setMenuFor] = useState<ListItem | null>(null);

  function confirmDelete(item: ListItem) {
    const copy =
      item.kind === "notebook"
        ? "Only the notebook is deleted. Everything inside moves back to the top level."
        : `The ${LABEL[item.kind].one} will be deleted for everyone it's shared with.`;
    Alert.alert(`Delete “${item.title}”?`, copy, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteResource(item.kind, item.id);
            await qc.invalidateQueries();
          } catch (e) {
            Alert.alert(
              "Couldn't delete",
              e instanceof Error ? e.message : String(e),
            );
          }
        },
      },
    ]);
  }

  if (loading && !items) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.textSecondary} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => `${i.kind}:${i.id}`}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}
        style={{ backgroundColor: c.background }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={header ?? null}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: c.separator }]} />
        )}
        ListEmptyComponent={
          error || !emptyKind ? (
            <Text style={[styles.empty, { color: c.textSecondary }]}>
              {error ? error.message : emptyText}
            </Text>
          ) : (
            <EmptyState
              kind={emptyKind}
              text={emptyText}
              action={emptyAction}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(ROUTE[item.kind](item.id))}
            onLongPress={readOnly ? undefined : () => setMenuFor(item)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? c.pressed : c.background },
            ]}
            accessibilityRole="button"
            accessibilityHint={
              readOnly ? undefined : "Long-press for analytics and more"
            }
          >
            <View
              style={[
                styles.thumb,
                { backgroundColor: c.pressed, borderColor: c.separator },
              ]}
            >
              {item.thumbnailUrl ? (
                <Image
                  source={item.thumbnailUrl}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <KindIcon kind={item.kind} color={c.textSecondary} />
              )}
            </View>
            <View style={styles.texts}>
              <View style={styles.titleRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.title, { color: c.textStrong }]}
                >
                  {item.title}
                </Text>
                <Text style={[styles.date, { color: c.textSecondary }]}>
                  {new Date(item.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
              {item.subtitle ? (
                <Text
                  numberOfLines={1}
                  style={[styles.subtitle, { color: c.textSecondary }]}
                >
                  {item.subtitle}
                </Text>
              ) : null}
              {item.access ? (
                <View style={styles.details}>
                  <Text
                    style={[
                      styles.access,
                      item.access === "public"
                        ? {
                            color: c.onTint,
                            backgroundColor: c.tint,
                            borderColor: c.tint,
                          }
                        : { color: c.textSecondary, borderColor: c.separator },
                    ]}
                  >
                    {ACCESS_LABEL[item.access]}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.detailText, { color: c.textSecondary }]}
                  >
                    {[
                      item.notebookName ? `▤ ${item.notebookName}` : null,
                      item.owner,
                      item.sharedCount
                        ? `${item.sharedCount} ${item.sharedCount === 1 ? "person" : "people"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        options={
          menuFor
            ? [
                {
                  label: "Open",
                  onPress: () => router.push(ROUTE[menuFor.kind](menuFor.id)),
                },
                {
                  label: "Analytics",
                  onPress: () =>
                    router.push({
                      pathname: "/analytics/[kind]/[id]",
                      params: {
                        kind: menuFor.kind,
                        id: menuFor.id,
                        title: menuFor.title,
                      },
                    }),
                },
                {
                  label: "Delete",
                  destructive: true,
                  onPress: () => confirmDelete(menuFor),
                },
              ]
            : []
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  texts: { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "600" },
  details: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  detailText: { flex: 1, fontSize: 12 },
  subtitle: { fontSize: 13 },
  date: { fontSize: 12, fontVariant: ["tabular-nums"] },
  access: {
    fontSize: 10,
    fontWeight: "600",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  empty: { textAlign: "center", padding: 32, fontSize: 14, lineHeight: 20 },
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
    textAlign: "center",
    maxWidth: 300,
  },
  emptyButton: {
    marginTop: 20,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyButtonText: { fontSize: 15, fontWeight: "600" },
});

/** The kind's icon, same as the web app's table rows. */
function KindIcon({ kind, color }: { kind: ListItem["kind"]; color: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon size={18} color={color} strokeWidth={1.8} />;
}

/** Picture + bold title (the text's first line/sentence) + help + optional button. */
function EmptyState({
  kind,
  text,
  action,
}: {
  kind: EmptyKind;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const c = usePalette();
  const flat = text.replace(/\n/g, " ");
  const split = flat.indexOf(". ");
  const title = split === -1 ? flat : flat.slice(0, split + 1);
  const body = split === -1 ? "" : flat.slice(split + 2);
  return (
    <View style={styles.emptyWrap}>
      <EmptyIllustration kind={kind} width={168} />
      <Text style={[styles.emptyTitle, { color: c.textStrong }]}>{title}</Text>
      {body ? (
        <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: c.tint, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.emptyButtonText, { color: c.onTint }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
