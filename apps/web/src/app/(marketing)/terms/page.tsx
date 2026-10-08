import { LegalLayout, LegalSection } from "../_components/legal-layout";

export const metadata = {
  title: "Terms of Service · Octonote",
  description: "The terms that govern your use of Octonote.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="June 20, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Octonote (&quot;the
        Service&quot;). By signing up or using the Service you agree to them. Octonote is
        currently in private beta and these terms reflect that.
      </p>

      <LegalSection heading="Beta service">
        <p>
          The Service is provided as a beta. Features may change, break, or be removed without
          notice. We try to keep things stable but cannot guarantee uptime, data durability,
          or backwards compatibility during this period.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You must be at least 13 years old to use the Service. You are responsible for the
          security of your account and for any activity that happens under it. Notify us as
          soon as possible if you believe your account has been compromised.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Violate applicable laws or others&apos; rights.</li>
          <li>Upload malware, exploit vulnerabilities, or attempt to disrupt the Service.</li>
          <li>Resell or sublicense the Service without our written agreement.</li>
          <li>Generate or distribute content that is harmful, harassing, or illegal.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You own the notes, diagrams, and other content you create in Octonote. By using
          the Service, you grant us a limited license to host, process, and display that
          content solely for the purpose of operating the Service for you.
        </p>
        <p>
          AI actions you initiate may send your content to third-party model providers (e.g.
          OpenAI, Anthropic) to fulfil the request. You are responsible for ensuring that the
          content you submit to those features is appropriate to send to a third party.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          Octonote, its brand, design, and code are owned by us. These Terms do not grant
          you any rights to our trademarks, logos, or proprietary code beyond what is required
          to use the Service normally.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You can stop using the Service and request account deletion at any time. We may
          suspend or terminate accounts that violate these Terms, with or without notice. On
          termination, you remain able to export your content for a reasonable period unless
          the termination was due to a material breach.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>
          The Service is provided &quot;as is&quot;, without warranties of any kind, either
          express or implied. We do not warrant that the Service will be uninterrupted, error
          free, or that AI-generated output will be accurate or fit for any particular purpose.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect,
          incidental, consequential, or punitive damages arising out of your use of the
          Service. Our total liability for any claim relating to the Service will not exceed
          the amount you paid us in the twelve months preceding the claim (which is currently
          zero, as the Service is in private beta).
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these Terms as the product evolves. We will update the &quot;Last
          updated&quot; date and, for material changes, notify you in-product or by email.
          Continued use of the Service after a change means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these Terms:{" "}
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
