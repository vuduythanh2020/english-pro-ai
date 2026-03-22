import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../../utils/logger.js";

/**
 * Root dir của dự án — dùng để giới hạn phạm vi đọc/ghi file.
 */
const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, "src");

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
    const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(PROJECT_ROOT, filePath);

    // Đảm bảo nằm trong src/ hoặc frontend/
    if (resolved.startsWith(SRC_DIR) || resolved.startsWith(path.join(PROJECT_ROOT, "frontend"))) {
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
 * Tool: Đọc file đầy đủ (không giới hạn dòng).
 * Hỗ trợ pagination với offset/limit.
 */
export const readFileFullTool = tool(
    async ({ filePath, offset = 0, limit = 0 }) => {
        const safePath = resolveSafePath(filePath);
        if (!safePath) {
            return `❌ Lỗi: Chỉ được đọc file trong thư mục src/ hoặc frontend/. Đường dẫn: ${filePath}`;
        }

        try {
            const content = fs.readFileSync(safePath, "utf-8");
            const lines = content.split("\n");

            const startLine = Math.max(0, offset);
            const endLine = limit > 0 ? Math.min(lines.length, startLine + limit) : lines.length;
            const selectedLines = lines.slice(startLine, endLine);

            const output = selectedLines.join("\n");
            const hasMore = endLine < lines.length;

            logger.debug(`📖 Agent đọc file đầy đủ: ${filePath} (dòng ${startLine}-${endLine}/${lines.length})`);

            return hasMore
                ? `${output}\n\n... (còn ${lines.length - endLine} dòng nữa, tổng ${lines.length} dòng)`
                : output;
        } catch {
            return `❌ Không tìm thấy file: ${filePath}`;
        }
    },
    {
        name: "read_file_full",
        description:
            "Đọc nội dung file đầy đủ (không giới hạn dòng). Hỗ trợ pagination với offset/limit. Chỉ đọc được file trong thư mục src/ hoặc frontend/.",
        schema: z.object({
            filePath: z
                .string()
                .describe("Đường dẫn file cần đọc, tương đối từ root dự án. Ví dụ: src/api/routes.ts"),
            offset: z
                .number()
                .describe("Số dòng bắt đầu (Ví dụ: 0)"),
            limit: z
                .number()
                .describe("Số dòng cần đọc (Truyền 0 để đọc tới cuối file)"),
        }),
    }
);

/**
 * Tool: Ghi/tạo file mới.
 * Chỉ cho phép ghi file trong src/ hoặc frontend/.
 */
export const writeFileTool = tool(
    async ({ filePath, content }) => {
        const safePath = resolveSafePath(filePath);
        if (!safePath) {
            return `❌ Lỗi: Chỉ được ghi file trong thư mục src/ hoặc frontend/. Đường dẫn: ${filePath}`;
        }

        try {
            // Tạo thư mục nếu chưa tồn tại
            const dir = path.dirname(safePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(safePath, content, "utf-8");
            logger.info(`✍️ Agent ghi file: ${filePath}`);
            return `✅ Ghi file thành công: ${filePath}`;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return `❌ Lỗi khi ghi file: ${errMsg}`;
        }
    },
    {
        name: "write_file",
        description:
            "Ghi/tạo file mới. Chỉ được ghi file trong thư mục src/ hoặc frontend/. Nếu file đã tồn tại sẽ bị overwrite.",
        schema: z.object({
            filePath: z
                .string()
                .describe("Đường dẫn file cần ghi, tương đối từ root dự án. Ví dụ: src/api/routes.ts"),
            content: z
                .string()
                .describe("Nội dung file cần ghi"),
        }),
    }
);

/**
 * Tool: Chạy lệnh (npm test, tsc, eslint, etc).
 * Giới hạn các lệnh được phép chạy.
 */
export const executeCommandTool = tool(
    async ({ command, cwd = "." }) => {
        // Whitelist các lệnh được phép
        const allowedCommands = [
            "npm test",
            "npm run test",
            "npm run lint",
            "npm run type-check",
            "npm run build",
            "tsc --noEmit",
            "tsc",
            "eslint",
            "jest",
            "vitest",
        ];

        const isAllowed = allowedCommands.some((allowed) =>
            command.toLowerCase().startsWith(allowed.toLowerCase())
        );

        if (!isAllowed) {
            return `❌ Lệnh không được phép: ${command}. Chỉ được chạy: ${allowedCommands.join(", ")}`;
        }

        try {
            const workDir = cwd === "." ? PROJECT_ROOT : path.join(PROJECT_ROOT, cwd);

            logger.info(`🔧 Agent chạy lệnh: ${command} (trong ${workDir})`);

            const output = execSync(command, {
                cwd: workDir,
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            return output || "✅ Lệnh chạy thành công (không có output)";
        } catch (error: unknown) {
            // execSync throws an object with stdout, stderr, status khi exit code != 0
            const execError = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number; message?: string };
            const stdout = execError.stdout ? execError.stdout.toString().trim() : "";
            const stderr = execError.stderr ? execError.stderr.toString().trim() : "";
            const exitCode = execError.status ?? -1;
            const fallbackMsg = error instanceof Error ? error.message : String(error);

            logger.warn(`⚠️ Lệnh thất bại: ${command} (exit code: ${exitCode})`);

            // Build chi tiết output để LLM có thể parse và sửa lỗi
            const MAX_OUTPUT_CHARS = 8000;
            let detail = `❌ Lệnh thất bại (exit code ${exitCode}): ${command}\n`;

            if (stdout) {
                const truncStdout = stdout.length > MAX_OUTPUT_CHARS
                    ? stdout.slice(-MAX_OUTPUT_CHARS) + `\n...(truncated, giữ ${MAX_OUTPUT_CHARS} chars cuối)`
                    : stdout;
                detail += `\n[STDOUT]\n${truncStdout}\n`;
            }
            if (stderr) {
                const truncStderr = stderr.length > MAX_OUTPUT_CHARS
                    ? stderr.slice(-MAX_OUTPUT_CHARS) + `\n...(truncated, giữ ${MAX_OUTPUT_CHARS} chars cuối)`
                    : stderr;
                detail += `\n[STDERR]\n${truncStderr}\n`;
            }
            if (!stdout && !stderr) {
                detail += `\n[ERROR MESSAGE]\n${fallbackMsg}\n`;
            }

            return detail;
        }
    },
    {
        name: "execute_command",
        description:
            "Chạy lệnh CLI (npm test, tsc, eslint, etc). Chỉ cho phép chạy các lệnh an toàn như: npm test, npm run lint, tsc --noEmit, eslint, jest, vitest.",
        schema: z.object({
            command: z
                .string()
                .describe("Lệnh cần chạy. Ví dụ: npm test, tsc --noEmit, npm run lint"),
            cwd: z
                .string()
                .describe("Thư mục làm việc (Ví dụ: '.' cho root dự án, hoặc 'frontend')"),
        }),
    }
);

/**
 * Tool: Xem cấu trúc dự án (tree view).
 */
export const getProjectStructureTool = tool(
    async ({ maxDepth = 3 }) => {
        try {
            const buildTree = (dir: string, prefix: string = "", depth: number = 0): string[] => {
                if (depth > maxDepth) return [];

                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const lines: string[] = [];

                const filtered = entries
                    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
                    .sort((a, b) => {
                        if (a.isDirectory() && !b.isDirectory()) return -1;
                        if (!a.isDirectory() && b.isDirectory()) return 1;
                        return a.name.localeCompare(b.name);
                    });

                filtered.forEach((entry, index) => {
                    const isLast = index === filtered.length - 1;
                    const icon = entry.isDirectory() ? "📁" : "📄";
                    const connector = isLast ? "└── " : "├── ";
                    lines.push(`${prefix}${connector}${icon} ${entry.name}`);

                    if (entry.isDirectory()) {
                        const nextPrefix = prefix + (isLast ? "    " : "│   ");
                        lines.push(...buildTree(path.join(dir, entry.name), nextPrefix, depth + 1));
                    }
                });

                return lines;
            };

            const tree = buildTree(SRC_DIR);
            const output = `📂 src/\n${tree.join("\n")}`;

            logger.debug(`🌳 Agent xem cấu trúc dự án`);
            return output;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return `❌ Lỗi khi xem cấu trúc: ${errMsg}`;
        }
    },
    {
        name: "get_project_structure",
        description:
            "Xem cấu trúc dự án dưới dạng tree view. Giúp agent hiểu toàn bộ cấu trúc thư mục.",
        schema: z.object({
            maxDepth: z
                .number()
                .describe("Độ sâu tối đa của tree (Ví dụ: 3)"),
        }),
    }
);

/**
 * Tool: Submit Feature
 */
export const submitFeatureTool = tool(
    async ({ report }) => {
        return `✅ Đã nộp bài: ${report}`;
    },
    {
        name: "submit_feature",
        description: "Gọi kết thúc nhiệm vụ. CHÍNH THỨC NỘP BÀI TỚI PM. CHỈ GỌI KHI ĐÃ HOÀN THÀNH TOÀN BỘ CODE BẰNG WRITE_FILE VÀ VERIFY THÀNH CÔNG.",
        schema: z.object({
            report: z.string().describe("Báo cáo chi tiết các file đã ghi và giải thích kỹ thuật bằng tiếng Việt."),
        }),
    }
);

/**
 * Tất cả execution tools — dùng để bind vào LLM.
 */
export const executionTools = [
    readFileFullTool,
    writeFileTool,
    executeCommandTool,
    getProjectStructureTool,
    submitFeatureTool,
];
