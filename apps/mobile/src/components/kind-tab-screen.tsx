import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { createResource, LABEL, ROUTE, useResourceList, useWorkspaceId, type ResourceKind } from "@/features/resources";
import { HeaderIconButton } from "./header-buttons";
import { ResourceList } from "./resource-list";

const EMPTY: Record<ResourceKind, string> = {
  page: "No notes yet.\nTap + to start writing.",
  canvas: "No canvases yet.\nTap + to start drawing.",
  project: "No projects yet.\nA project pairs one note with one canvas.",
  notebook: "No notebooks yet.\nGroup notes, canvases and projects — then share or publish them together.",
};

/** One tab: native large-title header, + to create, list below. */
export function KindTabScreen({ kind }: { kind: ResourceKind }) {
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = useWorkspaceId();
  const list = useResourceList(kind);
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!workspaceId) return;
    setCreating(true);
    try {
      const id = await createResource(kind, workspaceId);
      void qc.invalidateQueries({ queryKey: ["list", kind] });
      router.push(ROUTE[kind](id));
    } catch (e) {
      Alert.alert("Couldn't create", e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: LABEL[kind].many,
          headerRight: () => (
            <HeaderIconButton sf="plus" fallback="+" label={`New ${LABEL[kind].one}`} onPress={create} disabled={creating} />
          ),
          headerLeft: () => (
            <HeaderIconButton sf="person.crop.circle" fallback="☰" label="Account" onPress={() => router.push("/settings")} />
          ),
        }}
      />
      <ResourceList
        items={list.data}
        loading={list.isLoading}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        emptyText={EMPTY[kind]}
        error={list.error}
      />
    </>
  );
}
