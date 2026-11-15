import { CaptureError, TaskRefusedError } from "./backends/backend";
import { ensureHostMessage, ensureOffscreenDocument } from "./backends/mdbase/host";
import { openDestination } from "./backends/open";
import { composeBody, emptyDraft, mergeTags } from "./shared/draft";
import { forgetTabDraft, setPendingCapture } from "./shared/pending";
import { loadSettings } from "./shared/settings";

const icon = "icons/tasknotes-icon-128.png";

// --- First run --------------------------------------------------------------

chrome.runtime.onInstalled.addListener(({ reason }) => {
  createMenus();
  if (reason !== "install") return;
  void loadSettings().then((settings) => {
    // A version 1 install carries its Obsidian settings over and needs no welcome.
    if (settings.backend === null) void chrome.runtime.openOptionsPage();
  });
});

// --- Context menus ----------------------------------------------------------

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "selection", title: "Add task from “%s”", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "link", title: "Add task for this link", contexts: ["link"] });
    chrome.contextMenus.create({ id: "page", title: "Add task for this page", contexts: ["page"] });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  // openPopup must start inside the click's user gesture: no awaiting before it.
  const opened = chrome.action.openPopup();
  void setPendingCapture({
    tabId,
    ...(info.selectionText ? { selection: info.selectionText } : {}),
    ...(info.menuItemId === "link" && info.linkUrl
      ? { link: { url: info.linkUrl, text: info.selectionText ?? info.linkUrl } }
      : {}),
  });
  void opened.catch(() => {
    // No popup (the window lost focus, or the browser refused): open it as a small window.
    void chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?tab=${tabId}`),
      type: "popup",
      width: 420,
      height: 620,
    });
  });
});

// --- Omnibox: "task Call Sam tomorrow 3pm #work" ---------------------------

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

void chrome.omnibox.setDefaultSuggestion({ description: "Add a task to TaskNotes" });

chrome.omnibox.onInputChanged.addListener((text) => {
  const escaped = text.replace(/[&<>]/gu, (character) => entities[character] ?? character);
  void chrome.omnibox.setDefaultSuggestion({
    description: text.trim() ? `Add task: <match>${escaped}</match>` : "Add a task to TaskNotes",
  });
});

chrome.omnibox.onInputEntered.addListener((text) => {
  if (text.trim()) void quickAdd(text.trim());
});

function notify(id: string, title: string, message: string): void {
  void chrome.notifications.create(id, { type: "basic", iconUrl: icon, title, message, priority: 0 });
}

/** Notification ID → what clicking it opens: a URL, or the settings page. */
const notificationTargets = new Map<string, { readonly url: string } | "settings">();

async function quickAdd(text: string): Promise<void> {
  const id = `quick-add-${Date.now()}`;
  const settings = await loadSettings();
  let state: Awaited<ReturnType<typeof openDestination>> | null = null;
  try {
    state = await openDestination(settings, "worker");
    if (state.kind !== "ready") {
      notificationTargets.set(id, "settings");
      notify(id, "Task not added", state.message);
      return;
    }
    const { destination } = state;
    const parsed = await destination.parse(text);
    const title = parsed.title.trim() || text;
    const created = await destination.create(
      {
        ...emptyDraft,
        ...parsed,
        title,
        tags: mergeTags(parsed.tags, settings.extraTags),
        details: parsed.details ?? "",
      },
      composeBody({ details: parsed.details ?? "" }),
    );
    if (created.openUrl) notificationTargets.set(id, { url: created.openUrl });
    notify(id, `Added to ${destination.name}`, created.title);
    // Keep the mdbase session until the log has the task, and say so if it refuses it.
    await Promise.race([created.confirmed, new Promise((resolve) => setTimeout(resolve, 30_000))]).catch(
      (error: unknown) => {
        if (!(error instanceof TaskRefusedError)) return;
        notificationTargets.set(id, "settings");
        notify(id, "Task not added", `${title}: ${error.message}`);
      },
    );
  } catch (error) {
    notificationTargets.set(id, "settings");
    notify(id, "Task not added", error instanceof CaptureError ? error.message : String(error));
  } finally {
    state?.close();
  }
}

chrome.notifications.onClicked.addListener((id) => {
  const target = notificationTargets.get(id);
  notificationTargets.delete(id);
  void chrome.notifications.clear(id);
  if (target === "settings") void chrome.runtime.openOptionsPage();
  else if (target) void chrome.tabs.create({ url: target.url });
});

// --- Housekeeping -----------------------------------------------------------

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetTabDraft(tabId).catch(() => undefined);
});

if (__TN_MDBASE__) {
  // Extension pages ask for the mdbase host here: the service worker owns the offscreen
  // document. Registered synchronously so a message can wake the worker.
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const fromExtension = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("")) === true;
    if (!fromExtension || !message || typeof message !== "object" || !("type" in message)) return false;
    if (message.type !== ensureHostMessage) return false;
    ensureOffscreenDocument().then(
      () => sendResponse({ ok: true }),
      (reason: unknown) => sendResponse({ error: String(reason) }),
    );
    return true;
  });
}
