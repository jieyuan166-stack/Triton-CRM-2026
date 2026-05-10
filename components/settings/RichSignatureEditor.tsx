// components/settings/RichSignatureEditor.tsx
"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bold,
  ImagePlus,
  Italic,
  Link2,
  Palette,
  RemoveFormatting,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichSignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^(https?:|mailto:|tel:|data:image\/)/i.test(url)) return url;
  return `https://${url}`;
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function RichSignatureEditor({
  value,
  onChange,
  disabled = false,
}: RichSignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [color, setColor] = useState("#0f172a");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerHTML);
  }, [onChange]);

  const runCommand = useCallback(
    (command: string, commandValue?: string) => {
      if (disabled) return;
      editorRef.current?.focus();
      document.execCommand(command, false, commandValue);
      emitChange();
    },
    [disabled, emitChange]
  );

  function insertLink() {
    const href = normalizeUrl(window.prompt("Link URL") ?? "");
    if (!href) return;
    runCommand("createLink", href);
  }

  function insertImageUrl() {
    const src = normalizeUrl(window.prompt("Image URL") ?? "");
    if (!src) return;
    runCommand("insertImage", src);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (src) runCommand("insertImage", src);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        disabled && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <ToolbarButton
          label="Bold"
          disabled={disabled}
          onClick={() => runCommand("bold")}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={disabled}
          onClick={() => runCommand("italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <ToolbarButton label="Add link" disabled={disabled} onClick={insertLink}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert image URL"
          disabled={disabled}
          onClick={insertImageUrl}
        >
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Upload image"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <label className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-slate-500 hover:bg-white">
          <Palette className="h-4 w-4" />
          <input
            type="color"
            value={color}
            disabled={disabled}
            onChange={(event) => {
              setColor(event.target.value);
              runCommand("foreColor", event.target.value);
            }}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed"
            title="Text color"
          />
        </label>

        <ToolbarButton
          label="Clear formatting"
          disabled={disabled}
          onClick={() => runCommand("removeFormat")}
        >
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Email signature editor"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        className={cn(
          "min-h-52 px-4 py-3 text-sm leading-relaxed text-slate-900 outline-none",
          "[&_a]:text-blue-600 [&_a]:underline",
          "[&_img]:my-2 [&_img]:max-h-32 [&_img]:max-w-full [&_img]:rounded-lg",
          disabled ? "cursor-not-allowed bg-slate-50" : "bg-white"
        )}
      />
    </div>
  );
}
