import { fetchPublishedRoot } from "@/features/public/lib/fetch-public";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "../_lib/og-card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A page published on Octonote AI";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return ogCard(await fetchPublishedRoot(slug));
}
