import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(dirname, "..");

await build({
  entryPoints: [path.join(packageDir, "src/index.ts")],
  outfile: path.join(packageDir, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  logLevel: "info"
});
