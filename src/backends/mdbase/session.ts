import { createMdbase, type Mdbase, type MdbasePhase } from "@mdbase-dev/sdk";

import { extensionDeclaration, sessionBuild } from "./declaration";
import { ensureOffscreenDocument, requestHost } from "./host";

/**
 * One context's view of the extension's shared mdbase session. The offscreen document
 * hosts it; this context joins it and opens sign-in in a tab when asked.
 */
export function joinMdbase(context: "page" | "worker"): Mdbase {
  let signInTab: number | null = null;
  const ensureHost = context === "worker" ? ensureOffscreenDocument : requestHost;
  const mdbase = createMdbase(extensionDeclaration(), {
    session: { build: sessionBuild, host: false },
    followVisibility: context === "page",
    // An extension page has no address of its own to keep the collection in.
    urlSelection: false,
    signIn: {
      open: async (url) => {
        const tab = await chrome.tabs.create({ url });
        signInTab = tab.id ?? null;
      },
      // Close the mdbase tab once sign-in or approval is done.
      close: async () => {
        const tab = signInTab;
        signInTab = null;
        if (tab !== null) await chrome.tabs.remove(tab).catch(() => undefined);
      },
    },
  });
  void ensureHost().catch(() => undefined);
  // The SDK goes back to starting when its host goes away (Chrome closes idle
  // offscreen documents); open it again and the SDK reconnects.
  mdbase.subscribe(() => {
    if (mdbase.getSnapshot().phase.kind === "starting") void ensureHost().catch(() => undefined);
  });
  return mdbase;
}

/** Phases that wait on the person: final as soon as they show. */
const needsPerson = new Set<MdbasePhase["kind"]>([
  "ready",
  "signed_out",
  "choosing",
  "needs_approval",
  "needs_unlock",
  "needs_setup",
  "closed",
]);

/**
 * Phases that are final only once the SDK call behind them has finished: while it is
 * still opening a collection the SDK can briefly report a problem it then clears.
 */
const failed = new Set<MdbasePhase["kind"]>(["problem", "unavailable"]);

const collectionKey = "mdbase.collection";

/** The collection tasks go to, shared by the extension's pages and its service worker. */
export async function rememberedCollection(): Promise<string | null> {
  const { [collectionKey]: value } = await chrome.storage.local.get(collectionKey);
  return typeof value === "string" ? value : null;
}

export async function rememberCollection(collectionId: string | null): Promise<void> {
  if (collectionId) await chrome.storage.local.set({ [collectionKey]: collectionId });
  else await chrome.storage.local.remove(collectionKey);
}

/**
 * Start the session, open the collection chosen in settings, and wait until it is
 * ready or needs the person (sign in, approval, setup).
 */
export async function openChosenCollection(mdbase: Mdbase, signal?: AbortSignal): Promise<MdbasePhase> {
  const [phase, chosen] = await Promise.all([settle(mdbase, 20_000, signal), rememberedCollection()]);
  if (!chosen) return phase;
  if (phase.kind === "ready" && phase.collectionId === chosen) return phase;
  const listed = mdbase.getSnapshot().collections.some((item) => item.collectionId === chosen);
  if (!listed || phase.kind === "signed_out" || phase.kind === "authorizing") return phase;
  return settle(mdbase, 30_000, signal, mdbase.select(chosen, { signal }));
}

/**
 * Wait until the session settles: ready, or needing the person. `action` is the SDK
 * call driving it (by default, starting the session).
 */
export async function settle(
  mdbase: Mdbase,
  timeoutMs = 20_000,
  signal?: AbortSignal,
  action: Promise<unknown> = mdbase.start({ signal }),
): Promise<MdbasePhase> {
  let acted = false;
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = (phase: MdbasePhase) => {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      resolve(phase);
    };
    const abort = () => {
      clearTimeout(timer);
      unsubscribe();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    const check = () => {
      const { phase } = mdbase.getSnapshot();
      if (needsPerson.has(phase.kind) || (acted && failed.has(phase.kind))) finish(phase);
    };
    const timer = setTimeout(() => finish(mdbase.getSnapshot().phase), timeoutMs);
    unsubscribe = mdbase.subscribe(check);
    signal?.addEventListener("abort", abort, { once: true });
    void action
      .catch(() => undefined)
      .then(() => {
        acted = true;
        check();
      });
    check();
  });
}
