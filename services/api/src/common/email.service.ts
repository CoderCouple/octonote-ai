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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.client = apiKey ? new Resend(apiKey) : null;
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

function renderShareEmail(a: ShareEmailInput & { kind: string; verb: string; cta: string }) {
  return `<!doctype html>
<html><body style="margin:0;background:#fafafa;color:#111;font-family:ui-sans-serif,system-ui;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:32px">
    <div style="font-size:14px;color:#777;margin-bottom:24px">Octonote AI</div>
    <p style="font-size:15px;line-height:1.55;margin:0 0 8px">
      <strong>${escapeHtml(a.inviterName)}</strong> invited you to ${a.verb} this ${a.kind}:
    </p>
    <h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(a.resourceTitle)}</h1>
    <a href="${escapeHtml(a.url)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:10px;font-weight:600;text-decoration:none">${a.cta}</a>
    <p style="font-size:12px;color:#888;margin-top:32px">If you didn't expect this, you can ignore this email.</p>
  </div>
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
