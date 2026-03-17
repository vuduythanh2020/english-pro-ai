import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Trạng thái của Tutor Graph - quản lý hội thoại học tiếng Anh.
 */
export const TutorState = Annotation.Root({
  // Kế thừa messages từ MessagesAnnotation
  ...MessagesAnnotation.spec,

  /** Thông tin người học */
  userProfile: Annotation<{
    name: string;
    profession: string;
    level: "beginner" | "elementary" | "intermediate" | "upper-intermediate" | "advanced";
    goals: string[];
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({
      name: "",
      profession: "",
      level: "intermediate" as const,
      goals: [],
    }),
  }),

  /** Chủ đề đang học hiện tại */
  currentTopic: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** Agent hiện tại đang xử lý */
  activeAgent: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "supervisor",
  }),

  /** Tiến trình học tập */
  learningProgress: Annotation<{
    lessonsCompleted: number;
    quizzesCompleted: number;
    averageScore: number;
    vocabLearned: string[];
    grammarTopics: string[];
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({
      lessonsCompleted: 0,
      quizzesCompleted: 0,
      averageScore: 0,
      vocabLearned: [],
      grammarTopics: [],
    }),
  }),
});

export type TutorStateType = typeof TutorState.State;
