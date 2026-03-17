import { v4 as uuidv4 } from "uuid";

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Generate a thread ID for LangGraph checkpointer
 */
export function generateThreadId(): string {
  return `thread_${uuidv4()}`;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
