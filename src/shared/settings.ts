/** Where tasks go. */
export type BackendKind = "mdbase" | "obsidian";

export interface ExtensionSettings {
  /** null until the person picks one on the welcome screen. */
  readonly backend: BackendKind | null;
  readonly obsidian: {
    readonly port: number;
    readonly token: string;
  };
  /** Link the page a task was captured from, in the task's body. */
  readonly attachPage: boolean;
  /** Quote selected text in the task's body. */
  readonly quoteSelection: boolean;
  /** Tags added to every task captured here (in addition to TaskNotes' own). */
  readonly extraTags: readonly string[];
}

export const defaultSettings: ExtensionSettings = {
  backend: null,
  obsidian: { port: 8080, token: "" },
  attachPage: true,
  quoteSelection: true,
  extraTags: [],
};

const key = "settings.v2";

/** Version 1 stored these keys in sync storage. */
interface LegacySettings {
  apiPort?: unknown;
  apiAuthToken?: unknown;
  defaultTags?: unknown;
}

export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/u)
        .map((tag) => tag.trim().replace(/^#/u, ""))
        .filter(Boolean),
    ),
  ];
}

/** Settings from version 1: its port, token and tags carry over, and Obsidian stays the backend. */
export function migrateLegacy(legacy: LegacySettings): ExtensionSettings | null {
  if (legacy.apiPort === undefined && legacy.apiAuthToken === undefined) return null;
  const port = Number(legacy.apiPort);
  const tags = Array.isArray(legacy.defaultTags)
    ? legacy.defaultTags.filter((tag): tag is string => typeof tag === "string")
    : typeof legacy.defaultTags === "string"
      ? parseTags(legacy.defaultTags)
      : [];
  return {
    ...defaultSettings,
    backend: "obsidian",
    obsidian: {
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080,
      token: typeof legacy.apiAuthToken === "string" ? legacy.apiAuthToken : "",
    },
    // Keep tagging captures the way version 1 did.
    extraTags: tags,
  };
}

function normalize(value: unknown): ExtensionSettings {
  if (!value || typeof value !== "object") return defaultSettings;
  const stored = value as Partial<ExtensionSettings>;
  const port = Number(stored.obsidian?.port);
  return {
    backend: stored.backend === "mdbase" || stored.backend === "obsidian" ? stored.backend : null,
    obsidian: {
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080,
      token: typeof stored.obsidian?.token === "string" ? stored.obsidian.token : "",
    },
    attachPage: stored.attachPage ?? defaultSettings.attachPage,
    quoteSelection: stored.quoteSelection ?? defaultSettings.quoteSelection,
    extraTags: Array.isArray(stored.extraTags)
      ? stored.extraTags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get([key, "apiPort", "apiAuthToken", "defaultTags"]);
  if (stored[key]) return normalize(stored[key]);
  const migrated = migrateLegacy(stored);
  if (migrated) {
    await chrome.storage.sync.set({ [key]: migrated });
    await chrome.storage.sync.remove(["apiPort", "apiAuthToken", "defaultTags", "defaultStatus", "defaultPriority"]);
    return migrated;
  }
  return defaultSettings;
}

export async function saveSettings(
  change: Partial<Omit<ExtensionSettings, "obsidian">> & { obsidian?: Partial<ExtensionSettings["obsidian"]> },
): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const next = normalize({
    ...current,
    ...change,
    obsidian: { ...current.obsidian, ...change.obsidian },
  });
  await chrome.storage.sync.set({ [key]: next });
  return next;
}

export function onSettingsChanged(listener: (settings: ExtensionSettings) => void): () => void {
  const handle = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "sync" && changes[key]) listener(normalize(changes[key].newValue));
  };
  chrome.storage.onChanged.addListener(handle);
  return () => chrome.storage.onChanged.removeListener(handle);
}
