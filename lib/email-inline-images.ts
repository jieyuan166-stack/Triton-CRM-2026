export interface InlineImageAttachment {
  cid: string;
  filename: string;
  contentType: string;
  content: Buffer;
  contentDisposition: "inline";
  headers?: Record<string, string>;
}

export function attachInlineImages(html: string): {
  html: string;
  attachments: InlineImageAttachment[];
} {
  const attachments: InlineImageAttachment[] = [];

  const htmlWithInlineImages = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const isComposeInlineImage = /\bdata-inline-attachment=(["'])true\1/i.test(tag);
    const srcMatch = /\bsrc=(["'])data:(image\/[^;]+);base64,([^"']+)\1/i.exec(tag);

    if (!srcMatch) return tag;

    // Gmail/Outlook often expose arbitrary cid signature images as visible
    // attachments. Only user-uploaded compose images carry this explicit
    // marker; unmarked base64 images are stripped as decorative/unsafe.
    if (!isComposeInlineImage) return "";

    const contentType = srcMatch[2];
    const base64 = srcMatch[3].replace(/\s/g, "");
    const filenameMatch = /\bdata-filename=(["'])(.*?)\1/i.exec(tag);
    const extension = contentType.split("/")[1]?.replace(/[^a-z0-9.+-]/gi, "") || "png";
    const filename = (filenameMatch?.[2] || `inline-image-${attachments.length + 1}.${extension}`)
      .replace(/[\\/:*?"<>|]/g, "-");
    const cid = `compose-inline-${attachments.length + 1}-${Date.now()}@crm.tritonwealth.ca`;

    attachments.push({
      cid,
      filename,
      contentType,
      content: Buffer.from(base64, "base64"),
      contentDisposition: "inline",
      headers: {
        "Content-ID": `<${cid}>`,
      },
    });

    return tag
      .replace(/\bsrc=(["'])data:image\/[^;]+;base64,[^"']+\1/i, `src="cid:${cid}"`)
      .replace(/\s+\bdata-inline-attachment=(["'])true\1/gi, "")
      .replace(/\s+\bdata-filename=(["']).*?\1/gi, "");
  });

  const htmlWithoutUnmarkedEmbeddedImages = htmlWithInlineImages
    .replace(/<img\b[^>]*\bsrc=(["'])data:image\/[^;]+;base64,[^"']+\1[^>]*>/gi, "")
    .replace(/\s+\bsrc=(["'])data:image\/[^;]+;base64,[^"']+\1/gi, "");

  return { html: htmlWithoutUnmarkedEmbeddedImages, attachments };
}
