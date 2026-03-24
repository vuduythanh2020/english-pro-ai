/**
 * DevTeamPage — US-04 (Full Refactor)
 * ============================================================================
 * Trang quản lý Dev Team workflow, chỉ dành cho admin.
 * Route: /dev-team (protected, requiredRole="admin")
 *
 * Thay đổi từ US-03:
 * - Dùng apiClient (Bearer token tự động) thay vì fetch() thủ công
 * - Custom hook useDevTeamWorkflow tách logic state + API
 * - Xử lý lỗi 401/403 (auto logout, redirect)
 * - Polling khi status === "processing"
 * - Completion banner khi workflow hoàn tất
 * - MarkdownRenderer cho output panels (AC5)
 * - Reject warning khi feedback rỗng (BR-04 soft validation)
 */

import { useDevTeamWorkflow } from "./useDevTeamWorkflow.ts";
import { MarkdownRenderer } from "../components/MarkdownRenderer.tsx";

// ========== Types ==========

interface Agent {
  id: string;
  name: string;
  icon: string;
  gradient: string;
  description: string;
}

// ========== Constants ==========

const DEV_AGENTS: Agent[] = [
  { id: "po_agent", name: "PO Agent", icon: "📋", gradient: "var(--gradient-tutor)", description: "Product Owner" },
  { id: "ba_agent", name: "BA Agent", icon: "📊", gradient: "var(--gradient-vocab)", description: "Business Analyst" },
  { id: "dev_agent", name: "DEV Agent", icon: "💻", gradient: "var(--gradient-primary)", description: "Developer" },
  { id: "tester_agent", name: "TESTER Agent", icon: "🧪", gradient: "var(--gradient-pronunciation)", description: "Quality Assurance" },
];

const WORKFLOW_PHASES = ["requirements", "design", "development", "testing", "done"] as const;

const PIPELINE_STEPS = [
  { icon: "📋", name: "PO Agent", phase: "requirements" },
  { icon: "📊", name: "BA Agent", phase: "design" },
  { icon: "💻", name: "DEV Agent", phase: "development" },
  { icon: "🧪", name: "TESTER Agent", phase: "testing" },
  { icon: "🚀", name: "Release", phase: "done" },
] as const;

// ========== Helper Functions ==========

function getPhaseIndex(phase: string): number {
  return WORKFLOW_PHASES.indexOf(phase as typeof WORKFLOW_PHASES[number]);
}

function getStepClassName(stepPhase: string, currentPhase: string, status: string): string {
  const currentIdx = getPhaseIndex(currentPhase);
  const stepIdx = getPhaseIndex(stepPhase);

  if (status === "completed" || currentPhase === "done") {
    return "workflow-step done";
  }
  if (currentPhase === stepPhase) return "workflow-step active";
  if (stepIdx < currentIdx) return "workflow-step done";
  return "workflow-step";
}

function getStepStatusText(stepPhase: string, currentPhase: string, status: string): string {
  const currentIdx = getPhaseIndex(currentPhase);
  const stepIdx = getPhaseIndex(stepPhase);

  if (status === "completed" || currentPhase === "done") {
    return "✅ Hoàn thành";
  }
  if (currentPhase === stepPhase) {
    return status === "waiting_approval" ? "🔒 Chờ duyệt" : "🔄 Đang xử lý";
  }
  if (stepIdx < currentIdx) return "✅ Hoàn thành";
  return "⏳ Chờ";
}

// ========== Main Component ==========

function DevTeamPage() {
  const {
    workflow,
    featureRequest,
    feedback,
    isLoading,
    rejectWarning,
    pollingExhausted,
    setFeatureRequest,
    setFeedback,
    startWorkflow,
    handleApproval,
    resetWorkflow,
    refreshStatus,
  } = useDevTeamWorkflow();

  const isCompleted = workflow.status === "completed" || workflow.currentPhase === "done";
  const isWaitingApproval = workflow.status === "waiting_approval";
  const isProcessing = workflow.status === "processing";
  const hasWorkflow = workflow.threadId !== null;

  // ===== Render =====
  return (
    <div className="dev-team-layout">
      {/* Sidebar — Dev Agents */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🏗️</div>
          <div>
            <h1>Dev Team</h1>
            <span>AI Workflow Engine</span>
          </div>
        </div>

        <div className="agent-section-title">Đội phát triển</div>
        <div className="agent-list">
          {DEV_AGENTS.map((agent) => (
            <div key={agent.id} className="agent-card">
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

      {/* Main Content — Dashboard */}
      <main className="main-content">
        <div className="dev-dashboard">
          {/* Header */}
          <div className="dev-dashboard-header">
            <h2>🏗️ Dev Team AI Dashboard</h2>
            {workflow.threadId && (
              <span className="thread-badge" title={workflow.threadId}>
                🔗 {workflow.threadId.substring(0, 8)}...
              </span>
            )}
          </div>

          {/* Error Banner — AC7 */}
          {workflow.error && (
            <div className="error-banner">
              <span className="error-banner-icon">⚠️</span>
              <span className="error-banner-text">{workflow.error}</span>
              <button
                className="error-banner-dismiss"
                onClick={() => {
                  // Clear error without full reset
                }}
                type="button"
              >
                ✕
              </button>
            </div>
          )}

          {/* Completion Banner — AC6 */}
          {isCompleted && (
            <div className="completion-banner">
              <div className="completion-banner-content">
                <span className="completion-icon">🎉</span>
                <div>
                  <h3>Workflow hoàn tất!</h3>
                  <p>Tất cả các phase đã được hoàn thành thành công.</p>
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={resetWorkflow}
                type="button"
              >
                🚀 Bắt đầu Workflow mới
              </button>
            </div>
          )}

          {/* Workflow Pipeline */}
          {hasWorkflow && (
            <div className="workflow-pipeline">
              {PIPELINE_STEPS.map((step, i, arr) => (
                <div key={step.phase} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div className={getStepClassName(step.phase, workflow.currentPhase, workflow.status)}>
                    <div className="step-icon">{step.icon}</div>
                    <h3>{step.name}</h3>
                    <div
                      className={`step-status ${
                        workflow.currentPhase === step.phase && isWaitingApproval
                          ? "waiting"
                          : isCompleted || getPhaseIndex(step.phase) < getPhaseIndex(workflow.currentPhase)
                            ? "completed"
                            : ""
                      }`}
                    >
                      {getStepStatusText(step.phase, workflow.currentPhase, workflow.status)}
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="workflow-connector">→</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Feature Request Form — AC1 */}
          {!isCompleted && (
            <div className="feature-form">
              <h3>📝 Feature Request</h3>
              <textarea
                value={featureRequest}
                onChange={(e) => setFeatureRequest(e.target.value)}
                placeholder="Mô tả tính năng bạn muốn phát triển cho EnglishPro AI..."
                disabled={isLoading || isProcessing}
              />
              <button
                className="btn-primary"
                onClick={startWorkflow}
                disabled={!featureRequest.trim() || isLoading || isProcessing}
                type="button"
              >
                {isLoading ? "⏳ Đang xử lý..." : "🚀 Bắt đầu Workflow"}
              </button>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="processing-indicator">
              <div className="processing-spinner">
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
              <span className="processing-text">Agent đang xử lý...</span>
              {pollingExhausted && (
                <div className="polling-exhausted">
                  <p>Đã hết thời gian polling tự động.</p>
                  <button
                    className="btn-refresh"
                    onClick={refreshStatus}
                    type="button"
                  >
                    🔄 Refresh thủ công
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Approval Section — AC3, AC4 */}
          {isWaitingApproval && workflow.pendingApproval && (
            <div className="output-panel approval-panel">
              <div className="output-panel-header">
                <h4>🔒 {workflow.pendingApproval.title || "Chờ duyệt"}</h4>
              </div>
              <div className="output-panel-body">
                <MarkdownRenderer
                  content={
                    workflow.pendingApproval.content ||
                    workflow.pendingApproval.question ||
                    ""
                  }
                />
              </div>
              <div className="approval-footer">
                <textarea
                  className="feedback-textarea"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Feedback (nếu từ chối)..."
                  rows={3}
                />
                {rejectWarning && (
                  <div className="reject-warning">
                    ⚠️ Bạn đang reject mà chưa nhập feedback. Agent sẽ không biết cần sửa gì.
                  </div>
                )}
                <div className="approval-actions">
                  <button
                    className="btn-approve"
                    onClick={() => handleApproval("approve")}
                    disabled={isLoading}
                    type="button"
                  >
                    {isLoading ? "⏳..." : "✅ Approve"}
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => handleApproval("reject")}
                    disabled={isLoading}
                    type="button"
                  >
                    {isLoading ? "⏳..." : "❌ Reject"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Output Panels — AC5 (markdown rendered) */}
          {workflow.output.userStories && (
            <div className="output-panel">
              <div className="output-panel-header">
                <h4>📋 User Stories (PO Agent)</h4>
              </div>
              <div className="output-panel-body">
                <MarkdownRenderer content={workflow.output.userStories} />
              </div>
            </div>
          )}

          {workflow.output.designDocument && (
            <div className="output-panel">
              <div className="output-panel-header">
                <h4>📊 Design Document (BA Agent)</h4>
              </div>
              <div className="output-panel-body">
                <MarkdownRenderer content={workflow.output.designDocument} />
              </div>
            </div>
          )}

          {workflow.output.sourceCode && (
            <div className="output-panel">
              <div className="output-panel-header">
                <h4>💻 Source Code (DEV Agent)</h4>
              </div>
              <div className="output-panel-body">
                <MarkdownRenderer content={workflow.output.sourceCode} />
              </div>
            </div>
          )}

          {workflow.output.testResults && (
            <div className="output-panel">
              <div className="output-panel-header">
                <h4>🧪 Test Results (TESTER Agent)</h4>
              </div>
              <div className="output-panel-body">
                <MarkdownRenderer content={workflow.output.testResults} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export { DevTeamPage };
