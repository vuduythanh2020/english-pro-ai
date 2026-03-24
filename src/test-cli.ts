import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { buildDevTeamGraph } from "./dev-team/graph.js";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { validateConfig } from "./config/env.js";
import { initializeDatabase } from "./config/database.config.js";
import { logger } from "./utils/logger.js";

// Validate cấu hình (API Keys)
validateConfig();



const rl = readline.createInterface({ input, output });

async function runTest() {
  console.log("\n🤖 ==========================================");
  console.log("  DEV TEAM WORKFLOW CLI TESTER");
  console.log("==========================================🤖\n");

  // Khởi tạo database: test kết nối + chạy migrations
  // Nếu DB không có → workflow vẫn chạy bình thường (graceful degradation)
  try {
    await initializeDatabase();
    console.log("✅ Database initialized — workflow tracking enabled.\n");
  } catch (error) {
    console.warn("⚠️ Database not available — workflow tracking disabled (graceful degradation).\n");
  }

  const graph = buildDevTeamGraph();
  const threadId = "cli-thread-" + Date.now();
  const runConfig = { configurable: { thread_id: threadId }, recursionLimit: 150 };

  const featureRequest = await rl.question("📝 Vui lòng nhập Feature Request (Yêu cầu tính năng):\n> ");

  console.log("\n⏳ Hệ thống đang khởi tạo workflow và gọi PO Agent...\n(xin đợi vài giây để LLM phản hồi)\n");

  // FIX: Truyền threadId vào state để injectProjectContext có thể tạo workflow_runs record
  let result = await graph.invoke(
    {
      featureRequest,
      threadId,
      messages: [new HumanMessage(featureRequest)],
    },
    runConfig
  );

  // Vòng lặp kiểm tra state và hỏi duyệt
  while (true) {
    const state = await graph.getState(runConfig);

    // Nếu không còn node nào tiếp theo (đã chạy xong)
    if (!state.next || state.next.length === 0) {
      console.log("\n🎉 HOÀN TẤT! Toàn bộ quy trình đã xong.");
      break;
    }

    // Kiểm tra xem có đang bị chặn bởi interrupt (chờ human duyệt) không
    const tasks = state.tasks || [];
    const pendingInterrupt = tasks[0]?.interrupts?.[0];

    if (pendingInterrupt) {
      const interruptData = pendingInterrupt.value as any;

      console.log(`\n==============================================`);
      console.log(`🔒 YÊU CẦU PHÊ DUYỆT: \x1b[36m${interruptData.title}\x1b[0m`);
      console.log(`==============================================`);
      console.log(`\n\x1b[33m[NỘI DUNG TỪ AGENT]=\x1b[0m\n${interruptData.content}\n`);
      console.log(`\x1b[32m[CÂU HỎI]=\x1b[0m ${interruptData.question}\n`);

      const actionInput = await rl.question("Bạn chọn: (1) Approve  (2) Reject  (3) Revise (quay lại bước trước)\n> ");
      const action = actionInput.trim() === "1" ? "approve" : actionInput.trim() === "3" ? "revise" : "reject";

      let feedback = "";
      if (action === "reject") {
        feedback = await rl.question("Nhập lý do từ chối (Feedback để Agent sửa):\n> ");
      } else {
        feedback = await rl.question("Nhập comment thêm (nhấn Enter để bỏ qua):\n> ");
      }

      console.log(`\n🔄 Đang gửi quyết định [${action.toUpperCase()}] cho hệ thống...\n(xin đợi LLM xử lý)\n`);

      // Tiếp tục workflow bằng cách gửi Command
      result = await graph.invoke(
        new Command({
          resume: { action, feedback },
        }),
        runConfig
      );
    } else {
      console.log("\n⚠️ Workflow đang tạm dừng nhưng không phải chờ duyệt.");
      break;
    }
  }

  console.log("\n📦 FULL STATE CUỐI CÙNG:");
  console.log("Phase cuối   :", result.currentPhase);
  console.log("User Stories :", result.userStories ? "Có" : "Không");
  console.log("Design Doc   :", result.designDocument ? "Có" : "Không");
  console.log("Source Code  :", result.sourceCode ? "Có" : "Không");
  console.log("Test Results :", result.testResults ? "Có" : "Không");
  console.log("\n=======================================================");
  if (result.workflowSummary) {
    console.log("📄 BÁO CÁO TỔNG KẾT WORKFLOW\n");
    console.log(result.workflowSummary);
  } else {
    console.log("⚠️ KHÔNG CÓ BÁO CÁO TỔNG KẾT");
  }
  console.log("=======================================================\n");

  rl.close();
}

runTest().catch((err) => {
  console.error("Lỗi hệ thống:", err);
  rl.close();
});
