import { config } from './config';

/**
 * Email delivery. Configure ONE of:
 *   RESEND_API_KEY                               (https://resend.com)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   (any SMTP server, e.g. Gmail, Postmark, SES)
 * plus EMAIL_FROM. With neither, docsign still works: copy the signing link
 * from the document page and send it yourself.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

interface Mail {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

async function send(mail: Mail): Promise<void> {
  const from = process.env.EMAIL_FROM || `${config.orgName} <noreply@example.com>`;
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend');
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: mail.to, subject: mail.subject, html: mail.html,
      attachments: mail.attachments?.map(a => ({ filename: a.filename, content: a.content })),
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (process.env.SMTP_HOST) {
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from, ...mail });
    return;
  }
  throw new Error('Email is not configured.');
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function layout(body: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2328">
    <p style="font-size:13px;color:#6b7280;margin:0 0 24px">${escape(config.orgName)}</p>
    ${body}
    <p style="font-size:12px;color:#9ca3af;margin-top:40px">Sent with docsign</p>
  </div>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${url}" style="background:#2563eb;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${label}</a></p>
  <p style="font-size:13px;color:#6b7280">Or open this link: <a href="${url}" style="color:#2563eb">${url}</a></p>`;
}

export function signingUrl(token: string): string {
  return `${config.appUrl}/sign/${token}`;
}

export async function sendInvitation(p: { to: string; name: string; title: string; message: string; token: string; reminder?: boolean }) {
  const note = p.message.trim()
    ? `<p style="font-size:15px;white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">${escape(p.message.trim())}</p>`
    : '';
  await send({
    to: p.to,
    subject: `${p.reminder ? 'Reminder: ' : ''}${config.orgName} sent you "${p.title}" to sign`,
    html: layout(`
      <h1 style="font-size:20px;margin:0 0 12px">Hi ${escape(p.name)},</h1>
      <p style="font-size:15px">${escape(config.orgName)} ${p.reminder ? 'is still waiting for' : 'has sent you'} <strong>${escape(p.title)}</strong> to review and sign. No account needed.</p>
      ${note}
      ${button(signingUrl(p.token), 'Review and sign')}
    `),
  });
}

export async function sendCompleted(p: { to: string; name: string; title: string; pdf: Uint8Array; filename: string }) {
  await send({
    to: p.to,
    subject: `Signed: ${p.title}`,
    html: layout(`
      <h1 style="font-size:20px;margin:0 0 12px">Hi ${escape(p.name)},</h1>
      <p style="font-size:15px"><strong>${escape(p.title)}</strong> has been signed. The completed copy, with its signing certificate, is attached.</p>
    `),
    attachments: [{ filename: `${p.filename}.pdf`, content: Buffer.from(p.pdf) }],
  });
}
