/**
 * ChatPage — US-03 Refactored
 * ============================================================================
 * Trang chat với AI tutor. Đã loại bỏ:
 * - Tab navigation (tutor/devteam) — DevTeam giờ có trang riêng
 * - Dev Team state, functions, constants
 * - Sidebar chỉ hiển thị danh sách Tutor Agents
 *
 * Navigation giữa Chat và DevTeam được handle bởi AppNavbar.
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ========== Types ==========
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  timestamp: Date;
}

interface Agent {
  id: string;
  name: string;
  icon: string;
  gradient: string;
  description: string;
}

// ========== Constants ==========
const API_URL = "/api";

const TUTOR_AGENTS: Agent[] = [
  { id: "general_tutor", name: "General Tutor", icon: "📚", gradient: "var(--gradient-tutor)", description: "Hội thoại tự do" },
  { id: "grammar_agent", name: "Grammar", icon: "✍️", gradient: "var(--gradient-grammar)", description: "Ngữ pháp" },
  { id: "vocabulary_agent", name: "Vocabulary", icon: "📖", gradient: "var(--gradient-vocab)", description: "Từ vựng" },
  { id: "pronunciation_agent", name: "Pronunciation", icon: "🎤", gradient: "var(--gradient-pronunciation)", description: "Phát âm" },
  { id: "business_agent", name: "Business English", icon: "💼", gradient: "var(--gradient-business)", description: "Tiếng Anh thương mại" },
  { id: "assessment_agent", name: "Assessment", icon: "📊", gradient: "var(--gradient-assessment)", description: "Kiểm tra trình độ" },
];

const QUICK_ACTIONS = [
  { icon: "✍️", label: "Luyện Grammar", message: "Dạy tôi cách dùng Past Perfect" },
  { icon: "📧", label: "Viết Email", message: "Hướng dẫn viết email xin nghỉ phép bằng tiếng Anh" },
  { icon: "📖", label: "Từ vựng IT", message: "Dạy tôi từ vựng tiếng Anh chuyên ngành IT" },
  { icon: "🎤", label: "Phát âm", message: "Hướng dẫn phát âm từ 'development'" },
  { icon: "📊", label: "Test trình độ", message: "Tôi muốn làm bài test đánh giá trình độ tiếng Anh" },
  { icon: "💬", label: "Hội thoại", message: "Let's have a conversation about technology trends" },
];

// ========== Main Component ==========
function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string>("general_tutor");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ===== Chat Functions =====
  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          threadId,
          userProfile: {
            name: "Learner",
            profession: "Software Engineer",
            level: "intermediate",
            goals: ["Improve business English", "Better pronunciation"],
          },
        }),
      });

      const data = await res.json();

      if (data.success) {
        setThreadId(data.data.threadId);
        setActiveAgent(data.data.activeAgent || "general_tutor");

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.data.response,
          agentName: data.data.activeAgent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `❌ Lỗi: ${error instanceof Error ? error.message : "Không thể kết nối server. Hãy chắc chắn backend đang chạy (npm run dev)."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ===== Get current agent info =====
  const getAgentInfo = (agentId: string) =>
    TUTOR_AGENTS.find((a) => a.id === agentId) || TUTOR_AGENTS[0];

  const currentAgent = getAgentInfo(activeAgent);

  // ===== Render =====
  return (
    <div className="app">
      {/* Sidebar — chỉ Tutor Agents */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🎓</div>
          <div>
            <h1>EnglishPro AI</h1>
            <span>Agentic Learning Platform</span>
          </div>
        </div>

        {/* Agent List — chỉ Tutor Agents, không tab */}
        <div className="agent-section-title">Đội ngũ gia sư</div>
        <div className="agent-list">
          {TUTOR_AGENTS.map((agent) => (
            <div
              key={agent.id}
              className={`agent-card ${activeAgent === agent.id ? "active" : ""}`}
              onClick={() => setActiveAgent(agent.id)}
            >
              <div
                className="agent-avatar"
                style={{ background: agent.gradient }}
              >
                {agent.icon}
              </div>
              <div className="agent-info">
                <h3>{agent.name}</h3>
                <p>{agent.description}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content — chỉ Tutor Chat */}
      <main className="main-content">
        {/* Top Bar */}
        <div className="top-bar">
          <div className="top-bar-agent">
            <div
              className="agent-avatar"
              style={{ background: currentAgent.gradient }}
            >
              {currentAgent.icon}
            </div>
            <div>
              <h2>{currentAgent.name}</h2>
              <div className="status">
                <div className="status-dot" />
                Online
              </div>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon">🎓</div>
              <h2>Chào mừng đến EnglishPro AI!</h2>
              <p>
                Nền tảng học tiếng Anh thông minh dành cho người đi làm.
                Chọn một chủ đề để bắt đầu:
              </p>
              <div className="quick-actions">
                {QUICK_ACTIONS.map((qa, i) => (
                  <div
                    key={i}
                    className="quick-action"
                    onClick={() => sendMessage(qa.message)}
                  >
                    <div className="qa-icon">{qa.icon}</div>
                    <div className="qa-label">{qa.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  <div
                    className="message-avatar"
                    style={{
                      background:
                        msg.role === "user"
                          ? "var(--gradient-primary)"
                          : getAgentInfo(msg.agentName || "general_tutor")
                              .gradient,
                    }}
                  >
                    {msg.role === "user"
                      ? "👤"
                      : getAgentInfo(msg.agentName || "general_tutor").icon}
                  </div>
                  <div>
                    {msg.role === "assistant" && msg.agentName && (
                      <div className="message-label">
                        {getAgentInfo(msg.agentName).name}
                      </div>
                    )}
                    <div className="message-bubble">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div
                    className="message-avatar"
                    style={{ background: currentAgent.gradient }}
                  >
                    {currentAgent.icon}
                  </div>
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="chat-input-area">
          <div className="chat-input-container">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn bằng tiếng Anh hoặc tiếng Việt..."
              rows={1}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
            >
              ➤
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export { ChatPage }
