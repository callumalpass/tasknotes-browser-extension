/**
 * The mdbase SDK runs its Worker in one hidden offscreen document (a service worker
 * cannot start Workers). The service worker owns `chrome.offscreen` and creates it
 * on demand; pages ask the service worker for it.
 */
export const offscreenPath = "offscreen.html";
export const ensureHostMessage = "tasknotes/ensure-mdbase-host";

let creating: Promise<void> | null = null;

/** In the service worker: open the offscreen host unless it is already open. */
export async function ensureOffscreenDocument(): Promise<void> {
  const url = chrome.runtime.getURL(offscreenPath);
  const open = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (open.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: offscreenPath,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the mdbase SDK's worker, which saves tasks to your collection.",
    })
    .catch((reason: unknown) => {
      // Another caller opened it first.
      if (!/single offscreen document/iu.test(String(reason))) throw reason;
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/** In an extension page: ask the service worker for the host. */
export async function requestHost(): Promise<void> {
  const reply: unknown = await chrome.runtime.sendMessage({ type: ensureHostMessage });
  if (reply && typeof reply === "object" && "error" in reply) throw new Error(String(reply.error));
}
