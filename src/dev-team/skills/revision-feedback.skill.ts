/**
 * Skill: Revision from Feedback
 * ============================================================================
 * Hướng dẫn agent xử lý khi nhận feedback từ PM hoặc test results fail.
 * Focus vào đọc feedback → đọc code cũ → xác định scope → fix → verify.
 *
 * Dev only
 * Kích hoạt: Khi hasFeedback = true
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const revisionFeedbackSkill: AgentSkill = {
    name: "revision-feedback",
    description:
        "Quy trình xử lý khi nhận feedback từ PM hoặc test results fail. Đọc feedback → đọc code cũ → scope → fix.",
    applicableRoles: ["dev"],
    priority: 8, // Rất cao — khi có feedback thì đây là nhiệm vụ chính

    shouldActivate(context: SkillSelectionContext): boolean {
        return context.hasFeedback;
    },

    getPromptFragment(): string {
        return `
### Quy trình xử lý Feedback / Revision (ĐANG KÍCH HOẠT)

Bạn đang trong chế độ REVISION — code trước đó bị reject hoặc fail test.

**Bước 1: Phân tích feedback**
- Đọc kỹ feedback từ PM hoặc báo cáo từ Tester
- Xác định: feedback yêu cầu thay đổi GÌ cụ thể?
- Phân loại: sửa logic? sửa architecture? thêm feature? fix bug?

**Bước 2: Đọc code cũ**
- Dùng \`read_project_file\` để đọc file cần sửa
- Hiểu context xung quanh (imports, dependencies, callers)
- KHÔNG rewrite toàn bộ nếu chỉ cần sửa 1-2 chỗ

**Bước 3: Xác định scope thay đổi**
- Liệt kê chính xác files nào cần sửa
- Ưu tiên: minimal change — sửa ít nhất có thể để đáp ứng feedback
- Nếu feedback yêu cầu thay đổi lớn → giải thích approach trước khi viết

**Bước 4: Fix và Verify**
- Dùng \`write_file\` để sửa từng file
- Chạy \`tsc --noEmit\` sau mỗi file sửa
- Nếu feedback từ Tester có execution logs → đọc logs để hiểu lỗi runtime

**QUAN TRỌNG:**
- ĐỌC KỸ execution logs và tester feedback trước khi sửa
- Dùng \`read_project_file\` để đọc code gốc — KHÔNG dựa vào truncated version trong prompt
- Sau khi sửa xong → verify bằng \`tsc --noEmit\` → rồi mới \`submit_feature\`
`.trim();
    },

    requiredTools: [
        "read_project_file",
        "write_file",
        "execute_command",
        "submit_feature",
    ],
};
