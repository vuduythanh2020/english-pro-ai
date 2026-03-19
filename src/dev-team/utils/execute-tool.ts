import { ToolMessage } from "@langchain/core/messages";
import {
    readProjectFileTool,
    listDirectoryTool,
} from "../tools/codebase-tools.js";
import {
    readFileFullTool,
    writeFileTool,
    executeCommandTool,
    getProjectStructureTool,
    submitFeatureTool,
} from "../tools/execution-tools.js";
import { normalizeToolArgs } from "./normalize-args.js";
import { logger } from "../../utils/logger.js";

/**
 * Schema descriptions cho từng tool — dùng trong error messages
 * để hướng dẫn LLM gửi đúng format khi gọi sai.
 */
export const TOOL_SCHEMAS: Record<string, string> = {
    read_project_file: '{"filePath": "src/path/to/file.ts"}',
    list_directory: '{"dirPath": "src/path/to/dir"}',
    read_file_full: '{"filePath": "src/path/to/file.ts", "offset": 0, "limit": 0}',
    write_file: '{"filePath": "src/path/to/file.ts", "content": "file content here"}',
    execute_command: '{"command": "npm test", "cwd": "."}',
    get_project_structure: '{"maxDepth": 3}',
    submit_feature: '{"report": "báo cáo chi tiết..."}',
};

/**
 * Tool call input type.
 */
export interface ToolCallInput {
    name: string;
    args: Record<string, unknown>;
    id?: string;
}

/**
 * Thực thi tool call và trả về ToolMessage.
 * Hỗ trợ cả codebase tools và execution tools.
 * Tự động normalize args (snake_case → camelCase, alias mapping, type coercion).
 *
 * Shared utility — dùng chung cho Dev Agent và Tester Agent.
 */
export async function executeToolCall(toolCall: ToolCallInput): Promise<ToolMessage> {
    let result: string;
    const args = normalizeToolArgs(toolCall.args);

    switch (toolCall.name) {
        case "read_project_file":
            result = await readProjectFileTool.invoke(args as { filePath: string });
            break;
        case "list_directory":
            result = await listDirectoryTool.invoke(args as { dirPath: string });
            break;
        case "read_file_full":
            result = await readFileFullTool.invoke(args as { filePath: string; offset: number; limit: number });
            break;
        case "write_file":
            result = await writeFileTool.invoke(args as { filePath: string; content: string });
            break;
        case "execute_command":
            result = await executeCommandTool.invoke(args as { command: string; cwd: string });
            break;
        case "get_project_structure":
            result = await getProjectStructureTool.invoke(args as { maxDepth: number });
            break;
        case "submit_feature":
            result = await submitFeatureTool.invoke(args as { report: string });
            break;
        default:
            result = `❌ Tool không tồn tại: ${toolCall.name}`;
    }

    return new ToolMessage({
        content: result,
        tool_call_id: toolCall.id || "",
    });
}

/**
 * Build error ToolMessage khi tool call thất bại.
 * Phân biệt lỗi schema vs lỗi runtime để hướng dẫn LLM chính xác hơn.
 */
export function buildToolErrorMessage(
    toolName: string,
    toolCallId: string,
    error: unknown,
    sentArgs: Record<string, unknown>,
): ToolMessage {
    const errMsg = error instanceof Error ? error.message : String(error);
    const expectedSchema = TOOL_SCHEMAS[toolName] || "unknown";
    const isSchemaError = errMsg.includes("did not match expected schema");

    logger.error(`❌ Lỗi khi thực thi tool ${toolName}: ${errMsg}`);

    let hint: string;
    if (isSchemaError) {
        hint =
            `⚠️ THAM SỐ BẠN GỬI KHÔNG ĐÚNG SCHEMA.\n` +
            `Parameters bạn gửi: ${JSON.stringify(sentArgs)}\n` +
            `Schema đúng phải là: ${expectedSchema}\n\n` +
            `QUAN TRỌNG:\n` +
            `- Tên parameter dùng camelCase: filePath, dirPath, maxDepth (KHÔNG dùng snake_case)\n` +
            `- 'content' phải là STRING (plain text), KHÔNG phải object hay array\n` +
            `- Nếu bạn dùng key 'code', 'source', 'text' → phải đổi thành 'content'\n` +
            `Hãy gọi lại tool ${toolName} với đúng schema.`;
    } else {
        hint =
            `⚠️ LỖI KHI THỰC THI TOOL.\n` +
            `Parameters bạn gửi: ${JSON.stringify(sentArgs)}\n` +
            `Schema tham khảo: ${expectedSchema}\n\n` +
            `Chi tiết lỗi: ${errMsg}\n` +
            `Hãy kiểm tra lại parameters và thử gọi lại.`;
    }

    return new ToolMessage({
        content: `Lỗi công cụ ${toolName}: ${errMsg}.\n\n${hint}`,
        tool_call_id: toolCallId,
    });
}
