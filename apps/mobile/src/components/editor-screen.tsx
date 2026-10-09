import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Share } from "react-native";
import { getTitle, ROUTE } from "@/features/resources";
import { env } from "@/lib/env";
import { EmbeddedWebView } from "./embedded-web-view";
import { Share2 } from "lucide-react-native";
import { HeaderIconButton } from "./header-buttons";

/**
 * Note / canvas / project: native header (back swipe, title, system share
 * sheet) around the web editor. Who-can-access settings live in the
 * editor's own Share dialog.
 */
export function EditorScreen({
  kind,
}: {
  kind: "page" | "canvas" | "project";
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const path = ROUTE[kind](id);
  const title = useQuery({
    queryKey: ["title", kind, id],
    queryFn: () => getTitle(kind, id),
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: title.data ?? "",
          headerRight: () => (
            <HeaderIconButton
              sf="square.and.arrow.up"
              icon={Share2}
              label="Share link"
              onPress={() =>
                void Share.share({
                  message: `${env.WEB_URL}${path}`,
                  url: `${env.WEB_URL}${path}`,
                })
              }
            />
          ),
        }}
      />
      <EmbeddedWebView path={path} />
    </>
  );
}
