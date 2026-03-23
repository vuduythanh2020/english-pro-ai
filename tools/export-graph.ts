import { buildDevTeamGraph } from "../src/dev-team/graph.js";
import * as fs from "fs";

async function exportGraph() {
  console.log("🔄 Đang biên dịch LangGraph...");
  const graph = buildDevTeamGraph();
  
  console.log("🎨 Đang xuất mã Mermaid...");
  const mermaidCode = graph.getGraph().drawMermaid();
  
  const markdownContent = `
# Lưu đồ hoạt động của đội AI Dev Team

Sơ đồ này được sinh ra tự động từ code \`src/dev-team/graph.ts\`.

\`\`\`mermaid
${mermaidCode}
\`\`\`
  `.trim();
  
  fs.writeFileSync("DevTeam_Workflow.md", markdownContent);
  
  console.log("✅ Đã xuất sơ đồ luồng hệ thống ra file: DevTeam_Workflow.md");
}

exportGraph().catch(error => {
  console.error("❌ Export failed:", error);
});
