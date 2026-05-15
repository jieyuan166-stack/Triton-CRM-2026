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
  // Gmail/Outlook often expose cid inline images as visible attachments.
  // Signature images are decorative, so outbound mail keeps the HTML text
  // signature and strips embedded base64 images instead of creating
  // triton-signature-*.png attachments.
  const htmlWithoutEmbeddedImages = html
    .replace(/<img\b[^>]*\bsrc=(["'])data:image\/[^;]+;base64,[^"']+\1[^>]*>/gi, "")
    .replace(/\s+\bsrc=(["'])data:image\/[^;]+;base64,[^"']+\1/gi, "");

  return { html: htmlWithoutEmbeddedImages, attachments: [] };
}
