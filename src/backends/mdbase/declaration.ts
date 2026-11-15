import type { MdbaseApplicationDeclaration } from "@mdbase-dev/sdk";

import { build } from "../../env";

/** Every bundle of this build names the same session (pages, offscreen host, service worker). */
export const sessionBuild = build.sessionBuild;

/**
 * The extension as mdbase knows it: its own origin, which the manifest lists under
 * `installation_origins`, for this build's one environment.
 */
export function extensionDeclaration(runtimeId: string = chrome.runtime.id): MdbaseApplicationDeclaration {
  return {
    id: build.mdbaseAppManifest.id,
    name: build.mdbaseAppManifest.name,
    origin: `chrome-extension://${runtimeId}`,
    environment: build.mdbaseEnvironment,
    installationKind: "app-runtime",
    manifest: build.mdbaseAppManifest,
  };
}
