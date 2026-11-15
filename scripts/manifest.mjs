import { readFileSync } from "node:fs";

import { TASKNOTES_CONTRACT_DIGEST, TASKNOTES_TASK_CONTRACT_VERSION } from "@tasknotes/model/mdbase";

import {
  developmentExtensionId,
  developmentPublicKey,
  firefoxAddonId,
  storeExtensionId,
} from "./extension-ids.mjs";

/**
 * mdbase environments this extension can be built for. Each SDK build trusts only its
 * own environment, so the environment is fixed at build time.
 */
export const mdbaseEnvironments = {
  production: {
    connectUrl: "https://connect.mdbase.dev",
    logUrl: "https://log.mdbase.dev",
    appUrl: "https://app.tasknotes.dev",
    sdkPackage: "@mdbase-dev/sdk",
  },
  lab: {
    connectUrl: "https://connect-lab.mdbase.dev",
    logUrl: "https://mdbase-next-log-lab-20261005.callumalpass.workers.dev",
    appUrl: "https://lab.tasknotes-app.pages.dev",
    sdkPackage: "@mdbase-dev/sdk-lab",
  },
};

/**
 * The build's target, from the environment:
 * - `TASKNOTES_BROWSER`: `chrome` (default) or `firefox`.
 * - `MDBASE_ENV`: `production` (default) or `lab`.
 * - `TASKNOTES_DEV_KEY=1`: give a production Chrome build the development key and
 *   declare its ID to mdbase, to test an unpacked build against production. LAB builds
 *   always use the development key; store builds never do.
 */
export function buildTarget(environment = process.env) {
  const browser = environment.TASKNOTES_BROWSER ?? "chrome";
  if (browser !== "chrome" && browser !== "firefox") {
    throw new Error(`TASKNOTES_BROWSER must be chrome or firefox, not ${browser}.`);
  }
  const mdbaseEnv = environment.MDBASE_ENV ?? "production";
  if (!(mdbaseEnv in mdbaseEnvironments)) {
    throw new Error(`MDBASE_ENV must be production or lab, not ${mdbaseEnv}.`);
  }
  const devKey = mdbaseEnv === "lab" || environment.TASKNOTES_DEV_KEY === "1";
  if (devKey && browser !== "chrome") {
    throw new Error("The development key applies to Chrome builds only.");
  }
  return { browser, mdbaseEnv, devKey };
}

/** mdbase sign-in needs an offscreen document and a stable extension origin: Chrome only. */
export function mdbaseSupported(target) {
  return target.browser === "chrome";
}

function extensionIds(target) {
  if (target.mdbaseEnv === "lab") return [developmentExtensionId];
  return target.devKey ? [storeExtensionId, developmentExtensionId] : [storeExtensionId];
}

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

/** Browser versions are dot-separated integers; a prerelease ships its full name separately. */
export function manifestVersion(version = packageVersion) {
  const match = /^(\d+\.\d+\.\d+)(?:-(.+))?$/u.exec(version);
  if (!match) throw new Error(`Unsupported version: ${version}`);
  return match[2] ? { version: match[1], version_name: version } : { version: match[1] };
}

/**
 * The extension's mdbase application manifest. Connect registers it on first sign-in;
 * the approval screen names the extension and says a browser extension is asking.
 * It asks only to read the collection (to find its TaskNotes task type, statuses,
 * priorities and projects) and to create records.
 */
export function mdbaseAppManifest(target) {
  return {
    manifest_version: 1,
    id: "dev.tasknotes.browser-extension",
    name: "TaskNotes browser extension",
    homepage: "https://tasknotes.dev/",
    icon: "https://tasknotes.dev/favicon.svg",
    redirect_uris: ["https://tasknotes.dev/"],
    installation_origins: {
      [target.mdbaseEnv]: {
        "app-runtime": extensionIds(target).map((id) => `chrome-extension://${id}`),
      },
    },
    requirements: {
      // The task contract it writes, at the version this model package writes.
      contracts: [
        { id: "tasknotes.task", version: TASKNOTES_TASK_CONTRACT_VERSION, digest: TASKNOTES_CONTRACT_DIGEST },
      ],
      access: "full_collection",
      capabilities: {
        contract_version: 2,
        required: ["collection.read", "records.create"],
      },
    },
  };
}

const icons = {
  16: "icons/tasknotes-icon-16.png",
  32: "icons/tasknotes-icon-32.png",
  48: "icons/tasknotes-icon-48.png",
  128: "icons/tasknotes-icon-128.png",
};

/** The browser extension manifest for one target. */
export function extensionManifest(target) {
  const environment = mdbaseEnvironments[target.mdbaseEnv];
  const mdbase = mdbaseSupported(target);
  const label = target.mdbaseEnv === "production" ? "" : ` (${target.mdbaseEnv.toUpperCase()})`;
  const manifest = {
    manifest_version: 3,
    ...(target.devKey ? { key: developmentPublicKey } : {}),
    name: `TaskNotes${label}`,
    short_name: "TaskNotes",
    description:
      "Capture tasks from any page into TaskNotes: your mdbase collection or your Obsidian vault.",
    ...manifestVersion(),
    homepage_url: "https://tasknotes.dev/",
    icons,
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "contextMenus",
      "notifications",
      ...(mdbase ? ["offscreen"] : []),
    ],
    // The Obsidian plugin's HTTP API on this computer, and mdbase's own services.
    host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      ...(mdbase ? [`${environment.connectUrl}/*`, `${environment.logUrl}/*`] : []),
    ],
    action: {
      default_title: `Add to TaskNotes${label}`,
      default_popup: "popup.html",
      default_icon: { 16: icons[16], 32: icons[32] },
    },
    options_ui: { page: "options.html", open_in_tab: true },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+T" },
        description: "Add a task",
      },
    },
    omnibox: { keyword: "task" },
    content_security_policy: {
      // The mdbase SDK runs WebAssembly.
      extension_pages: mdbase
        ? "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
        : "script-src 'self'; object-src 'self'",
    },
  };
  if (target.browser === "chrome") {
    manifest.background = { service_worker: "background.js", type: "module" };
    manifest.minimum_chrome_version = "123";
  } else {
    manifest.background = { scripts: ["background.js"], type: "module" };
    manifest.browser_specific_settings = {
      gecko: { id: firefoxAddonId, strict_min_version: "128.0" },
    };
  }
  return manifest;
}
