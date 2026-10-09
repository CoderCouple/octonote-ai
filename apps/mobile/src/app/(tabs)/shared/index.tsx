import { Stack } from "expo-router";
import { ResourceList } from "@/components/resource-list";
import { useSharedWithMe } from "@/features/resources";

export default function SharedTab() {
  const shared = useSharedWithMe();
  return (
    <>
      <Stack.Screen options={{ title: "Shared" }} />
      <ResourceList
        readOnly
        items={shared.data}
        loading={shared.isLoading}
        refreshing={shared.isRefetching}
        onRefresh={() => void shared.refetch()}
        emptyText={
          "Nothing shared with you yet.\nWhen someone shares something with your email, it shows up here."
        }
        error={shared.error}
      />
    </>
  );
}
