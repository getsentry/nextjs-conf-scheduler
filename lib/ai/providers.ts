import { gateway } from "ai";
import type { AiModelConfig } from "./models";

export function getLanguageModel(config: AiModelConfig) {
  return gateway(config.id);
}

export function getGatewayProviderOptions(
  config: AiModelConfig,
  identityId: string,
  accessTier: string,
) {
  return {
    gateway: {
      ...(config.gatewayOrder ? { order: config.gatewayOrder } : {}),
      user: identityId,
      tags: ["nextjs-conf-scheduler", accessTier, config.provider],
    },
  };
}
