import { Stack } from "expo-router";
import { useEffect } from "react";
import { ResourceList } from "@/components/resource-list";
import { useSharedWithMe } from "@/features/resources";
import { markSharedSeen } from "@/lib/shared-seen";

/** Everything shared with you — opened from Home or the account panel. Opening it clears "New". */
export default function SharedScreen() {
  const shared = useSharedWithMe();
  useEffect(() => {
    markSharedSeen();
  }, []);
  return (
    <>
      <Stack.Screen options={{ title: "Shared with you" }} />
      <ResourceList
        readOnly
        items={shared.data}
        loading={shared.isLoading}
        refreshing={shared.isRefetching}
        onRefresh={() => void shared.refetch()}
        emptyText={
          "Nothing has been shared with you yet. When someone shares a note, canvas, project or notebook with your email, it shows up here."
        }
        error={shared.error}
        emptyKind="shared"
      />
    </>
  );
}
