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

interface WorkflowState {
  threadId: string | null;
  currentPhase: string;
  status: string;
  pendingApproval: any;
  output: {
    userStories: string | null;
    designDocument: string | null;
    sourceCode: string | null;
    testResults: string | null;
  };
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

const DEV_AGENTS: Agent[] = [
  { id: "po_agent", name: "PO Agent", icon: "📋", gradient: "var(--gradient-tutor)", description: "Product Owner" },
  { id: "ba_agent", name: "BA Agent", icon: "📊", gradient: "var(--gradient-vocab)", description: "Business Analyst" },
  { id: "dev_agent", name: "DEV Agent", icon: "💻", gradient: "var(--gradient-primary)", description: "Developer" },
  { id: "tester_agent", name: "TESTER Agent", icon: "🧪", gradient: "var(--gradient-pronunciation)", description: "Quality Assurance" },
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
  const [activeTab, setActiveTab] = useState<"tutor" | "devteam">("tutor");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string>("general_tutor");

  // Dev Team state
  const [workflow, setWorkflow] = useState<WorkflowState>({
    threadId: null,
    currentPhase: "",
    status: "idle",
    pendingApproval: null,
    output: { userStories: null, designDocument: null, sourceCode: null, testResults: null },
  });
  const [featureRequest, setFeatureRequest] = useState("");
  const [feedback, setFeedback] = useState("");
  const [devLoading, setDevLoading] = useState(false);

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

  // ===== Dev Team Functions =====
  const startWorkflow = async () => {
    if (!featureRequest.trim() || devLoading) return;
    setDevLoading(true);

    try {
      const res = await fetch(`${API_URL}/dev-team/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureRequest }),
      });
      const data = await res.json();

      if (data.success) {
        setWorkflow({
          threadId: data.data.threadId,
          currentPhase: data.data.currentPhase,
          status: data.data.status,
          pendingApproval: data.data.pendingApproval,
          output: data.data.output,
        });
      }
    } catch (error) {
      console.error("Workflow error:", error);
    } finally {
      setDevLoading(false);
    }
  };

  const handleApproval = async (action: "approve" | "reject") => {
    if (!workflow.threadId || devLoading) return;
    setDevLoading(true);

    try {
      const res = await fetch(`${API_URL}/dev-team/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: workflow.threadId,
          action,
          feedback: action === "reject" ? feedback : "",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setWorkflow({
          threadId: data.data.threadId,
          currentPhase: data.data.currentPhase,
          status: data.data.status,
          pendingApproval: data.data.pendingApproval,
          output: data.data.output,
        });
        setFeedback("");
      }
    } catch (error) {
      console.error("Approval error:", error);
    } finally {
      setDevLoading(false);
    }
  };

  // ===== Get current agent info =====
  const getAgentInfo = (agentId: string) =>
    TUTOR_AGENTS.find((a) => a.id === agentId) || TUTOR_AGENTS[0];

  const currentAgent = getAgentInfo(activeAgent);

  // ===== Render =====
  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🎓</div>
          <div>
            <h1>EnglishPro AI</h1>
            <span>Agentic Learning Platform</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === "tutor" ? "active" : ""}`}
            onClick={() => setActiveTab("tutor")}
          >
            🎓 Gia sư AI
          </button>
          <button
            className={`tab-btn ${activeTab === "devteam" ? "active" : ""}`}
            onClick={() => setActiveTab("devteam")}
          >
            🏗️ Dev Team
          </button>
        </div>

        {/* Agent List */}
        <div className="agent-section-title">
          {activeTab === "tutor" ? "Đội ngũ gia sư" : "Đội phát triển"}
        </div>
        <div className="agent-list">
          {(activeTab === "tutor" ? TUTOR_AGENTS : DEV_AGENTS).map((agent) => (
            <div
              key={agent.id}
              className={`agent-card ${activeAgent === agent.id ? "active" : ""}`}
              onClick={() => activeTab === "tutor" && setActiveAgent(agent.id)}
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

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "tutor" ? (
          <>
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
          </>
        ) : (
          /* Dev Team Dashboard */
          <div className="dev-dashboard">
            <h2>🏗️ Dev Team AI Dashboard</h2>

            {/* Workflow Pipeline */}
            {workflow.threadId && (
              <div className="workflow-pipeline">
                {[
                  { icon: "📋", name: "PO Agent", phase: "requirements" },
                  { icon: "📊", name: "BA Agent", phase: "design" },
                  { icon: "💻", name: "DEV Agent", phase: "development" },
                  { icon: "🧪", name: "TESTER Agent", phase: "testing" },
                  { icon: "🚀", name: "Release", phase: "done" },
                ].map((step, i, arr) => (
                  <div key={step.phase} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      className={`workflow-step ${
                        workflow.currentPhase === step.phase
                          ? "active"
                          : ["requirements", "design", "development", "testing", "done"]
                              .indexOf(step.phase) <
                            ["requirements", "design", "development", "testing", "done"]
                              .indexOf(workflow.currentPhase)
                          ? "done"
                          : ""
                      }`}
                    >
                      <div className="step-icon">{step.icon}</div>
                      <h3>{step.name}</h3>
                      <div
                        className={`step-status ${
                          workflow.currentPhase === step.phase ? "waiting" : ""
                        }`}
                      >
                        {workflow.currentPhase === step.phase
                          ? "🔄 Đang xử lý"
                          : ["requirements", "design", "development", "testing", "done"]
                              .indexOf(step.phase) <
                            ["requirements", "design", "development", "testing", "done"]
                              .indexOf(workflow.currentPhase)
                          ? "✅ Hoàn thành"
                          : "⏳ Chờ"}
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="workflow-connector">→</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Feature Request Form */}
            <div className="feature-form">
              <h3>📝 Feature Request</h3>
              <textarea
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                placeholder="Mô tả tính năng bạn muốn phát triển cho EnglishPro AI..."
              />
              <button
                className="btn-primary"
                onClick={startWorkflow}
                disabled={!featureRequest.trim() || devLoading}
              >
                {devLoading ? "⏳ Đang xử lý..." : "🚀 Bắt đầu Workflow"}
              </button>
            </div>

            {/* Approval Section */}
            {workflow.pendingApproval && (
              <div className="output-panel">
                <div className="output-panel-header">
                  <h4>🔒 {workflow.pendingApproval.title || "Chờ duyệt"}</h4>
                </div>
                <div className="output-panel-body">
                  {workflow.pendingApproval.content || workflow.pendingApproval.question}
                </div>
                <div style={{ padding: "0 18px 18px" }}>
                  <input
                    className="feedback-input"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback (nếu từ chối)..."
                  />
                  <div className="approval-actions">
                    <button className="btn-approve" onClick={() => handleApproval("approve")}>
                      ✅ Approve
                    </button>
                    <button className="btn-reject" onClick={() => handleApproval("reject")}>
                      ❌ Reject
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Output Panels */}
            {workflow.output.userStories && (
              <div className="output-panel">
                <div className="output-panel-header">
                  <h4>📋 User Stories (PO Agent)</h4>
                </div>
                <div className="output-panel-body">{workflow.output.userStories}</div>
              </div>
            )}
            {workflow.output.designDocument && (
              <div className="output-panel">
                <div className="output-panel-header">
                  <h4>📊 Design Document (BA Agent)</h4>
                </div>
                <div className="output-panel-body">{workflow.output.designDocument}</div>
              </div>
            )}
            {workflow.output.sourceCode && (
              <div className="output-panel">
                <div className="output-panel-header">
                  <h4>💻 Source Code (DEV Agent)</h4>
                </div>
                <div className="output-panel-body">{workflow.output.sourceCode}</div>
              </div>
            )}
            {workflow.output.testResults && (
              <div className="output-panel">
                <div className="output-panel-header">
                  <h4>🧪 Test Results (TESTER Agent)</h4>
                </div>
                <div className="output-panel-body">{workflow.output.testResults}</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export { ChatPage }
