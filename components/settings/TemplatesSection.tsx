// components/settings/TemplatesSection.tsx
"use client";

import { useState } from "react";
import { Check, RotateCcw, Save, Sparkles, Variable } from "lucide-react";
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
import type { EmailTemplate, EmailTemplateId } from "@/lib/settings-types";

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
            <code className="font-mono text-[11px] px-1 rounded bg-slate-100">
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
  onSave: (patch: { subject: string; body: string }) => void;
  onReset: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  // Re-hydrate when the underlying template changes (e.g. after reset).
  // Compare by reference; React triggers TabsContent remount otherwise.
  if (
    subject !== template.subject &&
    body !== template.body &&
    subject === "" &&
    body === ""
  ) {
    setSubject(template.subject);
    setBody(template.body);
  }

  const dirty =
    subject.trim() !== template.subject.trim() ||
    body !== template.body;

  function handleSave() {
    onSave({ subject: subject.trim(), body });
  }

  function handleReset() {
    onReset();
    setSubject(template.subject);
    setBody(template.body);
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
          className="resize-none font-mono text-xs leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
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
              className="text-[11px] font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 transition-colors"
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
