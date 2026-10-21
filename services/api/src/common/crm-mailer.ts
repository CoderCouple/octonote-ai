/**
 * Email sent by staff from Admin → Inbox (the follow-ups CRM), through Resend.
 * Kept apart from EmailService (share invites) so tests can record what would
 * be sent, and so these personal emails can carry the sender's name and a
 * hidden copy for the team inbox.
 *
 *   RESEND_API_KEY   — without it nothing is sent: the email is logged instead.
 *   RESEND_FROM      — the address part is used ("Octonote AI <hello@octonote.ai>").
 *   CRM_BCC          — a copy of every email goes here (default hello@octonote.ai).
 */
import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";

export const CRM_MAILER = Symbol("CRM_MAILER");

export interface CrmMail {
  /** "Sunil from Octonote <hello@octonote.ai>" */
  from: string;
  to: string;
  bcc: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

export interface CrmMailer {
  /** The team address emails come from, and copies go to. */
  readonly fromAddress: string;
  readonly bcc: string | null;
  /** Sends one email; returns Resend's id. Throws when it can't be sent. */
  send(mail: CrmMail): Promise<{ id: string }>;
}

/** "Octonote AI <hello@octonote.ai>" → "hello@octonote.ai". */
export function addressOf(from: string | undefined): string {
  const m = /<([^>]+)>/.exec(from ?? "");
  return (m?.[1] ?? from ?? "").trim() || "hello@octonote.ai";
}

export class ResendCrmMailer implements CrmMailer {
  private readonly logger = new Logger("CrmMailer");
  private readonly client: Resend | null;
  readonly fromAddress: string;
  readonly bcc: string | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
    this.fromAddress = addressOf(env.RESEND_FROM);
    this.bcc = env.CRM_BCC === "" ? null : (env.CRM_BCC ?? "hello@octonote.ai");
  }

  async send(mail: CrmMail): Promise<{ id: string }> {
    if (!this.client) {
      this.logger.warn(`RESEND_API_KEY missing: not sending "${mail.subject}" to ${mail.to}.`);
      return { id: `local_${randomUUID()}` };
    }
    const { data, error } = await this.client.emails.send({
      from: mail.from,
      to: mail.to,
      ...(mail.bcc.length ? { bcc: mail.bcc } : {}),
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (error || !data) throw new Error(error?.message ?? "Resend returned no id.");
    return { id: data.id };
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A personal email, not a newsletter: the text as written, paragraphs and
 * line breaks kept, links clickable, in the reader's default font.
 */
export function renderCrmEmail(body: string): string {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("");
  return `<div style="font-size:15px;line-height:1.55;color:#191919">${paragraphs}</div>`;
}
