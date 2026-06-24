import * as Sentry from "@sentry/nextjs";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { runAgentPipeline } from "@/lib/ai/agents";
import { getAiIdentity } from "@/lib/ai/identity";
import { getModelOption } from "@/lib/ai/models";
import { aiLogFields, aiMetricAttributes, aiTier, checkAndIncrementAiQuota } from "@/lib/ai/usage";

type PageContext = {
  path: string;
  query?: string;
  title?: string;
};

function normalizePageContext(context: unknown): PageContext | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }

  const raw = context as Record<string, unknown>;
  if (typeof raw.path !== "string" || !raw.path.startsWith("/")) {
    return undefined;
  }

  return {
    path: raw.path.slice(0, 160),
    ...(typeof raw.query === "string" && raw.query ? { query: raw.query.slice(0, 240) } : {}),
    ...(typeof raw.title === "string" && raw.title ? { title: raw.title.slice(0, 160) } : {}),
  };
}

function getUiMessages(messages: unknown): UIMessage[] {
  return Array.isArray(messages) ? (messages as UIMessage[]) : [];
}

function streamErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An error occurred";
}

export async function POST(req: Request) {
  const startTime = Date.now();
  const conversationId = req.headers.get("x-conversation-id");
  const identity = await getAiIdentity();

  Sentry.setUser({ id: identity.id, segment: aiTier(identity) });
  Sentry.setTag("ai.tier", aiTier(identity));
  Sentry.setTag("ai.identity_type", identity.type);

  if (conversationId) {
    Sentry.setConversationId(conversationId);
  }

  try {
    const body = (await req.json()) as { messages?: unknown; context?: unknown; model?: unknown };
    const uiMessages = getUiMessages(body.messages);
    const pageContext = normalizePageContext(body.context);
    const selectedModel = getModelOption(
      identity.accessTier,
      typeof body.model === "string" ? body.model : undefined,
    );

    if (uiMessages.length === 0 || uiMessages.at(-1)?.role !== "user") {
      return Response.json({ error: "Expected at least one user message" }, { status: 400 });
    }

    let formattedMessages: ModelMessage[];
    try {
      formattedMessages = await convertToModelMessages(uiMessages);
    } catch {
      return Response.json({ error: "Invalid chat messages" }, { status: 400 });
    }

    const quotaResult = await checkAndIncrementAiQuota(identity);
    const requestAttributes = aiMetricAttributes(identity);

    if (!quotaResult.allowed) {
      Sentry.metrics.count("ai.chat.requests", 1, {
        attributes: { ...requestAttributes, outcome: "rate_limited" },
      });

      Sentry.logger.info("AI chat request rate limited", {
        action: "ai.chat",
        result: "rate_limited",
        ...aiLogFields(identity),
        conversation_id: conversationId,
        quota_limit: quotaResult.quota.limit,
        quota_used: quotaResult.quota.used,
        retry_after_seconds: quotaResult.retryAfterSeconds,
        duration_ms: Date.now() - startTime,
      });

      return Response.json(
        {
          error: "AI chat daily quota exceeded",
          quota: quotaResult.quota,
          retryAfterSeconds: quotaResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(quotaResult.retryAfterSeconds) },
        },
      );
    }

    Sentry.metrics.count("ai.chat.requests", 1, {
      attributes: { ...requestAttributes, outcome: "allowed" },
    });
    Sentry.metrics.gauge("ai.quota.used", quotaResult.quota.used, {
      attributes: requestAttributes,
    });

    const result = await runAgentPipeline(formattedMessages, {
      identity,
      quota: quotaResult.quota,
      conversationId,
      pageContext,
      selectedModelId: selectedModel?.id,
    });

    Sentry.logger.info("AI chat request completed", {
      action: "ai.chat",
      result: "success",
      ...aiLogFields(identity),
      conversation_id: conversationId,
      message_count: uiMessages.length,
      quota_limit: quotaResult.quota.limit,
      quota_remaining: quotaResult.quota.remaining,
      selected_model_id: selectedModel?.id,
      duration_ms: Date.now() - startTime,
    });

    return createUIMessageStreamResponse({
      stream: result.toUIMessageStream({
        onError: streamErrorMessage,
        messageMetadata: ({ part }) => {
          if (part.type !== "finish") {
            return undefined;
          }

          return {
            usage: {
              inputTokens: part.totalUsage.inputTokens ?? 0,
              outputTokens: part.totalUsage.outputTokens ?? 0,
              totalTokens: part.totalUsage.totalTokens ?? 0,
            },
          };
        },
      }),
    });
  } catch (error) {
    Sentry.captureException(error);
    Sentry.metrics.count("ai.chat.requests", 1, {
      attributes: {
        ...aiMetricAttributes(identity),
        outcome: "error",
      },
    });
    Sentry.logger.error("AI chat request failed", {
      action: "ai.chat",
      result: "error",
      ...aiLogFields(identity),
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    });

    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
