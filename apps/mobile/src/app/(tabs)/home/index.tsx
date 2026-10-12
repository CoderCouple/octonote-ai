/**
 * Home: pick up where you left off — your most recently edited notes,
 * canvases, projects and notebooks as horizontal rows of cards. Mirrors the
 * web app's Home page; "recent" means edits you made yourself.
 */
import { Stack, useRouter, type Href } from "expo-router";
import {
  BookOpen,
  FileText,
  FolderKanban,
  Menu,
  PenTool,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { HeaderButtons, HeaderIconButton } from "@/components/header-buttons";
import { TAB_BAR_SPACE } from "@/components/floating-tab-bar";
import {
  LABEL,
  ROUTE,
  useMe,
  useRecentEdits,
  useResourceList,
  type ListItem,
  type ResourceKind,
} from "@/features/resources";
import { ACCESS_LABEL } from "@octonote/shared";
import { usePalette, type Palette } from "@/lib/theme";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

const PER_ROW = 6;
const SECTIONS: { kind: ResourceKind; tab: Href; icon: LucideIcon }[] = [
  { kind: "page", tab: "/notes", icon: FileText },
  { kind: "canvas", tab: "/canvases", icon: PenTool },
  { kind: "project", tab: "/projects", icon: FolderKanban },
  { kind: "notebook", tab: "/notebooks", icon: BookOpen },
];

export default function HomeTab() {
  const router = useRouter();
  const c = usePalette();
  const me = useMe().data;
  const recent = useRecentEdits();
  const lists = {
    page: useResourceList("page"),
    canvas: useResourceList("canvas"),
    project: useResourceList("project"),
    notebook: useResourceList("notebook"),
  };
  const refetchAll = () =>
    Promise.all([
      recent.refetch(),
      ...Object.values(lists).map((l) => l.refetch()),
    ]);
  useRefreshOnFocus(refetchAll);
  const [pulling, setPulling] = useState(false);

  const firstName = me?.user.name.split(" ")[0];
  const edits = recent.data;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Home",
          headerRight: () => (
            <HeaderButtons>
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
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
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
        <View style={styles.greeting}>
          <Text style={[styles.hello, { color: c.textStrong }]}>
            Welcome back{firstName ? `, ${firstName}` : ""}
          </Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            Pick up where you left off.
          </Text>
        </View>

        {SECTIONS.map(({ kind, tab, icon }) => {
          const items = (lists[kind].data ?? [])
            .flatMap((item) => {
              const editedAt = edits?.get(`${kind}:${item.id}`);
              return editedAt ? [{ item, editedAt }] : [];
            })
            .sort((a, b) => b.editedAt.localeCompare(a.editedAt))
            .slice(0, PER_ROW);
          return (
            <View key={kind}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: c.textStrong }]}>
                  Recent {LABEL[kind].many.toLowerCase()}
                </Text>
                <Pressable onPress={() => router.navigate(tab)} hitSlop={8}>
                  <Text style={[styles.viewAll, { color: c.textSecondary }]}>
                    View all
                  </Text>
                </Pressable>
              </View>
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
                      editedAt={editedAt}
                      icon={icon}
                      c={c}
                      onPress={() => router.push(ROUTE[kind](item.id))}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={[styles.empty, { borderColor: c.separator }]}>
                  <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                    {recent.isError || lists[kind].isError
                      ? "Couldn't load this. Pull down to try again."
                      : edits && lists[kind].data
                        ? `${LABEL[kind].many} you edit will show up here.`
                        : "Loading…"}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

function Card({
  item,
  editedAt,
  icon: Icon,
  c,
  onPress,
}: {
  item: ListItem;
  editedAt: string;
  icon: LucideIcon;
  c: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
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
        ) : item.kind === "page" && item.subtitle ? (
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
        </View>
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: c.textSecondary }]}
        >
          {item.access ? `${ACCESS_LABEL[item.access]} · ` : ""}
          {new Date(editedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  empty: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: { fontSize: 15 },
});
