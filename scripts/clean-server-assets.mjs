import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const distRoot = resolve("dist");
const duplicateAssets = resolve(distRoot, "server", "assets");

if (!duplicateAssets.startsWith(`${distRoot}${sep}`)) {
  throw new Error("Refusing to clean assets outside the build directory");
}

await rm(duplicateAssets, { recursive: true, force: true });
