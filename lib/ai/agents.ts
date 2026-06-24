import * as Sentry from "@sentry/nextjs";
import {
  type LanguageModelUsage,
  type ModelMessage,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
} from "ai";
import { getModelConfig } from "./models";
import { getGatewayProviderOptions, getLanguageModel } from "./providers";
import {
  checkConflicts,
  createSearchTalksTool,
  getTalkDetails,
  getTracks,
  getUserSchedule,
} from "./tools";
import {
  type AiIdentity,
  aiLogFields,
  aiMetricAttributes,
  aiMetricOwner,
  aiTier,
  recordAiTokenUsage,
} from "./usage";

type PageContext = {
  path: string;
  query?: string;
  title?: string;
};

type AgentContext = {
  identity: AiIdentity;
  quota: {
    id: string;
    limit: number;
    remaining: number;
  };
  conversationId?: string | null;
  pageContext?: PageContext;
  selectedModelId?: string;
};

const MODEL_COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.05, output: 0.2 },
  "deepseek/deepseek-v3.2": { input: 0.27, output: 1.1 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
  "alibaba/qwen-3-235b": { input: 0.2, output: 0.8 },
  "mistral/devstral-2": { input: 0.4, output: 2 },
  "meta/llama-4-maverick": { input: 0.18, output: 0.6 },
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
  "anthropic/claude-opus-4.8": { input: 15, output: 75 },
};

function estimateCostUsd(modelId: string, usage: LanguageModelUsage) {
  const price = MODEL_COST_PER_MILLION_TOKENS[modelId];
  if (!price) return 0;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

const scheduleAgentInstructions = `You are the AI Engineer World's Fair 2026 schedule assistant.
The conference runs June 29 – July 2, 2026 at Moscone West in San Francisco.

Help users find sessions, understand tracks, compare options, and build a practical schedule.

Use tools when useful:
- searchTalks: find sessions by topic, speaker, company, track, format, level, or semantic intent.
- getTalkDetails: inspect a specific session.
- getTracks: list or disambiguate program tracks.
- checkConflicts: check concrete session recommendations before telling the user to add them.
- getUserSchedule: only available for signed-in users; use it for questions about their saved schedule.

Guidelines:
- Be concise.
- For recommendations, return a short rationale and let rendered session cards carry details.
- After searchTalks returns sessions, do not repeat titles, times, speakers, or descriptions in prose; give at most a one-sentence summary or grouping.
- If recommending specific sessions, call checkConflicts with those session IDs.
- If the user is not signed in and asks about saved sessions, tell them to sign in to save sessions.
- Do not mention internal routes unless useful.`;

function withPageContext(instructions: string, context: AgentContext) {
  if (!context.pageContext) {
    return instructions;
  }

  const { path, query, title } = context.pageContext;
  const currentPage = [
    `Path: ${path}`,
    query ? `Query: ${query}` : null,
    title ? `Title: ${title}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${instructions}\n\nCurrent user page context:\n${currentPage}\n\nUse this context when interpreting pronouns like "this talk", "these filters", "this day", or "what should I add next".`;
}

function telemetry(context: AgentContext, config: { id: string }) {
  return {
    isEnabled: true,
    functionId: "conference-scheduler.schedule",
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      agent: "schedule",
      model_id: config.id,
      ai_tier: aiTier(context.identity),
      identity_type: context.identity.type,
      ...(context.identity.type === "user" ? { identity_id: context.identity.id } : {}),
      quota_limit: context.quota.limit,
      quota_remaining: context.quota.remaining,
      ...(context.selectedModelId ? { selected_model_id: context.selectedModelId } : {}),
      ...(context.conversationId ? { conversation_id: context.conversationId } : {}),
    },
  };
}

async function recordUsage(context: AgentContext, modelId: string, usage: LanguageModelUsage) {
  const tokenUsage = await recordAiTokenUsage(context.quota.id, usage, context.identity);

  const attributes = {
    agent: "schedule",
    model_id: modelId,
    ...aiMetricAttributes(context.identity),
  };

  Sentry.metrics.distribution("ai.tokens.total", tokenUsage.totalTokens, {
    unit: "token",
    attributes,
  });
  Sentry.metrics.distribution("ai.tokens.input", tokenUsage.inputTokens, {
    unit: "token",
    attributes,
  });
  Sentry.metrics.distribution("ai.tokens.output", tokenUsage.outputTokens, {
    unit: "token",
    attributes,
  });

  const estimatedCostUsd = estimateCostUsd(modelId, usage);
  if (estimatedCostUsd > 0) {
    Sentry.metrics.distribution("ai.cost.estimated_usd", estimatedCostUsd, {
      attributes: {
        ...attributes,
        metric_owner: aiMetricOwner(context.identity),
      },
    });
  }

  Sentry.logger.info("AI model usage recorded", {
    action: "ai.usage",
    result: "success",
    agent: "schedule",
    model_id: modelId,
    ...aiLogFields(context.identity),
    quota_id: context.quota.id,
    input_tokens: tokenUsage.inputTokens,
    output_tokens: tokenUsage.outputTokens,
    total_tokens: tokenUsage.totalTokens,
    estimated_cost_usd: estimatedCostUsd,
  });
}

function createScheduleTools(context: AgentContext): ToolSet {
  const tools: ToolSet = {
    checkConflicts,
    getTalkDetails,
    getTracks,
    searchTalks: createSearchTalksTool({ identity: context.identity }),
  };

  if (context.identity.type === "user") {
    tools.getUserSchedule = getUserSchedule(context.identity.id);
  }

  return tools;
}

function createScheduleAgent(context: AgentContext) {
  const config = getModelConfig(context.identity.accessTier, context.selectedModelId);

  return {
    agent: new ToolLoopAgent({
      id: "conference-scheduler",
      model: getLanguageModel(config),
      instructions: withPageContext(scheduleAgentInstructions, context),
      tools: createScheduleTools(context),
      stopWhen: stepCountIs(10),
      providerOptions: getGatewayProviderOptions(
        config,
        context.identity.id,
        context.identity.accessTier,
      ),
      experimental_telemetry: telemetry(context, config),
      onFinish: async ({ totalUsage }) => {
        await recordUsage(context, config.id, totalUsage);
      },
    }),
  };
}

export async function runAgentPipeline(messages: ModelMessage[], context: AgentContext) {
  const { agent } = createScheduleAgent(context);

  return agent.stream({ messages });
}
