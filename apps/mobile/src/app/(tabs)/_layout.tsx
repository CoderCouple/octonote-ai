import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAuth } from "@/providers/auth";

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} md="description" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="canvases">
        <NativeTabs.Trigger.Label>Canvases</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="scribble.variable" md="draw" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="projects">
        <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "rectangle.split.2x1", selected: "rectangle.split.2x1.fill" }} md="view_column" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notebooks">
        <NativeTabs.Trigger.Label>Notebooks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "books.vertical", selected: "books.vertical.fill" }} md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shared">
        <NativeTabs.Trigger.Label>Shared</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} md="group" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
