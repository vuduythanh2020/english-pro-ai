import { Router, Request, Response } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { buildTutorGraph } from "../tutor/graph.js";
import { requireFields } from "./middleware.js";
import { logger } from "../utils/logger.js";
import { generateThreadId } from "../utils/helpers.js";

const router = Router();

// Singleton tutor graph instance
let tutorGraph: ReturnType<typeof buildTutorGraph> | null = null;

function getTutorGraph() {
  if (!tutorGraph) {
    tutorGraph = buildTutorGraph();
    logger.info("🎓 Tutor Graph initialized");
  }
  return tutorGraph;
}

/**
 * POST /api/chat
 * Gửi tin nhắn cho tutor AI
 */
router.post("/", requireFields("message"), async (req: Request, res: Response) => {
  try {
    const { message, threadId, userProfile } = req.body;
    const currentThreadId = threadId || generateThreadId();
    const graph = getTutorGraph();

    const config = {
      configurable: { thread_id: currentThreadId },
    };

    const input = {
      messages: [new HumanMessage(message)],
      ...(userProfile && { userProfile }),
    };

    logger.info(`💬 Chat message: "${message.substring(0, 50)}..."`);

    const result = await graph.invoke(input, config);

    // Lấy tin nhắn phản hồi cuối cùng
    const lastMessage = result.messages[result.messages.length - 1];
    const responseContent =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    res.json({
      success: true,
      data: {
        threadId: currentThreadId,
        response: responseContent,
        activeAgent: result.activeAgent,
      },
    });
  } catch (error) {
    logger.error("Chat error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Chat failed",
    });
  }
});

/**
 * POST /api/chat/stream
 * Stream phản hồi từ tutor AI (Server-Sent Events)
 */
router.post("/stream", requireFields("message"), async (req: Request, res: Response) => {
  try {
    const { message, threadId, userProfile } = req.body;
    const currentThreadId = threadId || generateThreadId();
    const graph = getTutorGraph();

    // Setup SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const config = {
      configurable: { thread_id: currentThreadId },
    };

    const input = {
      messages: [new HumanMessage(message)],
      ...(userProfile && { userProfile }),
    };

    // Stream events
    const stream = await graph.stream(input, {
      ...config,
      streamMode: "updates",
    });

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true, threadId: currentThreadId })}\n\n`);
    res.end();
  } catch (error) {
    logger.error("Stream error:", error);
    res.write(
      `data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Stream failed" })}\n\n`
    );
    res.end();
  }
});

export { router as chatRoutes };
