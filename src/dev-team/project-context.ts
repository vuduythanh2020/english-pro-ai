import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger.js";

/**
 * Quét cấu trúc thư mục, trả về dạng cây text.
 * Giới hạn maxDepth để tránh quá dài.
 */
function scanDirectory(dir: string, depth = 0, maxDepth = 2): string {
  if (depth > maxDepth) return "";

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }

  const indent = "  ".repeat(depth);
  const ignore = new Set([
    "node_modules",
    "dist",
    ".git",
    ".env",
    ".env.example",
    "package-lock.json",
  ]);

  return entries
    .filter((e) => !e.name.startsWith(".") && !ignore.has(e.name))
    .sort((a, b) => {
      // Thư mục trước, file sau
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((e) => {
      if (e.isDirectory()) {
        const children = scanDirectory(
          path.join(dir, e.name),
          depth + 1,
          maxDepth
        );
        return `${indent}📁 ${e.name}/\n${children}`;
      }
      return `${indent}📄 ${e.name}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Tự động tạo project context từ codebase hiện tại.
 * Được gọi 1 lần khi khởi tạo graph.
 *
 * Trả về string ngắn gọn (~200-300 tokens) chứa:
 * - Tên dự án & mô tả
 * - Dependencies chính
 * - Cấu trúc thư mục src/ (max depth 2)
 */
export function generateProjectContext(): string {
  const rootDir = process.cwd();

  // Đọc package.json
  let projectName = "Unknown Project";
  let description = "";
  let deps: string[] = [];

  try {
    const pkgPath = path.join(rootDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    projectName = pkg.name || projectName;
    description = pkg.description || "";
    deps = Object.keys(pkg.dependencies || {});
  } catch {
    logger.warn("⚠️ Không tìm thấy package.json");
  }

  // Scan cấu trúc src/
  const srcDir = path.join(rootDir, "src");
  const structure = fs.existsSync(srcDir)
    ? scanDirectory(srcDir, 0, 2)
    : "Không tìm thấy thư mục src/";

  const context = `## Dự án: ${projectName}
${description ? `Mô tả: ${description}` : ""}

### Dependencies chính
${deps.join(", ")}

### Cấu trúc mã nguồn (src/)
${structure}

### Coding Conventions
- TypeScript strict mode, ESM modules
- File names: kebab-case (ví dụ: po.agent.ts)
- Sử dụng LangGraph JS cho agent workflows
- Export named functions, không dùng default export
- Đường dẫn import dùng đuôi .js`.trim();

  logger.info(`📋 Project context đã được tạo (${context.length} ký tự)`);
  return context;
}

/**
 * So sánh 2 project context strings và trả về bản tóm tắt thay đổi.
 * Dùng bởi Context Sync Agent để phát hiện file mới/xoá trong src/.
 *
 * @returns Object chứa danh sách thay đổi và flag hasSignificantChanges
 */
export function diffProjectContext(
  oldContext: string,
  newContext: string
): {
  addedLines: string[];
  removedLines: string[];
  changeSummary: string;
  hasSignificantChanges: boolean;
} {
  const oldLines = new Set(
    oldContext
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("📁") || l.startsWith("📄"))
  );
  const newLines = new Set(
    newContext
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("📁") || l.startsWith("📄"))
  );

  const addedLines = [...newLines].filter((l) => !oldLines.has(l));
  const removedLines = [...oldLines].filter((l) => !newLines.has(l));

  const parts: string[] = [];
  if (addedLines.length > 0) {
    parts.push(`### Files/Dirs Added\n${addedLines.map((l) => `+ ${l}`).join("\n")}`);
  }
  if (removedLines.length > 0) {
    parts.push(`### Files/Dirs Removed\n${removedLines.map((l) => `- ${l}`).join("\n")}`);
  }

  const changeSummary =
    parts.length > 0
      ? parts.join("\n\n")
      : "Không có thay đổi nào trong cấu trúc dự án.";

  // Đánh dấu significant nếu có thay đổi trong src/dev-team/ (workflow code)
  const devTeamChanged =
    addedLines.some((l) => l.includes("dev-team")) ||
    removedLines.some((l) => l.includes("dev-team"));

  const hasSignificantChanges =
    devTeamChanged || addedLines.length + removedLines.length >= 3;

  logger.info(
    `🔄 Context diff: +${addedLines.length} -${removedLines.length} files, significant=${hasSignificantChanges}`
  );

  return { addedLines, removedLines, changeSummary, hasSignificantChanges };
}
