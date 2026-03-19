/**
 * Normalize tool arguments: LLM đôi khi gửi snake_case thay vì camelCase,
 * hoặc dùng alias khác cho cùng 1 tham số.
 *
 * Ví dụ: file_path → filePath, dir_path → dirPath, max_depth → maxDepth, code → content.
 *
 * Shared utility — dùng chung cho tất cả agents (Dev, Tester, BA).
 */
export function normalizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...args };

    // ── filePath aliases ──────────────────────────────────────────
    // file_path, path, filepath → filePath
    if (!normalized.filePath && (normalized.file_path || normalized.path || normalized.filepath)) {
        normalized.filePath = normalized.file_path || normalized.path || normalized.filepath;
        delete normalized.file_path;
        delete normalized.filepath;
        delete normalized.path;
    }

    // ── dirPath aliases ───────────────────────────────────────────
    // dir_path, directory, dirpath → dirPath
    if (!normalized.dirPath && (normalized.dir_path || normalized.directory || normalized.dirpath)) {
        normalized.dirPath = normalized.dir_path || normalized.directory || normalized.dirpath;
        delete normalized.dir_path;
        delete normalized.directory;
        delete normalized.dirpath;
    }

    // ── content aliases ───────────────────────────────────────────
    // file_content, code, file_code, source, text, body → content
    if (!normalized.content) {
        const contentAliases = ["file_content", "code", "file_code", "source", "text", "body"];
        for (const alias of contentAliases) {
            if (normalized[alias] !== undefined) {
                normalized.content = normalized[alias];
                delete normalized[alias];
                break;
            }
        }
    }

    // Đảm bảo content là string (LLM đôi khi gửi object/array thay vì string)
    if (normalized.content !== undefined && typeof normalized.content !== "string") {
        normalized.content =
            typeof normalized.content === "object"
                ? JSON.stringify(normalized.content, null, 2)
                : String(normalized.content);
    }

    // ── maxDepth aliases ──────────────────────────────────────────
    // max_depth → maxDepth
    if (!normalized.maxDepth && normalized.max_depth) {
        normalized.maxDepth = normalized.max_depth;
        delete normalized.max_depth;
    }

    // ── command aliases ───────────────────────────────────────────
    // cmd → command
    if (!normalized.command && normalized.cmd) {
        normalized.command = normalized.cmd;
        delete normalized.cmd;
    }

    // ── report aliases ────────────────────────────────────────────
    // summary, result → report
    if (!normalized.report && (normalized.summary || normalized.result)) {
        normalized.report = normalized.summary || normalized.result;
        delete normalized.summary;
        delete normalized.result;
    }

    return normalized;
}
