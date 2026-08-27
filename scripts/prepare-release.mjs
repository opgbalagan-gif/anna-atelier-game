import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const packageData = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const source = resolve("pages-dist");
const buildsRoot = resolve("builds");
const destination = resolve(buildsRoot, `atelier_anna_web_v${packageData.version}`);

if (!destination.startsWith(`${buildsRoot}${sep}`)) throw new Error("Refusing to write outside the builds directory");

await mkdir(buildsRoot, { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
await writeFile(resolve(destination, "VERSION.txt"), `Atelier Anna v${packageData.version}\n`, "utf8");

console.log(destination);
