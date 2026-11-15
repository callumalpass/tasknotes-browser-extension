/**
 * Upload a packaged Chrome build to the Chrome Web Store and submit it for review
 * (Chrome Web Store API v2). Run by the release workflow:
 *
 *   node scripts/publish-webstore.mjs dist/tasknotes-chrome-<version>.zip
 *
 * Environment: CWS_PUBLISHER_ID, CWS_ITEM_ID, CWS_ACCESS_TOKEN (scope
 * https://www.googleapis.com/auth/chromewebstore), RELEASE_TAG (v<version>).
 *
 * Each write (upload, submit) is attempted once. If a step fails after the upload
 * started, check the developer dashboard before running it again.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const api = "https://chromewebstore.googleapis.com";

/** -1, 0 or 1, comparing dotted Chrome versions numerically. */
export function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

/** The release's version, if the tag and the packaged manifest agree on it. */
export function releaseVersion(tag, manifest) {
  const version = /^v(\d+\.\d+\.\d+(?:\.\d+)?)$/u.exec(tag ?? "")?.[1];
  if (!version || manifest.version !== version) {
    throw new Error(`Tag ${tag} doesn't match the packaged version ${manifest.version}.`);
  }
  if (manifest.manifest_version !== 3 || manifest.key) {
    throw new Error("Only the production MV3 build (no development key) can be published.");
  }
  return version;
}

/** Refuse to upload over a submission or upload that is still in progress or failed. */
export function checkStatus(status, itemId, version) {
  if (status.itemId !== itemId) throw new Error("The Web Store returned a different item.");
  if (status.takenDown || status.warned) throw new Error("The item has a policy problem: resolve it in the dashboard.");
  const submitted = status.submittedItemRevisionStatus?.state;
  if (submitted === "PENDING_REVIEW" || submitted === "STAGED") {
    throw new Error("A submission is already in review or staged. Let it finish, then run the release again.");
  }
  if (submitted && submitted !== "PUBLISHED" && submitted !== "PUBLISHED_TO_TESTERS") {
    throw new Error(`The last submission is ${submitted}: resolve it in the dashboard first.`);
  }
  if (status.lastAsyncUploadState === "IN_PROGRESS" || status.lastAsyncUploadState === "FAILED") {
    throw new Error(`The last upload is ${status.lastAsyncUploadState}: resolve it in the dashboard first.`);
  }
  for (const channel of status.publishedItemRevisionStatus?.distributionChannels ?? []) {
    if (compareVersions(version, channel.crxVersion) <= 0) {
      throw new Error(`${version} isn't newer than the published ${channel.crxVersion}.`);
    }
  }
}

export async function publish({ publisherId, itemId, token, version, archive, fetchImpl = fetch, sleep }) {
  if (!/^[a-f0-9-]{36}$/u.test(publisherId ?? "") || !/^[a-p]{32}$/u.test(itemId ?? "") || !token) {
    throw new Error("CWS_PUBLISHER_ID, CWS_ITEM_ID and CWS_ACCESS_TOKEN are required.");
  }
  const name = `publishers/${publisherId}/items/${itemId}`;
  const request = async (step, path, options = {}) => {
    const response = await fetchImpl(`${api}/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      signal: AbortSignal.timeout(120_000),
      redirect: "error",
    });
    if (!response.ok) {
      let detail = "";
      try {
        const message = (await response.json())?.error?.message;
        if (typeof message === "string") detail = `: ${message.replaceAll(token, "[token]").slice(0, 300)}`;
      } catch {
        // No JSON error body.
      }
      throw new Error(`Web Store ${step} failed (HTTP ${response.status}${detail}).`);
    }
    return response.json();
  };
  const statusPath = `v2/${name}:fetchStatus`;

  checkStatus(await request("status check", statusPath), itemId, version);

  const uploaded = await request("upload", `upload/v2/${name}:upload`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: archive,
  });
  if (uploaded.itemId !== itemId) throw new Error("The upload returned a different item.");
  let state = uploaded.uploadState;
  for (let attempt = 0; state === "IN_PROGRESS" && attempt < 30; attempt++) {
    await sleep(10_000);
    state = (await request("upload status check", statusPath)).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED") throw new Error(`The upload ended ${state}. Check the dashboard before retrying.`);
  if (uploaded.crxVersion !== version) {
    throw new Error(`The store reports version ${uploaded.crxVersion}, not ${version}. Check the dashboard.`);
  }

  const result = await request("submission", `v2/${name}:publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Published as soon as review passes; warnings stop the submission.
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true }),
  });
  if (result.itemId !== itemId || !["PENDING_REVIEW", "PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(result.state)) {
    throw new Error(`Unexpected submission result (${result.state}). Check the dashboard.`);
  }
  return result.state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [path] = process.argv.slice(2);
  if (!path) throw new Error("Usage: node scripts/publish-webstore.mjs <chrome zip>");
  const manifest = JSON.parse(execFileSync("unzip", ["-p", path, "manifest.json"], { encoding: "utf8" }));
  const version = releaseVersion(process.env.RELEASE_TAG, manifest);
  const state = await publish({
    publisherId: process.env.CWS_PUBLISHER_ID,
    itemId: process.env.CWS_ITEM_ID,
    token: process.env.CWS_ACCESS_TOKEN,
    version,
    archive: readFileSync(path),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  console.log(`Submitted ${version} to the Chrome Web Store: ${state}.`);
}
