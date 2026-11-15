import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { build } from "vite";

import {
  buildTarget,
  extensionManifest,
  mdbaseAppManifest,
  mdbaseEnvironments,
  mdbaseSupported,
} from "./manifest.mjs";

const root = resolve(import.meta.dirname, "..");

/** Output folder for a target: dist/chrome, dist/firefox, dist/chrome-lab, ... */
export function outputDir(target) {
  const suffix = target.mdbaseEnv === "production" ? (target.devKey ? "-dev" : "") : `-${target.mdbaseEnv}`;
  return resolve(root, "dist", `${target.browser}${suffix}`);
}

async function buildTarget_(target) {
  const outDir = outputDir(target);
  const environment = mdbaseEnvironments[target.mdbaseEnv];
  const mdbase = mdbaseSupported(target);
  // One name for every bundle of this build, so its pages, offscreen document and
  // service worker share one mdbase session.
  const sessionBuild = `tasknotes-extension-${randomUUID()}`;
  // Source maps only for LAB and development-key builds: they would triple the store package.
  const sourcemap = target.mdbaseEnv !== "production" || target.devKey;
  const define = {
    __TN_BROWSER__: JSON.stringify(target.browser),
    __TN_MDBASE__: JSON.stringify(mdbase),
    __TN_MDBASE_ENV__: JSON.stringify(target.mdbaseEnv),
    __TN_SESSION_BUILD__: JSON.stringify(sessionBuild),
    __TN_APP_URL__: JSON.stringify(environment.appUrl),
    __TN_MDBASE_APP_MANIFEST__: JSON.stringify(mdbaseAppManifest(target)),
  };
  const shared = {
    configFile: false,
    root,
    logLevel: "warn",
    define,
    resolve: {
      // Each environment's SDK trusts only that environment.
      alias: [{ find: /^@mdbase-dev\/sdk$/u, replacement: environment.sdkPackage }],
    },
    oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
    worker: { format: "es" },
  };
  await rm(outDir, { recursive: true, force: true });
  await build({
    ...shared,
    publicDir: resolve(root, "public"),
    build: {
      outDir,
      emptyOutDir: true,
      target: "es2022",
      sourcemap,
      modulePreload: false,
      rolldownOptions: {
        input: {
          popup: resolve(root, "popup.html"),
          options: resolve(root, "options.html"),
          ...(mdbase ? { offscreen: resolve(root, "offscreen.html") } : {}),
        },
      },
    },
  });
  // The service worker is one self-contained module.
  await build({
    ...shared,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: false,
      target: "es2022",
      sourcemap,
      modulePreload: false,
      copyPublicDir: false,
      rolldownOptions: {
        input: resolve(root, "src/background.ts"),
        output: { entryFileNames: "background.js", codeSplitting: false },
      },
    },
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, "manifest.json"),
    `${JSON.stringify(extensionManifest(target), null, 2)}\n`,
  );
  return outDir;
}

const { values } = parseArgs({
  options: { browser: { type: "string" } },
});

const browsers = values.browser ? [values.browser] : ["chrome", "firefox"];
for (const browser of browsers) {
  const developmentOnly =
    (process.env.MDBASE_ENV ?? "production") !== "production" || process.env.TASKNOTES_DEV_KEY === "1";
  if (browser === "firefox" && developmentOnly && !values.browser) {
    // Firefox has no mdbase sign-in, so a LAB or development-key build is Chrome only.
    continue;
  }
  const target = buildTarget({ ...process.env, TASKNOTES_BROWSER: browser });
  const dir = await buildTarget_(target);
  console.log(`Built ${browser} (${target.mdbaseEnv}${target.devKey ? ", development key" : ""}) → ${dir}`);
}
