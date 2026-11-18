import { notFound } from "next/navigation";
import { MindmapGallery } from "./gallery";

export const metadata = { title: "Mind map gallery", robots: { index: false } };

/** Mind maps of different shapes and sizes, for building and reviewing the component. Development only. */
export default function MindmapGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MindmapGallery />;
}
