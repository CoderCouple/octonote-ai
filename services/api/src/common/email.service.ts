/**
 * Transactional email via Resend. Without RESEND_API_KEY the payload is
 * logged instead, so local dev works without DNS setup.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import type { ResourceKind } from "../model/sharing.model";

const KIND_LABEL: Record<ResourceKind, string> = {
  page: "note",
  canvas: "canvas",
  project: "project",
  notebook: "notebook",
};

export interface ShareEmailInput {
  to: string;
  inviterName: string;
  resourceKind: ResourceKind;
  resourceTitle: string;
  url: string;
  role: "viewer" | "editor";
  /** Recipient has no account yet — the copy asks them to sign up. */
  needsAccount: boolean;
}

export interface SupportAccessNoticeInput {
  to: string;
  name: string;
  reason: string;
  at: Date;
  settingsUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  /**
   * Support entered the account without the user's grant (an admin override):
   * tell them, with the reason. Throws if it can't be sent, so the session
   * isn't started without the user hearing about it.
   */
  async sendSupportAccessNotice(input: SupportAccessNoticeInput): Promise<void> {
    const from = process.env.RESEND_FROM ?? "Octonote AI <onboarding@resend.dev>";
    const subject = "Octonote support viewed your account";
    const text =
      `Hi ${input.name},\n\n` +
      `Octonote support opened your account in read-only mode on ${input.at.toUTCString()} to investigate a problem. ` +
      `Nothing was changed: support access can't edit, create or delete anything.\n\n` +
      `Reason: ${input.reason}\n\n` +
      `You can see every support visit, and choose whether support may enter in future, in Settings → Privacy: ${input.settingsUrl}\n\n` +
      `Questions? Reply to this email or write to hello@octonote.ai.\n\nOctonote AI`;

    if (!this.client) {
      this.logger.warn(`RESEND_API_KEY missing — logging support notice to ${input.to} instead.`);
      this.logger.log({ to: input.to, subject });
      return;
    }
    const { error } = await this.client.emails.send({ from, to: input.to, subject, text, replyTo: "hello@octonote.ai" });
    if (error) {
      this.logger.error(`Resend failed: ${error.name} — ${error.message}`);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  async sendShareNotification(input: ShareEmailInput): Promise<void> {
    const from = process.env.RESEND_FROM ?? "Octonote AI <onboarding@resend.dev>";
    const kind = KIND_LABEL[input.resourceKind];
    const subject = `${input.inviterName} shared "${input.resourceTitle}" with you`;
    const verb = input.role === "editor" ? "edit" : "view";
    const cta = input.needsAccount ? "Sign up to open" : `Open ${kind}`;
    const text =
      `${input.inviterName} invited you to ${verb} the ${kind} "${input.resourceTitle}" on Octonote AI.\n` +
      `${cta}: ${input.url}`;

    if (!this.client) {
      this.logger.warn(`RESEND_API_KEY missing — logging share email to ${input.to} instead.`);
      this.logger.log({ to: input.to, subject, url: input.url });
      return;
    }

    const { error } = await this.client.emails.send({
      from,
      to: input.to,
      subject,
      text,
      html: renderShareEmail({ ...input, kind, verb, cta }),
    });
    if (error) {
      this.logger.error(`Resend failed: ${error.name} — ${error.message}`);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}

/**
 * Same layout as the Supabase sign-in emails (supabase/templates/magic_link.html):
 * white hero + body, black footer with the wordmark. Monochrome design tokens,
 * inlined because email clients ignore CSS variables.
 */
function renderShareEmail(a: ShareEmailInput & { kind: string; verb: string; cta: string }) {
  const inviter = escapeHtml(a.inviterName);
  const title = escapeHtml(a.resourceTitle);
  const url = escapeHtml(a.url);
  const to = escapeHtml(a.to);
  const access =
    a.role === "editor" ? "You can view and edit it." : "You can view it. Only editors can make changes.";
  const body = a.needsAccount
    ? `${access} Create a free Octonote AI account with this email address to open it — your access is already waiting.`
    : access;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${inviter} invited you to ${a.verb} “${title}” on Octonote AI.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="background:#FFFFFF;border:1px solid #E9E9E7;border-bottom:0;padding:40px 40px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;"><img src="https://octonote.ai/brand-logo-120.png" width="30" height="30" alt="" style="display:block;border:0;" /></td>
          <td style="vertical-align:middle;padding-left:8px;font-size:18px;font-weight:600;color:#191919;letter-spacing:-0.2px;">Octonote AI</td>
        </tr></table>
        <div style="font-size:15px;line-height:22px;color:#73726E;padding:36px 0 10px;">${inviter} shared a ${a.kind} with you</div>
        <div style="font-size:36px;line-height:42px;font-weight:600;color:#191919;letter-spacing:-0.8px;padding-bottom:32px;">${title}</div>
        <a href="${url}" style="display:inline-block;background:#191919;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;line-height:20px;padding:13px 26px;border-radius:999px;">${a.cta}</a>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-left:1px solid #E9E9E7;border-right:1px solid #E9E9E7;border-top:1px solid #E9E9E7;padding:24px 40px 32px;font-size:14px;line-height:22px;color:#37352F;">
        ${body}
        <div style="font-size:12px;line-height:18px;color:#787774;padding-top:18px;word-break:break-all;">Or open this link: <a href="${url}" style="color:#37352F;">${url}</a></div>
      </td></tr>
      <tr><td style="background:#0A0A0B;padding:24px 40px 0;font-size:12px;line-height:19px;color:#9B9A97;">
                <div style="padding-bottom:10px;">Sent to ${to} because ${inviter} shared something with you. Not expecting it? Ignore this email. © ${new Date().getFullYear()} Octonote AI</div>
                <a href="https://octonote.ai" style="color:#FFFFFF;text-decoration:underline;">Home</a> &nbsp;·&nbsp; <a href="mailto:hello@octonote.ai" style="color:#FFFFFF;text-decoration:underline;">Help</a> &nbsp;·&nbsp; <a href="https://octonote.ai/privacy" style="color:#FFFFFF;text-decoration:underline;">Privacy</a> &nbsp;·&nbsp; <a href="https://octonote.ai/terms" style="color:#FFFFFF;text-decoration:underline;">Terms</a>
                <div style="font-size:44px;line-height:44px;font-weight:600;color:#FFFFFF;letter-spacing:-1.5px;padding:18px 0 4px;white-space:nowrap;overflow:hidden;">Octonote AI</div>
              </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
