/**
 * MarkdownRenderer Component — US-04 AC5
 * ============================================================================
 * Lightweight markdown renderer không cần dependency bên ngoài.
 * Hỗ trợ:
 * - Headings (#, ##, ###)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Inline code (`code`)
 * - Code blocks (```lang\ncode\n```)
 * - Unordered lists (- item)
 * - Newlines → <br>
 *
 * Logic conversion nằm trong markdown-utils.ts (tách ra để tuân thủ
 * react-refresh/only-export-components — file component chỉ export components).
 */

import { convertMarkdownToHtml } from "./markdown-utils.ts";

// === Component ===

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = convertMarkdownToHtml(content);
  return (
    <div
      className={`markdown-content ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { MarkdownRenderer };
export type { MarkdownRendererProps };
