/**
 * Skill: Error Diagnosis and Fix Loop
 * ============================================================================
 * Quy trình xử lý lỗi khi execute_command thất bại (tsc, build, test).
 * Đây là skill QUAN TRỌNG NHẤT — extracted từ error nudge logic
 * hiện đang hardcoded trong dev.agent.ts và tester.agent.ts.
 *
 * Shared: Dev + Tester
 * Kích hoạt: Khi hasError = true (round trước có command fail)
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const errorFixLoopSkill: AgentSkill = {
    name: "error-fix-loop",
    description:
        "Quy trình chẩn đoán và sửa lỗi khi execute_command thất bại. Parse error output → xác định file → fix → re-verify.",
    applicableRoles: ["dev", "tester"],
    priority: 5, // Ưu tiên cao nhất khi có lỗi — override mọi skill khác

    shouldActivate(context: SkillSelectionContext): boolean {
        return context.hasError;
    },

    getPromptFragment(context?: SkillSelectionContext): string {
        const writtenFiles = context?.writtenFiles ?? [];
        const writtenFilesList =
            writtenFiles.length > 0
                ? `Danh sách file bạn đã tạo/sửa: ${writtenFiles.join(", ")}`
                : "Bạn chưa write file nào.";

        return `
### ⚠️ QUY TRÌNH XỬ LÝ LỖI (ĐANG KÍCH HOẠT — CÓ LỖI TRONG ROUND TRƯỚC)

**Bước 1: ĐỌC KỸ error output**
- Tìm pattern: \`file(line,col): error TSxxxx: message\` (TypeScript)
- Tìm pattern: \`Error: expect(...).toXxx()\` (Test assertion)
- Tìm pattern: \`SyntaxError\`, \`Transform failed\` (Syntax)

**Bước 2: XÁC ĐỊNH file lỗi thuộc nhóm nào**
- ${writtenFilesList}
- Nếu file lỗi NẰM TRONG danh sách trên → **BẮT BUỘC SỬA NGAY** bằng \`read_project_file\` rồi \`write_file\`
- Nếu file lỗi KHÔNG nằm trong danh sách (pre-existing) → **GHI NHẬN**, tiếp tục công việc

**Bước 3: SỬA LỖI**
- Dùng \`read_project_file\` để đọc file lỗi → hiểu context xung quanh
- Dùng \`write_file\` để ghi lại file đã sửa (toàn bộ nội dung)
- Chú ý: sửa NGUYÊN NHÂN GỐC, không hack/workaround

**Bước 4: VERIFY LẠI**
- Chạy lại \`tsc --noEmit\` (hoặc \`npm test\` nếu đang test) để verify fix
- Nếu vẫn lỗi → lặp lại Bước 1-4 (tối đa 3 vòng)
- Nếu hết 3 vòng vẫn lỗi → submit kèm danh sách remaining errors

**TUYỆT ĐỐI KHÔNG ĐƯỢC:**
- ❌ Retry cùng command mà không sửa gì trước
- ❌ Bỏ qua lỗi compilation ở file mình đã viết rồi submit
- ❌ Chạy \`npm test\` khi build còn chưa pass
- ❌ Dùng pipe \`|\`, \`||\`, \`&&\`, redirect \`>\` trong execute_command
`.trim();
    },

    requiredTools: [
        "read_project_file",
        "write_file",
        "execute_command",
    ],
};
