/**
 * AI Project Context Exporter
 *
 * Generates a Claude/ChatGPT-optimized XML bundle that wraps scraped content
 * in a rich <document> envelope with metadata attributes LLMs can cite precisely.
 *
 * Format:
 * <documents>
 *   <document index="1" id="..." url="..." title="..." word_count="..." scraped_at="...">
 *     <source>https://...</source>
 *     <content>
 * [content here]
 *     </content>
 *   </document>
 * </documents>
 */

export interface DocumentEntry {
  url: string;
  normalizedUrl: string;
  title: string | null;
  content: string; // html or markdown
  scrapedAt: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function slugId(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  } catch {
    return "doc";
  }
}

/**
 * Build an enriched XML string from one or more document entries.
 */
export function buildXml(documents: DocumentEntry[]): string {
  const docNodes = documents
    .map((doc, i) => {
      const id = slugId(doc.normalizedUrl);
      const wc = wordCount(doc.content);
      const title = doc.title ? escapeXml(doc.title) : "";
      const sourceUrl = escapeXml(doc.normalizedUrl);
      const escapedContent = escapeXml(doc.content);

      return `  <document
    index="${i + 1}"
    id="${id}"
    url="${sourceUrl}"
    title="${title}"
    word_count="${wc}"
    scraped_at="${doc.scrapedAt}"
  >
    <source>${sourceUrl}</source>
    <content>
${escapedContent}
    </content>
  </document>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<documents count="${documents.length}">
${docNodes}
</documents>`;
}

/**
 * Trigger a browser download of the XML content.
 */
export function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download of a markdown string.
 */
export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a filename from a URL + timestamp.
 * e.g. "nextjs-org-docs-2024-01-15T14-30"
 */
export function buildFilename(url: string, ext: string): string {
  let slug = "export";
  try {
    const u = new URL(url);
    slug = (u.hostname + u.pathname)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  } catch {
    /* keep default */
  }
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  return `${slug}-${ts}.${ext}`;
}
