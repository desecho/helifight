import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(dirname, "..");
const sharedEntry = path.resolve(packageDir, "../shared/src/index.ts");

await build({
  entryPoints: [path.join(packageDir, "src/index.ts")],
  outfile: path.join(packageDir, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  external: ["cors", "express", "socket.io"],
  alias: {
    "@helifight/shared": sharedEntry
  }
});
