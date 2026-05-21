import { anthropic } from "@ai-sdk/anthropic";
import * as Sentry from "@sentry/nextjs";
import { generateText, stepCountIs, streamText } from "ai";
import { checkConflicts, getTalkDetails, getTracks, getUserSchedule, searchTalks } from "./tools";

export const AGENTS = {
  router: {
    model: anthropic("claude-haiku-4-5-20251001"),
  },
  search: {
    model: anthropic("claude-sonnet-4-5-20250929"),
  },
  info: {
    model: anthropic("claude-haiku-4-5-20251001"),
  },
} as const;

type AgentType = "search" | "info";

const routerSystemPrompt = `You are a routing agent for a conference schedule assistant.
Analyze the user's message and determine which specialized agent should handle it.

Choose "search" for:
- Searching for talks by topic, speaker, or keywords
- Getting recommendations based on interests
- Finding workshops, keynotes, or specific talk formats
- Checking for schedule conflicts
- Complex queries requiring reasoning about talks

Choose "info" for:
- Listing available tracks
- Viewing the user's current schedule
- Simple factual questions about the conference

Respond with ONLY the agent name: "search" or "info"`;

const searchAgentSystemPrompt = `You are a search specialist for Next.js Conf 2025.
Your job is to find relevant talks and make recommendations.

The conference is on October 22, 2025 in San Francisco. It's a single-day event.

Available tracks:
- AI & Agents (id: ai): Build intelligent applications with AI agents and machine learning
- Performance (id: perf): Optimize your applications for speed and efficiency
- Full Stack (id: fullstack): End-to-end application development patterns
- Developer Experience (id: dx): Tools and patterns for better developer productivity
- Platform (id: platform): Infrastructure, deployment, and platform features

When helping users:
1. Use searchTalks once or twice to find relevant sessions — use the trackId filter to narrow results instead of running many broad searches
2. Use getTalkDetails only if the user asks about a specific talk
3. ALWAYS use checkConflicts with the IDs of talks you plan to recommend — users need to know if sessions overlap
4. After searching and checking conflicts, summarize your recommendations immediately — do not keep searching

The tool results for searchTalks are rendered as interactive talk cards that users can add to their schedule. So after calling searchTalks, just explain your recommendations — the user can see and interact with the talk cards directly.

Be concise but helpful.`;

const infoAgentSystemPrompt = `You are an info assistant for Next.js Conf 2025.
Your job is to provide quick information about tracks and the user's schedule.

Available tracks:
- AI & Agents (id: ai)
- Performance (id: perf)
- Full Stack (id: fullstack)
- Developer Experience (id: dx)
- Platform (id: platform)

Use the tools to fetch the requested information and present it clearly.`;

export async function routeRequest(userMessage: string): Promise<AgentType> {
  return Sentry.startSpan(
    {
      name: "ai.agent.router",
      op: "ai.pipeline",
      attributes: {
        "ai.pipeline.name": "router",
        "ai.model.id": "claude-haiku-4-5-20251001",
      },
    },
    async () => {
      const { text } = await generateText({
        model: AGENTS.router.model,
        system: routerSystemPrompt,
        prompt: userMessage,
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      });

      const agent = text.trim().toLowerCase() as AgentType;

      Sentry.setContext("ai.routing", {
        selectedAgent: agent,
        userMessage: userMessage.slice(0, 100),
      });

      return agent === "info" ? "info" : "search";
    },
  );
}

export async function executeSearchAgent(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userId: string,
) {
  return Sentry.startSpan(
    {
      name: "ai.agent.search",
      op: "ai.pipeline",
      attributes: {
        "ai.pipeline.name": "search-agent",
        "ai.model.id": "claude-sonnet-4-5-20250929",
      },
    },
    async () => {
      const result = streamText({
        model: AGENTS.search.model,
        system: searchAgentSystemPrompt,
        messages,
        tools: { searchTalks, getTalkDetails, checkConflicts },
        stopWhen: stepCountIs(10),
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      });

      return result;
    },
  );
}

export async function executeInfoAgent(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userId: string,
) {
  return Sentry.startSpan(
    {
      name: "ai.agent.info",
      op: "ai.pipeline",
      attributes: {
        "ai.pipeline.name": "info-agent",
        "ai.model.id": "claude-haiku-4-5-20251001",
      },
    },
    async () => {
      const result = streamText({
        model: AGENTS.info.model,
        system: infoAgentSystemPrompt,
        messages,
        tools: { getTracks, getUserSchedule: getUserSchedule(userId) },
        stopWhen: stepCountIs(5),
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      });

      return result;
    },
  );
}

export async function runAgentPipeline(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userId: string,
) {
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();

  if (!lastUserMessage) {
    throw new Error("No user message found");
  }

  const targetAgent = await routeRequest(lastUserMessage.content);

  if (targetAgent === "info") {
    return executeInfoAgent(messages, userId);
  } else {
    return executeSearchAgent(messages, userId);
  }
}
