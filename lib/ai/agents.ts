import * as Sentry from "@sentry/nextjs";
import {
  type LanguageModelUsage,
  type ModelMessage,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
} from "ai";
import { conferenceConfig, conferenceVenueLabel } from "@/lib/conference-config";
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

const defaultScheduleAgentInstructions = `You are the ${conferenceConfig.name} schedule assistant.
The conference runs ${conferenceConfig.dates} at ${conferenceVenueLabel()}.

Help users find sessions, understand tracks, compare options, and build a practical schedule.

Use tools when useful:
- searchTalks: find sessions by topic, speaker, company, track, format, level, or semantic intent.
- getTalkDetails: inspect one specific session by ID.
- getTracks: list or disambiguate program tracks.
- checkConflicts: check concrete session recommendations before telling the user to add them.
- getUserSchedule: only available for signed-in users; use it for questions about their saved schedule.

Guidelines:
- Be concise.
- For recommendations, return a short rationale and let rendered session cards carry details.
- After searchTalks returns sessions, do not repeat titles, times, speakers, or descriptions in prose; give at most a one-sentence summary or grouping.
- For questions like "what am I missing from my schedule?", call getUserSchedule first, then use searchTalks with maxResults between 8 and 12 to find candidate sessions across the missing days/topics. Do not call getTalkDetails unless the user asks about one specific session.
- If recommending specific sessions, call checkConflicts with those session IDs.
- If the user is not signed in and asks about saved sessions, tell them to sign in to save sessions.
- Do not mention internal routes unless useful.`;

const scheduleAgentInstructions =
  process.env.CONFERENCE_ASSISTANT_CONTEXT ?? defaultScheduleAgentInstructions;

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

  return `${instructions}\n\nCurrent user page context:\n${currentPage}\n\nUse this context when interpreting pronouns like "this talk", "these filters", "this day", or "what should I add next". For broad schedule audits, treat page context as a hint only; still use searchTalks to inspect multiple candidate sessions.`;
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
      ...(context.identity.type === "user" && context.identity.email
        ? { user_email: context.identity.email.toLowerCase() }
        : {}),
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
