import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import { HeaderIconButton } from "@/components/header-buttons";
import { ResourceList } from "@/components/resource-list";
import { createResource, ROUTE, useNotebook, useWorkspaceId, type ResourceKind } from "@/features/resources";

export default function NotebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = useWorkspaceId();
  const nb = useNotebook(id);
  const canEdit = nb.data?.notebook.myRole === "editor" || nb.data?.notebook.myRole === "owner";

  async function create(kind: Exclude<ResourceKind, "notebook">) {
    if (!workspaceId) return;
    try {
      const newId = await createResource(kind, workspaceId, id);
      void qc.invalidateQueries({ queryKey: ["notebook", id] });
      router.push(ROUTE[kind](newId));
    } catch (e) {
      Alert.alert("Couldn't create", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: nb.data?.notebook.name ?? "",
          headerRight: canEdit
            ? () => (
                <HeaderIconButton
                  sf="plus"
                  fallback="+"
                  label="Add to notebook"
                  onPress={() =>
                    Alert.alert("Add to notebook", undefined, [
                      { text: "New note", onPress: () => void create("page") },
                      { text: "New canvas", onPress: () => void create("canvas") },
                      { text: "New project", onPress: () => void create("project") },
                      { text: "Cancel", style: "cancel" },
                    ])
                  }
                />
              )
            : undefined,
        }}
      />
      <ResourceList
        readOnly={!canEdit}
        items={nb.data?.items}
        loading={nb.isLoading}
        refreshing={nb.isRefetching}
        onRefresh={() => void nb.refetch()}
        emptyText={"This notebook is empty.\nTap + to add a note, canvas or project."}
        error={nb.error}
      />
    </>
  );
}
