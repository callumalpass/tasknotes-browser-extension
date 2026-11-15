import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { CaptureError, TaskRefusedError, type CreatedTask, type ParsedCapture, type TaskDestination, type Vocabulary } from "../backends/backend";
import { openDestination } from "../backends/open";
import { composeBody, joinDateTime, mergeTags, splitDateTime, type CaptureSource, type TaskDraft } from "../shared/draft";
import { formatDate, formatMinutes, formatRecurrence, linkLabel, shortUrl } from "../shared/format";
import { interpretPage, type PageContext } from "../shared/page-context";
import { storeDraft, storedDraft, takePendingCapture } from "../shared/pending";
import { loadSettings, parseTags, type ExtensionSettings } from "../shared/settings";

import { loadCaptureTab } from "./page";

type Connection =
  | { readonly status: "opening" }
  | { readonly status: "ready"; readonly destination: TaskDestination }
  | { readonly status: "attention"; readonly message: string };

type Save =
  | { readonly state: "idle" }
  | { readonly state: "saving" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "saved"; readonly created: CreatedTask; readonly sync: "pending" | "done" | "failed" };

/** What the person set in "More": each wins over what the title's text says. */
interface Overrides {
  status?: string;
  priority?: string;
  /** "" clears the date the text gave. */
  due?: string;
  scheduled?: string;
  tags?: string;
  details?: string;
}

const emptyParse = (text: string): ParsedCapture => ({ title: text, tags: [], contexts: [], projects: [] });

function errorMessage(error: unknown): string {
  if (error instanceof CaptureError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
  window.close();
}

/** The draft as it will be saved: the parsed text, then the person's own choices. */
function buildDraft(
  text: string,
  parsed: ParsedCapture | null,
  overrides: Overrides,
  extraTags: readonly string[],
): TaskDraft {
  const p = parsed ?? emptyParse(text);
  const pick = (override: string | undefined, value: string | undefined) =>
    override === undefined ? value : override || undefined;
  return {
    title: p.title.trim() || text.trim(),
    status: pick(overrides.status, p.status),
    priority: pick(overrides.priority, p.priority),
    due: pick(overrides.due, p.due),
    scheduled: pick(overrides.scheduled, p.scheduled),
    tags: mergeTags(overrides.tags === undefined ? p.tags : parseTags(overrides.tags), extraTags),
    contexts: p.contexts,
    projects: p.projects,
    recurrence: p.recurrence,
    timeEstimate: p.timeEstimate,
    details: overrides.details ?? p.details ?? "",
  };
}

export function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: "opening" });
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [page, setPage] = useState<PageContext | null>(null);
  const [link, setLink] = useState<CaptureSource | null>(null);
  const [text, setText] = useState("");
  /** The title is still the page's own: use it as written, without reading dates or tags from it. */
  const [fromPage, setFromPage] = useState(false);
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [more, setMore] = useState(false);
  const [linkOn, setLinkOn] = useState(true);
  const [quoteOn, setQuoteOn] = useState(true);
  const [save, setSave] = useState<Save>({ state: "idle" });
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Open the destination and read the page side by side: the person can start typing
  // while mdbase is still connecting.
  useEffect(() => {
    const scope = new AbortController();
    let close = () => {};
    const connect = async (loaded: ExtensionSettings) => {
      const state = await openDestination(loaded, "page", scope.signal).catch(
        (error: unknown) => ({ kind: "attention", message: errorMessage(error), close: () => {} }) as const,
      );
      if (scope.signal.aborted) {
        state.close();
        return;
      }
      close = () => state.close();
      if (state.kind === "ready") setConnection({ status: "ready", destination: state.destination });
      else setConnection({ status: "attention", message: state.message });
    };
    const readTab = async (loaded: ExtensionSettings) => {
      const tab = await loadCaptureTab().catch(() => null);
      if (!tab || scope.signal.aborted) return;
      setTabId(tab.id);
      const pending = await takePendingCapture(tab.id).catch(() => null);
      let context = tab.page;
      if (context && pending?.selection) {
        // The menu's selection, which may differ from what the page reports now.
        context = interpretPage({ url: context.url, title: context.title, selection: pending.selection });
      }
      setPage(context);
      if (pending?.link) setLink({ url: pending.link.url, title: pending.link.text });
      // Something the person just right-clicked wins over an older unsaved draft.
      const draft = context && !pending ? await storedDraft(tab.id, context.url).catch(() => null) : null;
      if (draft) {
        setText(draft.text);
        if (draft.details) setOverrides({ details: draft.details });
      } else {
        const suggested = pending?.link?.text ?? context?.suggestedTitle ?? "";
        setText(suggested);
        setFromPage(!!suggested);
        setQuoteOn(
          loaded.quoteSelection && !!context?.selection && context.selection.replace(/\s+/gu, " ") !== suggested,
        );
      }
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        if (!draft) titleRef.current?.select();
      });
    };
    void (async () => {
      const loaded = await loadSettings();
      if (scope.signal.aborted) return;
      setSettings(loaded);
      setLinkOn(loaded.attachPage);
      await Promise.all([connect(loaded), readTab(loaded)]);
    })();
    return () => {
      scope.abort();
      close();
    };
  }, []);

  const destination = connection.status === "ready" ? connection.destination : null;

  useEffect(() => {
    if (!destination) return;
    destination.vocabulary().then(setVocabulary, () => setVocabulary(null));
  }, [destination]);

  // Read dates, tags and the rest from what the person types.
  useEffect(() => {
    if (!destination || fromPage || !text.trim()) {
      setParsed(null);
      return;
    }
    const scope = new AbortController();
    const timer = setTimeout(() => {
      destination.parse(text, scope.signal).then(
        (result) => {
          if (!scope.signal.aborted) setParsed(result);
        },
        () => {
          if (!scope.signal.aborted) setParsed(null);
        },
      );
    }, 120);
    return () => {
      clearTimeout(timer);
      scope.abort();
    };
  }, [destination, text, fromPage]);

  // Keep what the person typed if the popup closes before they save.
  useEffect(() => {
    if (tabId === null || !page || fromPage || save.state === "saved") return;
    const timer = setTimeout(() => {
      void storeDraft(tabId, { text, details: overrides.details ?? "", url: page.url }).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [tabId, page, text, overrides.details, fromPage, save.state]);

  const draft = useMemo(
    () => buildDraft(text, fromPage ? null : parsed, overrides, settings?.extraTags ?? []),
    [text, fromPage, parsed, overrides, settings],
  );
  const source: CaptureSource | null = link ?? (page ? { url: page.url, title: page.title } : null);
  const quote = page?.selection && quoteOn ? page.selection : null;
  const canSave = !!destination && !!draft.title && save.state !== "saving";

  async function submit(): Promise<void> {
    if (!destination || !draft.title || save.state === "saving") return;
    setSave({ state: "saving" });
    try {
      // Parse once more so the last keystrokes count.
      const latest = fromPage ? null : await destination.parse(text).catch(() => parsed);
      const final = buildDraft(text, latest, overrides, settings?.extraTags ?? []);
      const body = composeBody({ details: final.details, quote, source: linkOn ? source : null });
      const created = await destination.create(final, body);
      setSave({ state: "saved", created, sync: created.confirmed ? "pending" : "done" });
      if (tabId !== null) void storeDraft(tabId, null).catch(() => undefined);
      created.confirmed?.then(
        () => setSave((current) => (current.state === "saved" ? { ...current, sync: "done" } : current)),
        (error: unknown) =>
          setSave((current) => {
            if (current.state !== "saved") return current;
            // Refused: back to the form, with what they typed, to change it and try again.
            if (error instanceof TaskRefusedError) return { state: "failed", message: error.message };
            return { ...current, sync: "failed" };
          }),
      );
    } catch (error) {
      setSave({ state: "failed", message: errorMessage(error) });
    }
  }

  function reset(): void {
    setText("");
    setFromPage(false);
    setParsed(null);
    setOverrides({});
    setLink(null);
    setQuoteOn(false);
    setSave({ state: "idle" });
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  if (connection.status === "attention") {
    return (
      <main class="popup" onKeyDown={onKeyDown}>
        <Header name={null} />
        <section class="attention">
          <p>{connection.message}</p>
          <button class="button primary" type="button" onClick={openSettings}>
            Open settings
          </button>
        </section>
      </main>
    );
  }

  if (save.state === "saved") {
    const { created, sync } = save;
    return (
      <main class="popup" onKeyDown={onKeyDown}>
        <Header name={destination?.name ?? null} />
        <section class="saved" aria-live="polite">
          <div class="saved-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <h1>{created.title}</h1>
          <p class="supporting">
            Added to {destination?.name}
            {sync === "pending" ? " · syncing…" : sync === "failed" ? " · saved here, not synced yet" : ""}
          </p>
          <div class="saved-actions">
            {created.openUrl ? (
              <a class="button" href={created.openUrl} target="_blank" rel="noreferrer">
                Open in {created.openUrl.startsWith("obsidian:") ? "Obsidian" : "TaskNotes"}
              </a>
            ) : null}
            <button class="button primary" type="button" onClick={reset}>
              Add another
            </button>
          </div>
        </section>
      </main>
    );
  }

  const chips = fieldChips(draft, vocabulary);

  return (
    <main class="popup" onKeyDown={onKeyDown}>
      <Header name={destination?.name ?? null} />
      <form
        class="capture"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label class="visually-hidden" for="title">
          Task
        </label>
        <textarea
          id="title"
          ref={titleRef}
          class="title-input"
          rows={2}
          placeholder="What needs doing? Try “Reply to Sam tomorrow 3pm #work”"
          value={text}
          onInput={(event) => {
            setText(event.currentTarget.value);
            setFromPage(false);
            if (save.state === "failed") setSave({ state: "idle" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <ul class="chips" aria-label="Read from your text" aria-live="polite">
          {chips.map((chip) => (
            <li key={chip.key} class={`chip ${chip.kind}`}>
              {chip.label}
            </li>
          ))}
        </ul>

        <details class="more" open={more} onToggle={(event) => setMore(event.currentTarget.open)}>
          <summary>Details</summary>
          <MoreFields
            draft={draft}
            textTags={fromPage ? [] : (parsed?.tags ?? [])}
            extraTags={settings?.extraTags ?? []}
            vocabulary={vocabulary}
            overrides={overrides}
            onChange={setOverrides}
          />
        </details>

        {source || page?.selection ? (
          <fieldset class="source">
            <legend class="visually-hidden">From this page</legend>
            {source ? (
              <label class="check">
                <input type="checkbox" checked={linkOn} onChange={(event) => setLinkOn(event.currentTarget.checked)} />
                <span class="source-text">
                  <span class="source-title">{link ? "Link to the linked page" : "Link to this page"}</span>
                  <span class="source-detail" title={source.url}>
                    {page?.reference && !link ? `${page.reference} · ` : ""}
                    {link ? source.title : source.title || shortUrl(source.url)}
                  </span>
                </span>
              </label>
            ) : null}
            {page?.selection ? (
              <label class="check">
                <input type="checkbox" checked={quoteOn} onChange={(event) => setQuoteOn(event.currentTarget.checked)} />
                <span class="source-text">
                  <span class="source-title">Quote the selection</span>
                  <span class="source-quote">{page.selection}</span>
                </span>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {save.state === "failed" ? (
          <p class="notice error" role="alert">
            {save.message}
          </p>
        ) : null}

        <div class="submit-row">
          <button class="button primary wide" type="submit" disabled={!canSave}>
            {save.state === "saving" ? <span class="spinner" aria-hidden="true" /> : null}
            {connection.status === "opening" ? "Connecting…" : save.state === "saving" ? "Adding…" : "Add task"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Header({ name }: { name: string | null }) {
  return (
    <header class="popup-header">
      <img src="/icons/tasknotes-icon-32.png" width="20" height="20" alt="" />
      <span class="popup-heading">
        <strong>TaskNotes</strong>
        {name ? <span class="destination">{name}</span> : null}
      </span>
      <button class="icon-button" type="button" title="Settings" aria-label="Settings" onClick={openSettings}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"
          />
        </svg>
      </button>
    </header>
  );
}

interface Chip {
  readonly key: string;
  readonly kind: string;
  readonly label: string;
}

function fieldChips(draft: TaskDraft, vocabulary: Vocabulary | null): Chip[] {
  const chips: Chip[] = [];
  const label = (list: readonly { value: string; label: string }[] | undefined, value: string) =>
    list?.find((item) => item.value === value)?.label ?? value;
  if (draft.scheduled) chips.push({ key: "scheduled", kind: "date", label: `Scheduled ${formatDate(draft.scheduled)}` });
  if (draft.due) chips.push({ key: "due", kind: "date due", label: `Due ${formatDate(draft.due)}` });
  if (draft.recurrence) chips.push({ key: "recurrence", kind: "date", label: formatRecurrence(draft.recurrence) });
  if (draft.priority) chips.push({ key: "priority", kind: "plain", label: label(vocabulary?.priorities, draft.priority) });
  if (draft.status) chips.push({ key: "status", kind: "plain", label: label(vocabulary?.statuses, draft.status) });
  if (draft.timeEstimate) chips.push({ key: "estimate", kind: "plain", label: formatMinutes(draft.timeEstimate) });
  for (const project of draft.projects) chips.push({ key: `p:${project}`, kind: "project", label: `+${linkLabel(project)}` });
  for (const context of draft.contexts) chips.push({ key: `c:${context}`, kind: "context", label: `@${linkLabel(context)}` });
  for (const tag of draft.tags) chips.push({ key: `t:${tag}`, kind: "tag", label: `#${tag}` });
  return chips;
}

function DateTimeField(props: { label: string; value: string | undefined; onChange: (value: string) => void }) {
  const { date, time } = splitDateTime(props.value);
  return (
    <div class="field">
      <span>{props.label}</span>
      <div class="date-time">
        <input
          class="input"
          type="date"
          aria-label={`${props.label} date`}
          value={date}
          onInput={(event) => props.onChange(joinDateTime(event.currentTarget.value, time) ?? "")}
        />
        <input
          class="input"
          type="time"
          aria-label={`${props.label} time`}
          value={time}
          disabled={!date}
          onInput={(event) => props.onChange(joinDateTime(date, event.currentTarget.value) ?? "")}
        />
      </div>
    </div>
  );
}

function MoreFields(props: {
  draft: TaskDraft;
  /** Tags from the title's text; the settings' tags are added to every task anyway. */
  textTags: readonly string[];
  extraTags: readonly string[];
  vocabulary: Vocabulary | null;
  overrides: Overrides;
  onChange: (change: (current: Overrides) => Overrides) => void;
}) {
  const { draft, vocabulary, overrides } = props;
  const set = (change: Partial<Overrides>) => props.onChange((current) => ({ ...current, ...change }));
  return (
    <div class="more-fields">
      <label class="field">
        <span>Status</span>
        <select class="input" value={draft.status ?? ""} onChange={(event) => set({ status: event.currentTarget.value })}>
          <option value="">Default status</option>
          {vocabulary?.statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>Priority</span>
        <select
          class="input"
          value={draft.priority ?? ""}
          onChange={(event) => set({ priority: event.currentTarget.value })}
        >
          <option value="">Default priority</option>
          {vocabulary?.priorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </label>
      <DateTimeField label="Scheduled" value={draft.scheduled} onChange={(scheduled) => set({ scheduled })} />
      <DateTimeField label="Due" value={draft.due} onChange={(due) => set({ due })} />
      <label class="field span">
        <span>Tags</span>
        <input
          class="input"
          type="text"
          placeholder="work, reading"
          value={overrides.tags ?? props.textTags.join(", ")}
          onInput={(event) => set({ tags: event.currentTarget.value })}
        />
        {props.extraTags.length ? (
          <span class="hint">Also added to every task: {props.extraTags.map((tag) => `#${tag}`).join(" ")}</span>
        ) : null}
      </label>
      <label class="field span">
        <span>Notes</span>
        <textarea
          class="input"
          rows={3}
          value={overrides.details ?? draft.details}
          onInput={(event) => set({ details: event.currentTarget.value })}
        />
      </label>
    </div>
  );
}
