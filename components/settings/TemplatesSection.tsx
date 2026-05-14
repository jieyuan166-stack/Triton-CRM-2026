// components/settings/TemplatesSection.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, ImageIcon, Paperclip, RotateCcw, Save, Sparkles, Trash2, Variable } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettings } from "@/components/providers/SettingsProvider";
import { RichSignatureEditor } from "@/components/settings/RichSignatureEditor";
import {
  SIGNATURE_TEMPLATES,
  htmlToPlainText,
} from "@/lib/signature-templates";
import type { EmailTemplate, EmailTemplateAttachment, EmailTemplateId } from "@/lib/settings-types";

export function TemplatesSection() {
  const { settings, updateTemplate, resetTemplate, updateSignature } =
    useSettings();
  const { templates, signature } = settings;

  const [active, setActive] = useState<EmailTemplateId>("birthday");

  return (
    <div className="space-y-6">
      {/* Email Signature */}
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 md:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Email Signature
            </h3>
            <p className="text-xs text-triton-muted mt-0.5">
              Appended to every outgoing email when enabled.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={signature.enabled}
              onCheckedChange={(c) =>
                updateSignature({ enabled: c === true })
              }
            />
            <span className="text-xs text-slate-600">
              {signature.enabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>
        <div className="px-5 md:px-6 py-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Choose Template
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SIGNATURE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={!signature.enabled}
                  onClick={() =>
                    updateSignature({
                      enabled: true,
                      html: template.html,
                      text: htmlToPlainText(template.html),
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-navy/30 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {template.label}
                    </span>
                    {signature.html?.trim() === template.html.trim() ? (
                      <Check className="h-3.5 w-3.5 text-accent-green" />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-triton-muted">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <RichSignatureEditor
            value={signature.html ?? ""}
            disabled={!signature.enabled}
            onChange={(html) =>
              updateSignature({ enabled: true, html, text: htmlToPlainText(html) })
            }
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Plain-text fallback
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
              {signature.text || "No signature fallback yet."}
            </p>
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="bg-card rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 md:px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Email Templates
          </h3>
          <p className="text-xs text-triton-muted mt-0.5">
            Reusable Subject + Body for the email shortcuts on your dashboard.
            Use square-bracket placeholders like{" "}
            <code className="font-number text-[11px] px-1 rounded bg-slate-100">
              [Client Name]
            </code>{" "}
            for runtime substitution.
          </p>
        </div>

        <Tabs
          value={active}
          onValueChange={(v) => setActive(v as EmailTemplateId)}
        >
          <div className="px-5 md:px-6 pt-4">
            <TabsList>
              {templates.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {templates.map((t) => (
            <TabsContent key={t.id} value={t.id} className="px-5 md:px-6 py-5">
              <TemplateEditor
                template={t}
                onSave={(patch) => {
                  updateTemplate(t.id, patch);
                  toast.success(`${t.label} template saved`);
                }}
                onReset={() => {
                  resetTemplate(t.id);
                  toast.info(`${t.label} template reset to default`);
                }}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onReset,
}: {
  template: EmailTemplate;
  onSave: (patch: { subject: string; body: string; attachments?: EmailTemplateAttachment[] }) => void;
  onReset: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [attachments, setAttachments] = useState<EmailTemplateAttachment[]>(
    template.attachments ?? []
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body);
    setAttachments(template.attachments ?? []);
  }, [template.id, template.subject, template.body, template.attachments]);

  const dirty =
    subject.trim() !== template.subject.trim() ||
    body !== template.body ||
    JSON.stringify(attachments) !== JSON.stringify(template.attachments ?? []);

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleAttachmentChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    const nextFiles = Array.from(files);
    const encoded = await Promise.all(
      nextFiles.map(async (file) => ({
        id: `${template.id}-${file.name}-${file.size}-${file.lastModified}`,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        content: arrayBufferToBase64(await file.arrayBuffer()),
      }))
    );
    setAttachments((prev) => [...prev, ...encoded]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }

  function handleSave() {
    onSave({ subject: subject.trim(), body, attachments });
  }

  function handleReset() {
    onReset();
    setSubject(template.subject);
    setBody(template.body);
    setAttachments(template.attachments ?? []);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`tpl-${template.id}-subject`}>Subject</Label>
        <Input
          id={`tpl-${template.id}-subject`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`tpl-${template.id}-body`}>Body</Label>
        <Textarea
          id={`tpl-${template.id}-body`}
          rows={8}
          className="resize-none font-number text-xs leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              Template attachments
            </p>
            <p className="mt-1 text-xs text-slate-500">
              These files are attached automatically whenever this template is sent.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            Add File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => void handleAttachmentChange(event.target.files)}
          />
        </div>
        {attachments.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {attachments.map((attachment) => {
              const isImage = attachment.contentType.startsWith("image/");
              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-700 ring-1 ring-slate-100"
                >
                  {isImage ? (
                    <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {formatBytes(attachment.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No default attachment for this template.
          </p>
        )}
      </div>

      {/* Variables hint */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
          <Variable className="h-3 w-3" />
          Available variables
        </p>
        <div className="flex flex-wrap gap-1.5">
          {template.variables.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBody((prev) => `${prev}${v}`)}
              className="text-[11px] font-number bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 transition-colors"
              title={`Insert ${v} at end of body`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset to default
        </Button>
        <Button
          size="sm"
          disabled={!dirty}
          onClick={handleSave}
          className="bg-navy hover:bg-navy/90 text-white"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save
        </Button>
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-slate-400" />
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Preview (with sample variables)
          </p>
        </div>
        <div className="px-3 py-2.5 space-y-1.5 text-xs">
          <p className="font-semibold text-slate-700">{previewSubject(subject)}</p>
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
            {previewBody(body)}
          </p>
        </div>
      </div>
    </div>
  );
}

const SAMPLE_VARS: Record<string, string> = {
  "Client Name": "Mei Wang",
  Carrier: "Canada Life",
  "Policy Name": "My Par Gold",
  "Policy Number": "3721879",
  "Death Benefit": "$2,500,000",
  "Face Amount": "$2,500,000",
  "Premium Amount": "$12,000",
  Date: "May 07",
};

function fillSample(text: string): string {
  return text.replace(/\[([^\]\n]+)\]/g, (m, name: string) =>
    SAMPLE_VARS[name] !== undefined ? SAMPLE_VARS[name] : m
  );
}
function previewSubject(s: string) {
  return fillSample(s);
}
function previewBody(b: string) {
  return fillSample(b);
}
