import { Stack } from "expo-router";

// Compact header with the title centred on both platforms (iOS large titles
// can only sit on the left): avatar left, title centre, + right.
export default function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerShadowVisible: false,
      }}
    />
  );
}
