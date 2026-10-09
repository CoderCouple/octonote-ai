import { LegalLayout, LegalSection } from "../_components/legal-layout";

export const metadata = {
  title: "Privacy Notice · Octonote AI",
  description:
    "What data Octonote AI collects, why, where it's stored and the choices you have.",
};

// Draft for private beta — have a lawyer review before public launch.
// TODO(legal): name the legal entity that operates the Service and add the
// governing jurisdiction once decided; revisit when AI agents ship.

const link = "text-foreground underline-offset-4 hover:underline";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Notice" lastUpdated="October 9, 2026">
      <p>
        This notice explains what information Octonote AI (&quot;we&quot;,
        &quot;us&quot;) collects when you use our website, web app and mobile
        apps (together, the &quot;Service&quot;), why we collect it, where
        it&apos;s stored and the choices you have. Octonote AI is in private
        beta; we&apos;ll update this notice as the product changes, and the date
        above always shows the latest version.
      </p>

      <LegalSection heading="The short version">
        <ul className="list-disc space-y-1 pl-6">
          <li>We collect only what we need to run the Service.</li>
          <li>
            We don&apos;t sell your data, show ads or use advertising trackers.
          </li>
          <li>
            We don&apos;t use third-party analytics tools. We only count
            anonymous views of published pages.
          </li>
          <li>
            Your notes and canvases are private unless you share or publish
            them.
          </li>
          <li>
            Anything you publish to the web can be read by anyone, including
            search engines.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>
          <strong>Account information.</strong> Your email address, and the name
          and profile picture you choose or that Google provides if you sign in
          with Google. Sign-in is handled by our authentication provider,
          Supabase; we never see or store a password for Google sign-in, and
          email sign-in uses one-time links and codes.
        </p>
        <p>
          <strong>Your content.</strong> The notes, canvases, projects and
          notebooks you create, including their titles, text, drawings and
          images, and the preview images we generate of your canvases.
        </p>
        <p>
          <strong>Sharing information.</strong> Who you&apos;ve shared something
          with and their role (Editor or Viewer), your link-sharing and
          publishing settings, and the public web address of anything you
          publish. When you invite someone by email who doesn&apos;t have an
          account yet, we store their email address so their access starts when
          they sign up, and we send them an invitation email on your behalf.
        </p>
        <p>
          <strong>Preferences.</strong> Settings such as theme and reading font.
        </p>
        <p>
          <strong>Activity records.</strong> A log of changes made to your
          workspace (for example, who created, edited, shared or deleted an
          item, and when), used for security and to help resolve problems.
        </p>
        <p>
          <strong>Technical information.</strong> Our hosting providers keep
          standard server logs, such as IP address, browser or device type, the
          pages and endpoints requested, and times and errors, for security and
          debugging.
        </p>
        <p>
          <strong>Views of published pages.</strong> When someone opens a page
          you&apos;ve published, we add one to an hourly view count for that
          page, which you and your editors can see, and we count unique visitors
          per day. To tell visitors apart without cookies we combine a secret
          value that changes every day with the page and either the
          visitor&apos;s account (if they&apos;re signed in) or their IP address
          and browser type, and keep only a one-way hash of that, for that day
          only. The daily secret and all hashes are deleted when the day ends,
          so they can&apos;t be traced back to a person or linked across days.
          We never store the IP address or browser type, we skip known bots and
          link previews, and visits by a page&apos;s own owners and editors
          aren&apos;t counted.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>We use this information to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            provide the Service: save, sync and display your work on every
            device;
          </li>
          <li>share and publish your work the way you choose;</li>
          <li>
            send the emails the Service needs, such as sign-in codes and sharing
            invitations;
          </li>
          <li>keep the Service and your account secure and prevent abuse;</li>
          <li>fix problems and respond when you contact us.</li>
        </ul>
        <p>
          We don&apos;t sell or rent your information, use it for advertising,
          or use your content to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="Who can see your content">
        <p>
          <strong>Private by default.</strong> New notes, canvases, projects and
          notebooks are visible only to you and members of your workspace.
        </p>
        <p>
          <strong>People you share with.</strong> Anyone you add can view or
          edit the item, depending on the role you give them. Sharing a notebook
          or project also shares what&apos;s inside it, including items you add
          later.
        </p>
        <p>
          <strong>Anyone with the link.</strong> If you turn this on, anyone who
          has the link can open the item without an account.
        </p>
        <p>
          <strong>Published to the web.</strong> Published items are public
          pages. Anyone can read them, they may appear in search engines, link
          previews and archives, and copies made by others may remain after you
          unpublish. Items added to a published notebook or project are
          published too; the editor labels them so this is never a surprise.
          Don&apos;t publish anything you wouldn&apos;t want to be public.
        </p>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>
          We use a small number of providers to run the Service. They process
          data only on our instructions and only to provide their service to us:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Supabase</strong>: database, sign-in and file storage
            (including canvas preview images).
          </li>
          <li>
            <strong>Vercel</strong>: hosting for the website and web app.
          </li>
          <li>
            <strong>Railway</strong>: hosting for our application server.
          </li>
          <li>
            <strong>Resend</strong>: sending sharing invitation emails.
          </li>
          <li>
            <strong>Google</strong>: only if you choose to sign in with Google.
          </li>
          <li>
            <strong>Apple and Google app stores</strong>: to distribute the
            mobile apps, under their own privacy policies.
          </li>
        </ul>
        <p>
          These providers may process data in the United States and other
          countries. We may also disclose information if required by law, or to
          protect the rights and safety of our users or the Service.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and on-device storage">
        <p>
          On the web we use only essential first-party cookies to keep you
          signed in, and your browser&apos;s local storage for preferences such
          as theme. The mobile apps store your sign-in session in your
          device&apos;s secure storage and remember on your device whether
          you&apos;ve seen the introduction. We don&apos;t use advertising or
          analytics cookies; published-page view counts work without any
          cookies.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          We keep your account and content for as long as your account is open.
          When you delete a note or canvas it disappears from your workspace
          straight away; we may keep a copy for a limited time so mistakes can
          be recovered. When your account is deleted, we delete your account
          information and content, apart from anything we must keep to meet
          legal obligations, resolve disputes or prevent abuse. Server logs are
          kept for a short period by our hosting providers.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights and choices">
        <p>
          You can edit or delete your content and change your profile at any
          time in the app. You can also ask us to give you a copy of your
          information, correct it, delete your account and its data, or stop
          processing it. Depending on where you live (for example, in the EU, UK
          or California), you may have additional rights under local law,
          including the right to complain to a data-protection authority.
        </p>
        <p>
          To make a request, email{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>{" "}
          from the address on your account. We&apos;ll respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Data is encrypted in transit, access to your content is checked on
          every request, and access to production systems is limited. No service
          is perfectly secure, so please use a strong, private email account and
          tell us straight away if you think your account has been compromised.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The Service isn&apos;t intended for children under 13 (or the minimum
          age in your country), and we don&apos;t knowingly collect their
          information. If you believe a child has given us information, contact
          us and we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this notice">
        <p>
          We&apos;ll update the date above whenever this notice changes. For
          significant changes, such as new kinds of data or new uses of it,
          we&apos;ll tell you in the app or by email before they take effect.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy:{" "}
          <a href="mailto:support@octonote.ai" className={link}>
            support@octonote.ai
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
