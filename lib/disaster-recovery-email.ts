import "server-only";

import nodemailer from "nodemailer";
import { readEncryptedDisasterRecoveryBackup, getDisasterRecoveryBackup } from "@/lib/disaster-recovery";

const EMAIL_ATTACHMENT_LIMIT = 18 * 1024 * 1024;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function asBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function sendDisasterRecoveryNotification(input: { mode: "backup" | "test"; filename?: string; downloadUrl?: string }) {
  const to = required("BACKUP_EMAIL_TO");
  const host = required("BACKUP_SMTP_HOST");
  const user = required("BACKUP_SMTP_USER");
  const password = required("BACKUP_SMTP_PASSWORD");
  const fromEmail = required("BACKUP_SMTP_FROM_EMAIL");
  const fromName = process.env.BACKUP_SMTP_FROM_NAME || "Triton CRM Backup";
  const port = Number(process.env.BACKUP_SMTP_PORT || "465");
  const secure = asBoolean(process.env.BACKUP_SMTP_SECURE, port === 465);
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });

  if (input.mode === "test") {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject: `Triton CRM Encrypted Backup – Test ${new Date().toISOString().slice(0, 10)}`,
      text: "This is a test of Triton CRM disaster-recovery email delivery. No customer data or backup file is attached.",
    });
    return { messageId: info.messageId, attached: false };
  }

  if (!input.filename) throw new Error("Backup filename is required");
  const backup = await getDisasterRecoveryBackup(input.filename);
  const archive = await readEncryptedDisasterRecoveryBackup(input.filename);
  const attach = archive.length <= EMAIL_ATTACHMENT_LIMIT;
  const summary = [
    `Backup time: ${backup.createdAt}`,
    `File: ${backup.filename}`,
    `Size: ${formatBytes(backup.sizeBytes)}`,
    `Encryption: successful`,
    `Verification: successful`,
    `Offsite upload: ${backup.remote.uploaded ? "successful" : "not confirmed"}`,
    `Clients: ${backup.counts.clients ?? 0}`,
    `Policies: ${backup.counts.policies ?? 0}`,
    `Family relationships: ${backup.counts.familyRelationships ?? 0}`,
    `Beneficiaries: ${backup.counts.beneficiaries ?? 0}`,
    `Uploaded files: ${backup.uploads.count}`,
  ];
  if (!attach && input.downloadUrl) summary.push(`Private download link (valid for 7 days): ${input.downloadUrl}`);
  const info = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: `Triton CRM Encrypted Backup – ${backup.createdAt.slice(0, 10)}`,
    text: summary.join("\n"),
    attachments: attach ? [{ filename: backup.filename, content: archive, contentType: "application/octet-stream" }] : undefined,
  });
  return { messageId: info.messageId, attached: attach };
}
