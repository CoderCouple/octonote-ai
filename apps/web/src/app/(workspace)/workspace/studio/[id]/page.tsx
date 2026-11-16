import { StudioItemView } from "@/features/studio/studio-item-view";

export default async function StudioItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioItemView id={id} />;
}
