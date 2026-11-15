import { describe, expect, it } from "vitest";

import { checkStatus, publish, releaseVersion } from "../scripts/publish-webstore.mjs";

const itemId = "kcbplgbcleppckifepdciipecjhdmchh";
const publisherId = "01a9bdcf-e8d0-46ba-956d-2ef4dde4dc43";
const live = { itemId, publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "1.1.0" }] } };

describe("Chrome Web Store publishing", () => {
  it("publishes only a production build whose version matches the tag", () => {
    expect(releaseVersion("v2.0.0", { version: "2.0.0", manifest_version: 3 })).toBe("2.0.0");
    expect(() => releaseVersion("v2.0.1", { version: "2.0.0", manifest_version: 3 })).toThrow(/doesn't match/u);
    expect(() => releaseVersion("v2.0.0", { version: "2.0.0", manifest_version: 3, key: "dev" })).toThrow(
      /development key/u,
    );
  });

  it("refuses to upload over a submission in review or an older version", () => {
    expect(() => checkStatus(live, itemId, "2.0.0")).not.toThrow();
    expect(() => checkStatus(live, itemId, "1.1.0")).toThrow(/isn't newer/u);
    expect(() =>
      checkStatus({ ...live, submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }, itemId, "2.0.0"),
    ).toThrow(/already in review/u);
  });

  it("uploads, waits for processing, then submits once", async () => {
    const calls: string[] = [];
    const replies = [live, { itemId, uploadState: "IN_PROGRESS", crxVersion: "2.0.0" }, { lastAsyncUploadState: "SUCCEEDED" }, { itemId, state: "PENDING_REVIEW" }];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.split(itemId)[1]}`);
      return Promise.resolve(new Response(JSON.stringify(replies.shift())));
    }) as typeof fetch;
    const state = await publish({
      publisherId,
      itemId,
      token: "token",
      version: "2.0.0",
      archive: new Uint8Array([1]),
      fetchImpl,
      sleep: () => Promise.resolve(),
    });
    expect(state).toBe("PENDING_REVIEW");
    expect(calls).toEqual(["GET :fetchStatus", "POST :upload", "GET :fetchStatus", "POST :publish"]);
  });
});
