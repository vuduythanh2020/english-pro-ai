import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config/env.js";
import { chatRoutes } from "./api/chat.routes.js";
import { devTeamRoutes } from "./api/dev-team.routes.js";
import { errorHandler, requestLogger } from "./api/middleware.js";
import { logger } from "./utils/logger.js";

// Validate config
validateConfig();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

// Routes
app.use("/api/chat", chatRoutes);
app.use("/api/dev-team", devTeamRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "EnglishPro AI",
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use(errorHandler);

// Start server
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
  ║  POST /api/chat          - Chat with tutor   ║
  ║  POST /api/chat/stream   - Stream chat       ║
  ║  POST /api/dev-team/start   - Start workflow ║
  ║  POST /api/dev-team/approve - Approve/Reject ║
  ║  GET  /api/dev-team/status/:id - Status      ║
  ║  GET  /api/health        - Health check      ║
  ╚══════════════════════════════════════════════╝
  `);
});

export default app;
