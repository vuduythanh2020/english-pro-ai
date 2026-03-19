import * as fs from "fs";
import * as path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { executionTools } from "./execution-tools.js";

/**
 * Root dir của dự án — dùng để giới hạn phạm vi đọc file.
 */
const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");

/**
 * Các file root được phép đọc (ngoài src/ và frontend/).
 * Agents cần đọc package.json để biết test runner, scripts, dependencies.
 */
const ALLOWED_ROOT_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
];

/**
 * Kiểm tra đường dẫn có nằm trong phạm vi cho phép không (sandbox).
 * Cho phép: src/*, frontend/*, và một số file root cụ thể.
 */
function resolveSafePath(filePath: string): string | null {
  // Hỗ trợ cả đường dẫn tương đối (src/...) và tuyệt đối
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(PROJECT_ROOT, filePath);

  // Đảm bảo nằm trong src/ hoặc frontend/
  if (resolved.startsWith(SRC_DIR) || resolved.startsWith(FRONTEND_DIR)) {
    return resolved;
  }

  // Cho phép đọc một số file root cụ thể (read-only config files)
  const relativePath = path.relative(PROJECT_ROOT, resolved);
  if (ALLOWED_ROOT_FILES.includes(relativePath)) {
    return resolved;
  }

  return null;
}

/**
 * Tool: Đọc nội dung file trong dự án.
 * Giới hạn trong thư mục src/ hoặc frontend/ và tối đa 500 dòng đầu.
 */
export const readProjectFileTool = tool(
  async ({ filePath }) => {
    const safePath = resolveSafePath(filePath);
    if (!safePath) {
      return `❌ Lỗi: Chỉ được đọc file trong thư mục src/ hoặc frontend/. Đường dẫn: ${filePath}`;
    }

    try {
      const content = fs.readFileSync(safePath, "utf-8");
      const lines = content.split("\n");
      const maxLines = 500;
      const truncated = lines.length > maxLines;
      const output = lines.slice(0, maxLines).join("\n");

      logger.debug(`🔍 Agent đọc file: ${filePath} (${lines.length} dòng)`);

      return truncated
        ? `${output}\n\n... (còn ${lines.length - maxLines} dòng nữa, tổng ${lines.length} dòng)`
        : output;
    } catch {
      return `❌ Không tìm thấy file: ${filePath}`;
    }
  },
  {
    name: "read_project_file",
    description:
      "Đọc nội dung một file mã nguồn trong dự án. Chỉ đọc được file trong thư mục src/ hoặc frontend/. Dùng để hiểu code hiện tại trước khi viết code mới.",
    schema: z.object({
      filePath: z
        .string()
        .describe(
          "Đường dẫn file cần đọc, tương đối từ root dự án. Ví dụ: src/api/routes.ts"
        ),
    }),
  }
);

/**
 * Tool: Liệt kê file và thư mục con.
 * Giới hạn trong thư mục src/ hoặc frontend/.
 */
export const listDirectoryTool = tool(
  async ({ dirPath }) => {
    const safePath = resolveSafePath(dirPath);
    if (!safePath) {
      return `❌ Lỗi: Chỉ được xem thư mục trong src/ hoặc frontend/. Đường dẫn: ${dirPath}`;
    }

    try {
      const entries = fs.readdirSync(safePath, { withFileTypes: true });

      const result = entries
        .filter((e) => !e.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((e) => {
          const icon = e.isDirectory() ? "📁" : "📄";
          if (!e.isDirectory()) {
            try {
              const stat = fs.statSync(path.join(safePath, e.name));
              return `${icon} ${e.name} (${stat.size} bytes)`;
            } catch {
              return `${icon} ${e.name}`;
            }
          }
          return `${icon} ${e.name}/`;
        })
        .join("\n");

      logger.debug(`📂 Agent xem thư mục: ${dirPath}`);
      return result || "(thư mục trống)";
    } catch {
      return `❌ Không tìm thấy thư mục: ${dirPath}`;
    }
  },
  {
    name: "list_directory",
    description:
      "Xem danh sách file và thư mục con trong một thư mục của dự án. Chỉ xem được trong thư mục src/ hoặc frontend/. Dùng để hiểu cấu trúc dự án trước khi viết code.",
    schema: z.object({
      dirPath: z
        .string()
        .describe(
          "Đường dẫn thư mục cần xem, tương đối từ root dự án. Ví dụ: src/api hoặc src/dev-team/agents"
        ),
    }),
  }
);

/**
 * Codebase tools cơ bản (read-only) — dùng cho PO, BA agents.
 */
export const codebaseTools = [readProjectFileTool, listDirectoryTool];

/**
 * Tất cả tools (read + write + execute) — dùng cho DEV, TESTER agents.
 */
export const allDevTools = [
  readProjectFileTool,
  listDirectoryTool,
  ...executionTools,
];
