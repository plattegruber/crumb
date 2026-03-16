import { ApiClient } from "@/lib/api-client";

export interface KitPluginConfig {
  apiBaseUrl: string;
}

export interface KitPlugin {
  init(config: KitPluginConfig): void;
}

function createPlugin(): KitPlugin {
  let client: ApiClient | null = null;

  return {
    init(config: KitPluginConfig): void {
      client = new ApiClient(config.apiBaseUrl);
      // eslint-disable-next-line no-console
      console.log("[crumb] Kit plugin initialized", { client });
    },
  };
}

export const CrumbPlugin: KitPlugin = createPlugin();
