import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "Infographic gallery", robots: { index: false } };

/** Every infographic layout, for building and reviewing the library. Development only. */
export default function InfographicGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
