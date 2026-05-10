export interface InlineImageAttachment {
  cid: string;
  filename: string;
  contentType: string;
  content: Buffer;
  contentDisposition: "inline";
}

export function attachInlineImages(html: string): {
  html: string;
  attachments: InlineImageAttachment[];
} {
  const matches = Array.from(
    html.matchAll(/src=(["'])(data:image\/([^;]+);base64,([^"']+))\1/gi),
  );

  if (matches.length === 0) return { html, attachments: [] };

  let nextHtml = html;
  const attachments = matches.map((match, index) => {
    const fullAttribute = match[0];
    const mimeSubtype = match[3].toLowerCase();
    const base64 = match[4];
    const cid = `triton_signature_${Date.now()}_${index}@triton-crm`;
    const extension = mimeSubtype === "jpeg" ? "jpg" : mimeSubtype;

    nextHtml = nextHtml.replace(fullAttribute, `src="cid:${cid}"`);

    return {
      cid,
      filename: `triton-signature-${index + 1}.${extension}`,
      contentType: `image/${mimeSubtype}`,
      content: Buffer.from(base64, "base64"),
      contentDisposition: "inline" as const,
    };
  });

  return { html: nextHtml, attachments };
}
