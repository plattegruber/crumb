import type { Env } from "../src/env.js";

declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required for module augmentation
  interface ProvidedEnv extends Env {}
}
