/**
 * Markdown Utilities — US-04 AC5
 * ============================================================================
 * Pure functions cho markdown → HTML conversion.
 * Tách riêng khỏi MarkdownRenderer component để tuân thủ react-refresh/only-export-components.
 *
 * Security: Escape HTML entities TRƯỚC khi apply regex → chống XSS.
 */

// === Helper: Escape HTML entities ===

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// === Core: Convert markdown → HTML ===

function convertMarkdownToHtml(md: string): string {
  // Step 1: Extract code blocks TRƯỚC khi escape (để giữ nguyên nội dung)
  const codeBlocks: string[] = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const escaped = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    codeBlocks.push(
      `<pre class="md-code-block"${langAttr}><code>${escaped}</code></pre>`
    );
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  // Step 2: Extract inline code
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_match, code: string) => {
    inlineCodes.push(`<code class="md-inline-code">${escapeHtml(code)}</code>`);
    return `%%INLINECODE_${inlineCodes.length - 1}%%`;
  });

  // Step 3: Escape remaining HTML
  processed = escapeHtml(processed);

  // Step 4: Convert headings (# → h3, ## → h4, ### → h5)
  processed = processed.replace(/^### (.+)$/gm, '<h5 class="md-heading">$1</h5>');
  processed = processed.replace(/^## (.+)$/gm, '<h4 class="md-heading">$1</h4>');
  processed = processed.replace(/^# (.+)$/gm, '<h3 class="md-heading">$1</h3>');

  // Step 5: Convert bold (**text**)
  processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Step 6: Convert italic (*text*) — phải sau bold
  processed = processed.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Step 7: Convert unordered lists (- item)
  // Nhóm các dòng liên tiếp bắt đầu bằng "- " thành <ul>
  processed = processed.replace(
    /((?:^- .+$\n?)+)/gm,
    (listBlock: string) => {
      const items = listBlock
        .split("\n")
        .filter((line) => line.startsWith("- "))
        .map((line) => `<li>${line.substring(2)}</li>`)
        .join("");
      return `<ul class="md-list">${items}</ul>`;
    }
  );

  // Step 8: Convert newlines → <br> (nhưng không sau block elements)
  processed = processed.replace(/\n/g, "<br>");

  // Cleanup: remove <br> ngay sau block elements
  processed = processed.replace(/<\/(h[345]|ul|pre|li)><br>/g, "</$1>");
  processed = processed.replace(/<br><(h[345]|ul|pre)/g, "<$1");

  // Step 9: Restore code blocks
  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`%%CODEBLOCK_${i}%%`, block);
  });

  // Step 10: Restore inline codes
  inlineCodes.forEach((code, i) => {
    processed = processed.replace(`%%INLINECODE_${i}%%`, code);
  });

  return processed;
}

export { escapeHtml, convertMarkdownToHtml };
