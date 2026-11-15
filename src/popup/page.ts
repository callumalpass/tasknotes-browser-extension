import { interpretPage, isCapturableUrl, readPage, type PageContext, type RawPage } from "../shared/page-context";

export interface CaptureTab {
  readonly id: number;
  readonly page: PageContext | null;
}

/** The popup's tab: the active one, or the one named in `?tab=` when it opened as a window. */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const named = Number(new URLSearchParams(location.search).get("tab"));
  if (Number.isInteger(named) && named > 0) {
    return chrome.tabs.get(named).catch(() => undefined);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Read the tab's page. Opening the popup grants `activeTab`, so this works on the page
 * the person is looking at without the extension having access to every site.
 */
export async function loadCaptureTab(): Promise<CaptureTab | null> {
  const tab = await targetTab();
  if (tab?.id === undefined) return null;
  if (!tab.url || !isCapturableUrl(tab.url)) return { id: tab.id, page: null };
  let raw: RawPage = { url: tab.url, title: tab.title ?? "", selection: "" };
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    if (result?.result) raw = result.result;
  } catch {
    // Pages the browser keeps extensions out of (its store, PDFs, other extensions'
    // pages): fall back to the tab's own address and title.
  }
  return { id: tab.id, page: interpretPage(raw) };
}
