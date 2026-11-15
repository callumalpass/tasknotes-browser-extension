/**
 * Zip the production builds for the stores and GitHub releases:
 * dist/tasknotes-chrome-<version>.zip and dist/tasknotes-firefox-<version>.zip.
 * Run `npm run build` first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

for (const browser of ["chrome", "firefox"]) {
  const folder = resolve(root, "dist", browser);
  const manifestPath = resolve(folder, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`No ${browser} build: run npm run build first.`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if ((manifest.version_name ?? manifest.version) !== version) {
    throw new Error(`dist/${browser} is version ${manifest.version}, not ${version}: rebuild it.`);
  }
  if (manifest.key) throw new Error(`dist/${browser} carries the development key: build without TASKNOTES_DEV_KEY.`);
  const zip = resolve(root, "dist", `tasknotes-${browser}-${version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-q", "-r", "-X", zip, "."], { cwd: folder, stdio: "inherit" });
  console.log(`Packaged ${zip}`);
}
