const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "div",
  "em",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "sub",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

export function sanitizeEmailHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|\')\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/<\/?([a-z0-9-]+)(\s[^>]*)?>/gi, (match, tagName: string) => {
      const tag = tagName.toLowerCase();
      return ALLOWED_TAGS.has(tag) ? match : "";
    });
}
