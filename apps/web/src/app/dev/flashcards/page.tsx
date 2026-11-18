import { notFound } from "next/navigation";
import { FlashcardsGallery } from "./gallery";

export const metadata = { title: "Flashcards gallery", robots: { index: false } };

/** Decks of different kinds, for building and reviewing the component. Development only. */
export default function FlashcardsGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FlashcardsGallery />;
}
