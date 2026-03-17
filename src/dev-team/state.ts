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
});

export type DevTeamStateType = typeof DevTeamState.State;
