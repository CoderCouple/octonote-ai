import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { AssistantLanding } from "../_components/assistant-landing";
import { ContentJsonLd } from "../_components/content-page";
import { ASSISTANTS, assistantFaqs } from "../_data/assistants";

const assistant = ASSISTANTS.chatgpt;
const faqs = assistantFaqs(assistant.name);

export const metadata: Metadata = {
  title: { absolute: assistant.title },
  description: assistant.description,
  alternates: { canonical: "/chatgpt" },
  openGraph: { type: "website", url: "/chatgpt", siteName: SITE_NAME, title: assistant.title, description: assistant.description },
  twitter: { card: "summary_large_image", title: assistant.title, description: assistant.description },
};

/** octonote.ai/chatgpt — Octonote inside ChatGPT, through the MCP server. */
export default function ChatGPTPage() {
  return (
    <>
      <ContentJsonLd path="/chatgpt" name={assistant.title} section={{ name: "Agents", path: "/cli" }} faqs={faqs} />
      <AssistantLanding assistant={assistant} faqs={faqs} />
    </>
  );
}
