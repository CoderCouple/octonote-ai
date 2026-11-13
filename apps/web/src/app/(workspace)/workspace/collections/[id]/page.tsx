import { CollectionView } from "@/features/collections/collection-view";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CollectionView id={id} />;
}
