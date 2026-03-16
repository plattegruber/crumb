import { build } from "esbuild";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

await build({
  entryPoints: [resolve(__dirname, "src/index.ts")],
  bundle: true,
  format: "esm",
  outfile: resolve(__dirname, "dist/index.js"),
  platform: "neutral",
  conditions: ["workerd"],
  alias: {
    "@dough/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
  },
  external: [],
});

console.log("Build complete: dist/index.js");
