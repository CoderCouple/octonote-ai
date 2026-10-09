import Link from "next/link";
import { LegalLayout, LegalSection } from "../_components/legal-layout";

export const metadata = {
  title: "Terms of Service · Octonote AI",
  description: "The terms that govern your use of Octonote AI.",
};

// Draft for private beta — have a lawyer review before public launch.
// TODO(legal): name the legal entity that operates the Service, and add
// governing law + dispute resolution once the jurisdiction is decided.

const link = "text-foreground underline-offset-4 hover:underline";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="October 9, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Octonote
        AI&apos;s website, web app and mobile apps (together, the
        &quot;Service&quot;). By creating an account or using the Service, you
        agree to these Terms and to our{" "}
        <Link href="/privacy" className={link}>
          Privacy Notice
        </Link>
        . If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <LegalSection heading="Beta service">
        <p>
          The Service is in private beta and is currently free. Features may
          change, break or be removed without notice, and we can&apos;t
          guarantee uptime or that data will never be lost, so keep your own
          copies of anything important. If we introduce paid plans, we&apos;ll
          tell you before you are charged anything.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You must be at least 13 years old (or the minimum age in your country)
          to use the Service. Give us accurate information, keep access to your
          email account secure, and tell us straight away at{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>{" "}
          if you think your account has been compromised. You&apos;re
          responsible for activity under your account.
        </p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You own the notes, canvases, projects and notebooks you create
          (&quot;your content&quot;). You give us a limited licence to store,
          process, copy and display your content only as needed to run the
          Service for you, including showing it to the people you share it with
          and, if you publish it, to the public.
        </p>
        <p>
          You&apos;re responsible for your content and confirm you have the
          rights to use and share it. Please keep your own backups during the
          beta.
        </p>
      </LegalSection>

      <LegalSection heading="Sharing and publishing">
        <p>
          You control who can see your content. When you invite someone, share a
          link or publish to the web, you&apos;re choosing to make that content
          available to them, and you&apos;re responsible for that choice:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Editors you invite can change and reshare the item; viewers can read
            and copy it.
          </li>
          <li>
            Anyone with an &quot;anyone with the link&quot; link can open the
            item.
          </li>
          <li>
            Published pages are public, may be indexed by search engines and
            copied by others, and copies may persist after you unpublish.
          </li>
          <li>
            Sharing or publishing a notebook or project includes everything
            inside it, including items added later.
          </li>
        </ul>
        <p>
          Only invite people who expect to hear from you, and don&apos;t publish
          other people&apos;s private information.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            break the law or infringe anyone&apos;s rights, including privacy
            and intellectual property;
          </li>
          <li>
            publish or share content that is illegal, harassing, hateful,
            sexually exploitative or that promotes violence;
          </li>
          <li>send spam or unwanted invitations;</li>
          <li>
            upload malware, probe or break our security, or disrupt the Service
            or other users;
          </li>
          <li>
            access the Service by automated means beyond normal use, or resell
            it without our written permission.
          </li>
        </ul>
        <p>
          We may remove or unpublish content, or restrict sharing, if we
          reasonably believe it breaks these Terms or the law. To report
          content, email{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Our service">
        <p>
          The Service, including its software, design and the Octonote AI name
          and logo, belongs to us and our licensors. These Terms give you the
          right to use the Service, not to copy, modify or reuse it beyond
          normal use. If you send us feedback, we may use it without any
          obligation to you.
        </p>
      </LegalSection>

      <LegalSection heading="Ending your use">
        <p>
          You can stop using the Service at any time and ask us to delete your
          account by emailing{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>
          . We may suspend or close accounts that seriously or repeatedly break
          these Terms, or if required by law. Where reasonable, we&apos;ll give
          notice first. We may also change or end the beta; if we shut the
          Service down, we&apos;ll give you reasonable notice so you can copy
          your content.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>
          The Service is provided &quot;as is&quot; and &quot;as
          available&quot;, without warranties of any kind, express or implied,
          including fitness for a particular purpose and non-infringement. We
          don&apos;t promise it will be uninterrupted, error-free or that
          content will never be lost.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent the law allows, we aren&apos;t liable for
          indirect, incidental, special, consequential or punitive damages, or
          for lost profits, data or goodwill. Our total liability for any claim
          about the Service is limited to the greater of the amount you paid us
          in the 12 months before the claim or US$50. Nothing in these Terms
          limits liability that can&apos;t be limited by law, or any rights you
          have as a consumer that can&apos;t be waived.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these Terms">
        <p>
          We may update these Terms as the Service changes. We&apos;ll update
          the date above and, for significant changes, tell you in the app or by
          email before they take effect. If you keep using the Service after
          that, you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these Terms:{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
