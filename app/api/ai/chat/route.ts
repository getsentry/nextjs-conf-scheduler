import * as Sentry from "@sentry/nextjs";
import { createUIMessageStreamResponse } from "ai";
import { runAgentPipeline } from "@/lib/ai/agents";
import { requireAuth } from "@/lib/auth/dal";

export async function POST(req: Request) {
  const startTime = Date.now();
  const { userId } = await requireAuth();
  const { messages } = await req.json();

  return Sentry.startSpan(
    {
      name: "ai.chat.request",
      op: "ai.pipeline",
      attributes: {
        "ai.pipeline.name": "conference-scheduler",
        "user.id": userId,
      },
    },
    async () => {
      const formattedMessages = messages
        .map((m: { role: string; parts?: Array<{ type: string; text?: string }> }) => ({
          role: m.role as "user" | "assistant",
          content: (m.parts ?? [])
            .filter((p: { type: string }) => p.type === "text")
            .map((p: { text?: string }) => p.text || "")
            .join(""),
        }))
        .filter((m: { content: string }) => m.content.length > 0);

      const result = await runAgentPipeline(formattedMessages, userId);

      Sentry.logger.info("AI chat request processed", {
        user_id: userId,
        message_count: messages.length,
        pipeline: "conference-scheduler",
        duration_ms: Date.now() - startTime,
      });

      return createUIMessageStreamResponse({
        stream: result.toUIMessageStream(),
      });
    },
  );
}
