/**
 * Email sent by staff from Admin → Inbox (the follow-ups CRM), through Resend.
 * Kept apart from EmailService (share invites) so tests can record what would
 * be sent, and so these personal emails can carry the sender's name and a
 * hidden copy for the team inbox.
 *
 *   RESEND_API_KEY   — without it nothing is sent: the email is logged instead.
 *   RESEND_FROM      — the address part is used ("Octonote AI <hello@octonote.ai>").
 *   CRM_BCC          — a copy of every email goes here (default hello@octonote.ai).
 *   CRM_REPLY_DOMAIN — e.g. reply.octonote.ai, a subdomain whose mail Resend
 *                      receives. Each email then gets its own reply address
 *                      (r-<id>@reply.octonote.ai) so replies land on the right
 *                      person. Unset: replies go to the team address.
 *   RESEND_WEBHOOK_SECRET — signs Resend's `email.received` webhook.
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

/** A reply as Resend received it. */
export interface ReceivedMail {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: string;
}

/** What Resend's webhook says about an email it received (the text is fetched separately). */
export interface InboundEvent {
  type: string;
  emailId: string;
  from: string;
  to: string[];
}

export interface CrmMailer {
  /** The team address emails come from, and copies go to. */
  readonly fromAddress: string;
  readonly bcc: string | null;
  /** The subdomain replies go to, or null when replies go to the team address. */
  readonly replyDomain: string | null;
  /** Sends one email; returns Resend's id. Throws when it can't be sent. */
  send(mail: CrmMail): Promise<{ id: string }>;
  /** Checks Resend's signature on a webhook and returns the event; throws if it isn't from Resend. */
  verifyInbound(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }): InboundEvent;
  /** The received email with its text. */
  getReceived(emailId: string): Promise<ReceivedMail>;
  /** Forwards a received email, untouched, to the team inbox. */
  forwardToTeam(emailId: string): Promise<void>;
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
  readonly replyDomain: string | null;
  private readonly webhookSecret: string | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
    this.fromAddress = addressOf(env.RESEND_FROM);
    this.bcc = env.CRM_BCC === "" ? null : (env.CRM_BCC ?? "hello@octonote.ai");
    this.replyDomain = env.CRM_REPLY_DOMAIN?.trim().toLowerCase() || null;
    this.webhookSecret = env.RESEND_WEBHOOK_SECRET || null;
  }

  verifyInbound(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }): InboundEvent {
    if (!this.client || !this.webhookSecret) throw new Error("Receiving isn't set up (RESEND_WEBHOOK_SECRET).");
    if (!headers.id || !headers.timestamp || !headers.signature) throw new Error("Missing signature headers.");
    const event = this.client.webhooks.verify({
      payload: rawBody,
      headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
      webhookSecret: this.webhookSecret,
    }) as { type: string; data: { email_id?: string; from?: string; to?: string[]; received_for?: string[] } };
    return {
      type: event.type,
      emailId: event.data.email_id ?? "",
      from: event.data.from ?? "",
      to: [...(event.data.to ?? []), ...(event.data.received_for ?? [])],
    };
  }

  async getReceived(emailId: string): Promise<ReceivedMail> {
    if (!this.client) throw new Error("RESEND_API_KEY missing.");
    const { data, error } = await this.client.emails.receiving.get(emailId);
    if (error || !data) throw new Error(error?.message ?? "Resend returned no email.");
    return {
      from: data.from,
      to: [...data.to, ...(data.received_for ?? [])],
      subject: data.subject,
      text: data.text,
      html: data.html,
      receivedAt: data.created_at,
    };
  }

  async forwardToTeam(emailId: string): Promise<void> {
    if (!this.client || !this.bcc) return;
    const { error } = await this.client.emails.receiving.forward({
      emailId,
      to: this.bcc,
      from: `Octonote Inbox <${this.fromAddress}>`,
    });
    if (error) this.logger.warn(`Couldn't forward a reply to ${this.bcc}: ${error.message}`);
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

/** "Maya Chen <maya@x.com>" → "maya@x.com" (lower-case). */
export function emailOf(from: string): string {
  return addressOf(from).toLowerCase();
}

/** The reply address for one sent email, or null when replies go to the team. */
export function replyAddressFor(entryId: string, replyDomain: string | null): string | null {
  if (!replyDomain) return null;
  return `r-${entryId.replace(/^crm_/, "")}@${replyDomain}`;
}

/** The entry id behind a reply address (r-<uuid>@<replyDomain>), if any of these is one. */
export function entryIdFromAddresses(addresses: string[], replyDomain: string | null): string | null {
  if (!replyDomain) return null;
  for (const a of addresses) {
    const m = /^r-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@(.+)$/i.exec(emailOf(a));
    if (m && m[2] === replyDomain) return `crm_${m[1]!.toLowerCase()}`;
  }
  return null;
}

/**
 * The new part of a reply: everything before the quoted older message
 * ("On Tue, Oct 21, Sunil wrote:", "-----Original Message-----", "> …").
 */
export function trimQuotedReply(text: string): string {
  const t = text.replace(/\r\n?/g, "\n");
  const markers = [
    /\n(?:> ?)?On [^\n]{0,300}(?:\n[^\n]{0,200})?wrote:\s*\n/,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n_{5,}\n/,
    /\nFrom: [^\n]+\n(?:Sent|Date): /,
  ];
  let cut = t.length;
  for (const m of markers) {
    const hit = m.exec(`\n${t}`);
    if (hit) cut = Math.min(cut, Math.max(0, hit.index - 1));
  }
  const kept = t.slice(0, cut).split("\n");
  while (kept.length && (/^\s*>/.test(kept.at(-1)!) || !kept.at(-1)!.trim())) kept.pop();
  return kept.join("\n").trim() || t.trim();
}

/** Plain text from an HTML email, when it came without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6])>/gi, "\n\n")
    .replace(/<\/(div|li|tr)>/gi, "\n")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
