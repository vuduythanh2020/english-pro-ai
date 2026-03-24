import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config/env.js";
import { initializeDatabase } from "./config/database.config.js";
import { chatRoutes } from "./api/chat.routes.js";
import { devTeamRoutes } from "./api/dev-team.routes.js";
import { authRoutes } from "./api/auth/auth.routes.js";
import { authMiddleware, requireRole, errorHandler, requestLogger } from "./api/middleware.js";
import { logger } from "./utils/logger.js";

// Validate config
validateConfig();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

// Public routes — KHÔNG yêu cầu auth
app.use("/api/auth", authRoutes);

// Health check — public
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "EnglishPro AI",
    timestamp: new Date().toISOString(),
  });
});

// Protected routes — yêu cầu JWT auth
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/dev-team", authMiddleware, requireRole("admin"), devTeamRoutes);

// Error handler
app.use(errorHandler);

// Start server with database initialization
async function startServer(): Promise<void> {
  try {
    // Khởi tạo database: test kết nối và chạy migrations
    await initializeDatabase();
    logger.info("✅ Database initialized successfully.");
  } catch (error) {
    // Database không bắt buộc cho toàn bộ tính năng
    // Server vẫn khởi động nhưng audit log sẽ không hoạt động
    logger.warn("⚠️ Database initialization failed. Audit logging will be disabled.", error);
  }

  app.listen(config.server.port, () => {
    logger.info(`
  ╔══════════════════════════════════════════════╗
  ║         🎓 EnglishPro AI Server             ║
  ║──────────────────────────────────────────────║
  ║  Port:     ${String(config.server.port).padEnd(33)}║
  ║  Env:      ${config.server.env.padEnd(33)}║
  ║  Model:    ${config.openai.model.padEnd(33)}║
  ║──────────────────────────────────────────────║
  ║  API Endpoints:                              ║
  ║  POST /api/chat          - Chat (auth req)   ║
  ║  POST /api/chat/stream   - Stream (auth req) ║
  ║  POST /api/dev-team/start   - Start (admin)  ║
  ║  POST /api/dev-team/approve - Approve (admin) ║
  ║  GET  /api/dev-team/status/:id - Status(admin)║
  ║  POST /api/auth/register - Register account  ║
  ║  POST /api/auth/login    - Login with JWT    ║
  ║  GET  /api/health        - Health check      ║
  ╚══════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;
