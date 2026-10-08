import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { deleteResource, LABEL, ROUTE, type ListItem } from "@/features/resources";
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
}

const GLYPH = { page: "¶", canvas: "◇", project: "◫", notebook: "▤" } as const;

export function ResourceList({ items, loading, refreshing, onRefresh, emptyText, readOnly, error }: ResourceListProps) {
  const c = usePalette();
  const router = useRouter();
  const qc = useQueryClient();

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
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
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
    <FlatList
      data={items ?? []}
      keyExtractor={(i) => `${i.kind}:${i.id}`}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: c.separator }]} />}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: c.textSecondary }]}>{error ? error.message : emptyText}</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(ROUTE[item.kind](item.id))}
          onLongPress={readOnly ? undefined : () => confirmDelete(item)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.pressed : c.background }]}
          accessibilityRole="button"
          accessibilityHint={readOnly ? undefined : "Long-press to delete"}
        >
          <View style={[styles.thumb, { backgroundColor: c.pressed, borderColor: c.separator }]}>
            {item.thumbnailUrl ? (
              <Image source={item.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={[styles.glyph, { color: c.textSecondary }]}>{GLYPH[item.kind]}</Text>
            )}
          </View>
          <View style={styles.texts}>
            <Text numberOfLines={1} style={[styles.title, { color: c.text }]}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text numberOfLines={1} style={[styles.subtitle, { color: c.textSecondary }]}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.date, { color: c.textSecondary }]}>
            {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glyph: { fontSize: 18 },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: "500" },
  subtitle: { fontSize: 13 },
  date: { fontSize: 12, fontVariant: ["tabular-nums"] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  empty: { textAlign: "center", padding: 32, fontSize: 14, lineHeight: 20 },
});
