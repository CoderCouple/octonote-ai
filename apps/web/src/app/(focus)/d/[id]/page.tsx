import { DeckEditor } from "@/features/decks";
import { getDeckApi } from "@/features/decks/api/decks-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { BackLink } from "../../_components/back-link";
import { NoAccess } from "../../_components/no-access";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOrGate(() => getDeckApi(id), `/d/${id}`);
  if (!res.ok) return <NoAccess />;
  const deck = res.data;
  const back = deck.notebookId ? `/nb/${deck.notebookId}` : "/workspace/decks";
  return (
    <DeckEditor
      deck={deck}
      myRole={deck.myRole ?? "viewer"}
      leading={<BackLink key="back" href={back} signedIn={res.signedIn} />}
    />
  );
}
