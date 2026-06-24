export type AiAccessTier = "guest" | "authenticated";

export type AiModelConfig = {
  id: string;
  name: string;
  provider: string;
  gatewayOrder?: string[];
};

export type AiModelOption = AiModelConfig & {
  contextWindow: number;
  description: string;
};

const OPEN_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    contextWindow: 131_072,
    description: "Strong open model",
    gatewayOrder: ["fireworks", "bedrock"],
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    contextWindow: 128_000,
    description: "Strong open general model",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "deepseek",
    contextWindow: 128_000,
    description: "Open reasoning model",
  },
  {
    id: "alibaba/qwen-3-235b",
    name: "Qwen3 235B",
    provider: "alibaba",
    contextWindow: 262_144,
    description: "Large open model",
  },
  {
    id: "mistral/devstral-2",
    name: "Mistral Devstral 2",
    provider: "mistral",
    contextWindow: 256_000,
    description: "Open Mistral model",
  },
  {
    id: "meta/llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "meta",
    contextWindow: 128_000,
    description: "Meta open model",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "openai",
    contextWindow: 131_072,
    description: "Fast open model",
    gatewayOrder: ["groq", "bedrock"],
  },
];

const FRONTIER_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    contextWindow: 200_000,
    description: "Best default",
    gatewayOrder: ["anthropic", "bedrock"],
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    contextWindow: 200_000,
    description: "Fast answers",
    gatewayOrder: ["anthropic", "bedrock"],
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    contextWindow: 200_000,
    description: "Deep planning",
    gatewayOrder: ["anthropic", "bedrock"],
  },
];

export const MODEL_OPTIONS: Record<AiAccessTier, AiModelOption[]> = {
  guest: OPEN_MODEL_OPTIONS,
  authenticated: [...FRONTIER_MODEL_OPTIONS, ...OPEN_MODEL_OPTIONS],
};

export function getSelectableModels(accessTier: AiAccessTier) {
  return MODEL_OPTIONS[accessTier];
}

export function getModelOption(accessTier: AiAccessTier, modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  return MODEL_OPTIONS[accessTier].find((model) => model.id === modelId);
}

export function getModelConfig(accessTier: AiAccessTier, selectedModelId?: string) {
  return getModelOption(accessTier, selectedModelId) ?? MODEL_OPTIONS[accessTier][0];
}
