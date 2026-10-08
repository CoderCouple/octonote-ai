import { LegalLayout, LegalSection } from "../_components/legal-layout";

export const metadata = {
  title: "Privacy Policy · Octonote",
  description: "How Octonote handles your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="June 20, 2026">
      <p>
        This Privacy Policy describes what data Octonote (&quot;we&quot;, &quot;us&quot;)
        collects from you, why we collect it, and how it is stored. Octonote is currently in
        private beta. We will update this policy as the product evolves; the &quot;Last
        updated&quot; date above will always reflect the most recent change.
      </p>

      <LegalSection heading="Information we collect">
        <p>
          <strong>Account information.</strong> When you sign up we collect the email address
          you authenticate with and (if you sign in via Google) your name and profile picture.
          Authentication is handled by Supabase Auth.
        </p>
        <p>
          <strong>Workspace content.</strong> Notes, canvases, diagrams, and AI-run history you
          create inside Octonote are stored in our managed Postgres database.
        </p>
        <p>
          <strong>Audit log.</strong> Every mutation to a project, page, or canvas is recorded
          in an internal change-events log alongside the user or agent that made it. This
          powers the &quot;AI edits are auditable&quot; guarantee.
        </p>
        <p>
          <strong>Usage data.</strong> Standard server logs (timestamps, request paths, status
          codes, IP) are captured by our hosting providers (Vercel, Railway) for security and
          debugging.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          We use the data above to operate the product, secure your account, and support you
          when you contact us. We do not sell your data, and we do not use your workspace
          content to train AI models that benefit other customers.
        </p>
      </LegalSection>

      <LegalSection heading="Where it lives">
        <p>
          <strong>Database:</strong> Supabase Postgres (US region).
        </p>
        <p>
          <strong>Authentication:</strong> Supabase Auth (with Google OAuth, where you choose it).
        </p>
        <p>
          <strong>Frontend hosting:</strong> Vercel.
        </p>
        <p>
          <strong>Backend hosting:</strong> Railway.
        </p>
        <p>
          When you connect Octonote to an AI provider (e.g. OpenAI, Anthropic), the
          specific prompt and any context required for a single AI run is sent to that provider
          to fulfil the request. We do not send your workspace content to AI providers outside
          of an explicit AI action you initiate.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You can export your notes as Markdown at any time from inside the editor. You can
          request deletion of your account and all associated workspace data by emailing the
          address below. We will action it within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use first-party cookies only for authentication (your Supabase session). We do
          not run advertising trackers.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions or requests about this policy:{" "}
          <a
            href="mailto:support@octonote.ai"
            className="text-foreground underline-offset-4 hover:underline"
          >
            support@octonote.ai
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
