/**
 * What a context-menu click asked for, kept until the popup it opens reads it.
 * Session storage: never written to disk, gone when the browser closes.
 */
export interface PendingCapture {
  readonly tabId: number;
  /** The text the person right-clicked. */
  readonly selection?: string;
  /** A link the person right-clicked: the task links to it instead of the page. */
  readonly link?: { readonly url: string; readonly text: string };
  readonly at: number;
}

const key = "pending-capture";
const maxAgeMs = 60_000;

export async function setPendingCapture(capture: Omit<PendingCapture, "at">): Promise<void> {
  await chrome.storage.session.set({ [key]: { ...capture, at: Date.now() } });
}

/** The pending capture for this tab, once: reading it clears it. */
export async function takePendingCapture(tabId: number | undefined): Promise<PendingCapture | null> {
  const { [key]: value } = await chrome.storage.session.get<{ [key]?: PendingCapture }>(key);
  if (!value) return null;
  await chrome.storage.session.remove(key);
  return value.tabId === tabId && Date.now() - value.at < maxAgeMs ? value : null;
}

const draftKey = (tabId: number) => `draft:${tabId}`;

/** What the person typed in the popup for a tab, kept if the popup closes before they save. */
export interface StoredDraft {
  readonly text: string;
  readonly details: string;
  readonly url: string;
}

export async function storeDraft(tabId: number, draft: StoredDraft | null): Promise<void> {
  if (draft && (draft.text.trim() || draft.details.trim())) {
    await chrome.storage.session.set({ [draftKey(tabId)]: draft });
  } else {
    await chrome.storage.session.remove(draftKey(tabId));
  }
}

/** The tab's unsaved draft, if it was written on the page the tab still shows. */
export async function storedDraft(tabId: number, url: string): Promise<StoredDraft | null> {
  const { [draftKey(tabId)]: value } = await chrome.storage.session.get<Record<string, StoredDraft | undefined>>(
    draftKey(tabId),
  );
  return value && value.url === url ? value : null;
}

export async function forgetTabDraft(tabId: number): Promise<void> {
  await chrome.storage.session.remove(draftKey(tabId));
}
