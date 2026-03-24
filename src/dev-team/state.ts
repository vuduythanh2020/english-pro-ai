import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Trạng thái của Dev Team workflow.
 * Mở rộng MessagesAnnotation để có lịch sử tin nhắn tích hợp sẵn.
 */
export const DevTeamState = Annotation.Root({
  // Kế thừa messages từ MessagesAnnotation
  ...MessagesAnnotation.spec,

  /** Yêu cầu tính năng ban đầu từ Product Manager (bạn) */
  featureRequest: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** User Stories do PO Agent tạo ra */
  userStories: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Lưu trữ mảng toàn bộ User Stories sau khi bóc tách */
  allUserStories: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Index của User Story hiện tại đang được BA/Dev xử lý */
  currentUsIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** Tài liệu thiết kế do BA Agent tạo ra */
  designDocument: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Source code do DEV Agent tạo ra */
  sourceCode: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Kết quả test do TESTER Agent tạo ra */
  testResults: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Phase hiện tại trong workflow */
  currentPhase: Annotation<
    "requirements" | "design" | "development" | "testing" | "done"
  >({
    reducer: (_, next) => next,
    default: () => "requirements",
  }),

  /** Feedback từ human (bạn) tại các approval gate */
  humanFeedback: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Agent tiếp theo cần xử lý (dùng cho supervisor routing) */
  nextAgent: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "po_agent",
  }),

  /** Thông tin cấu trúc dự án, tự động scan khi khởi tạo graph */
  projectContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Output từ execution commands (npm test, tsc, eslint, etc) */
  executionLogs: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Metrics về code quality từ tester */
  codeQualityMetrics: Annotation<{
    typeErrors: number;
    lintErrors: number;
    testsPassed: number;
    testsFailed: number;
    testCoverage: number;
  }>({
    reducer: (_, next) => next,
    default: () => ({
      typeErrors: 0,
      lintErrors: 0,
      testsPassed: 0,
      testsFailed: 0,
      testCoverage: 0,
    }),
  }),

  /** Số lần dev quay lại để fix bugs */
  devAttempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** Chi tiết feedback từ tester (gợi ý fix cụ thể) */
  testerFeedback: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Tóm tắt thay đổi từ sprint vừa hoàn thành (do Context Sync Agent tạo) */
  contextSyncSummary: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Đề xuất thay đổi prompt từ Context Sync Agent (nếu phát hiện drift) */
  promptChangeProposal: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  // ============================================================================
  // WORKFLOW SUMMARY — Tích lũy báo cáo sau mỗi story
  // ============================================================================

  /** Mảng tích lũy summary sau mỗi story (APPEND reducer — không bị ghi đè) */
  completedStorySummaries: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  /** Bản tóm tắt cuối cùng toàn bộ workflow (do LLM tạo khi hoàn thành) */
  workflowSummary: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  // ============================================================================
  // WORKFLOW TRACKING (US-01)
  // Liên kết graph state ↔ database records xuyên suốt workflow lifecycle
  // ============================================================================

  /** Thread ID từ LangGraph checkpointer — truyền từ API route.
   *  Dùng để liên kết workflow run với thread trong createWorkflowRun().
   */
  threadId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** ID của workflow run hiện tại (UUID từ bảng workflow_runs).
   *  Gán 1 lần khi workflow bắt đầu. Mọi nodes đọc field này để ghi history.
   */
  workflowRunId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** ID của phase hiện tại (UUID từ bảng workflow_phases).
   *  Cập nhật mỗi khi agent bắt đầu phase mới. Approval gates đọc để liên kết record.
   */
  currentPhaseId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
});

export type DevTeamStateType = typeof DevTeamState.State;
