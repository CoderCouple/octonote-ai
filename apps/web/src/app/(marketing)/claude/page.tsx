import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { AssistantLanding } from "../_components/assistant-landing";
import { ContentJsonLd } from "../_components/content-page";
import { ASSISTANTS, assistantFaqs } from "../_data/assistants";

const assistant = ASSISTANTS.claude;
const faqs = assistantFaqs(assistant.name);

export const metadata: Metadata = {
  title: { absolute: assistant.title },
  description: assistant.description,
  alternates: { canonical: "/claude" },
  openGraph: { type: "website", url: "/claude", siteName: SITE_NAME, title: assistant.title, description: assistant.description },
  twitter: { card: "summary_large_image", title: assistant.title, description: assistant.description },
};

/** octonote.ai/claude — Octonote inside Claude, through the MCP server. */
export default function ClaudePage() {
  return (
    <>
      <ContentJsonLd path="/claude" name={assistant.title} section={{ name: "Agents", path: "/cli" }} faqs={faqs} />
      <AssistantLanding assistant={assistant} faqs={faqs} />
    </>
  );
}
