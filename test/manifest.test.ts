import { validateAppManifest } from "@mdbase-dev/sdk/manifest";
import { describe, expect, it } from "vitest";

import { buildTarget, extensionManifest, mdbaseAppManifest } from "../scripts/manifest.mjs";

const targets = [
  { MDBASE_ENV: "production" },
  { MDBASE_ENV: "production", TASKNOTES_DEV_KEY: "1" },
  { MDBASE_ENV: "lab" },
].map((environment) => buildTarget({ TASKNOTES_BROWSER: "chrome", ...environment }));

describe("manifests", () => {
  it.each(targets)("declares a valid mdbase application for %o", (target) => {
    const result = validateAppManifest(mdbaseAppManifest(target));
    expect(result).toMatchObject({ valid: true });
  });

  it("keeps mdbase out of the Firefox build", () => {
    const manifest = extensionManifest(buildTarget({ TASKNOTES_BROWSER: "firefox" }));
    expect(manifest.permissions).not.toContain("offscreen");
    expect(manifest.host_permissions.every((host) => /localhost|127\.0\.0\.1/u.test(host))).toBe(true);
  });
});
