import { joinDateTime, type TaskDraft } from "../shared/draft";

import {
  CaptureError,
  type CreatedTask,
  type ParsedCapture,
  type TaskDestination,
  type Vocabulary,
} from "./backend";

export interface ObsidianConnection {
  readonly port: number;
  readonly token: string;
}

interface Envelope<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

interface Health {
  readonly status: string;
  readonly vault?: { readonly name?: string | null };
}

interface FilterOptions {
  readonly statuses?: readonly { value: string; label?: string; isCompleted?: boolean }[];
  readonly priorities?: readonly { value: string; label?: string }[];
  readonly contexts?: readonly string[];
  readonly projects?: readonly string[];
  readonly tags?: readonly string[];
}

/** The plugin's parse (tasknotes-nlp-core's `ParsedTaskData`). */
interface PluginParse {
  readonly title?: string;
  readonly details?: string;
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly scheduledDate?: string;
  readonly scheduledTime?: string;
  readonly priority?: string;
  readonly status?: string;
  readonly tags?: readonly string[];
  readonly contexts?: readonly string[];
  readonly projects?: readonly string[];
  readonly recurrence?: string;
  readonly estimate?: number;
}

interface PluginTask {
  readonly title: string;
  readonly path: string;
}

const timeoutMs = 8000;

async function call<T>(
  connection: ObsidianConnection,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  if (!connection.token) {
    throw new CaptureError(
      "Add the API token from TaskNotes' HTTP API settings in Obsidian.",
      "settings",
    );
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new CaptureError(
      timeout.aborted
        ? `Obsidian did not answer on port ${connection.port}.`
        : `Can't reach Obsidian on port ${connection.port}. Open Obsidian and turn on TaskNotes' HTTP API.`,
      "retry",
    );
  }
  if (response.status === 401) {
    throw new CaptureError("Obsidian refused the API token. Copy it again from TaskNotes' settings.", "settings");
  }
  let envelope: Envelope<T>;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    throw new CaptureError(
      `Something other than TaskNotes is answering on port ${connection.port}.`,
      "settings",
    );
  }
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    throw new CaptureError(envelope.error || `Obsidian answered ${response.status}.`, "retry");
  }
  return envelope.data;
}

function dateField(date: string | undefined, time: string | undefined): string | undefined {
  return date ? joinDateTime(date, time ?? "") : undefined;
}

/** Links tasks open in: the vault's file, through Obsidian's own URL scheme. */
function obsidianUrl(vault: string | undefined, path: string): string | undefined {
  if (!vault) return undefined;
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
}

/** Checks the connection; resolves with the vault's name. */
export async function checkObsidian(
  connection: ObsidianConnection,
  signal?: AbortSignal,
): Promise<string> {
  const health = await call<Health>(connection, "/api/health", { signal });
  return health.vault?.name || "Obsidian";
}

/** Tasks go through the TaskNotes plugin's HTTP API in a running Obsidian. */
export async function openObsidian(
  connection: ObsidianConnection,
  signal?: AbortSignal,
): Promise<TaskDestination> {
  const name = await checkObsidian(connection, signal);
  let vocabulary: Promise<Vocabulary> | null = null;
  return {
    name,
    vocabulary(innerSignal) {
      vocabulary ??= call<FilterOptions>(connection, "/api/filter-options", { signal: innerSignal }).then(
        (options) => ({
          statuses: (options.statuses ?? []).map((status) => ({
            value: status.value,
            label: status.label || status.value,
            completed: !!status.isCompleted,
          })),
          priorities: (options.priorities ?? []).map((priority) => ({
            value: priority.value,
            label: priority.label || priority.value,
          })),
          // The plugin applies its own defaults to fields left empty.
          projects: options.projects ?? [],
          contexts: options.contexts ?? [],
          tags: options.tags ?? [],
        }),
        (error: unknown) => {
          vocabulary = null;
          throw error;
        },
      );
      return vocabulary;
    },
    async parse(text, innerSignal) {
      // The plugin parses with the person's own language, triggers and statuses.
      const { parsed } = await call<{ parsed: PluginParse }>(connection, "/api/nlp/parse", {
        method: "POST",
        body: { text },
        signal: innerSignal,
      });
      return {
        title: parsed.title ?? text,
        details: parsed.details,
        status: parsed.status,
        priority: parsed.priority,
        due: dateField(parsed.dueDate, parsed.dueTime),
        scheduled: dateField(parsed.scheduledDate, parsed.scheduledTime),
        tags: parsed.tags ?? [],
        contexts: parsed.contexts ?? [],
        projects: parsed.projects ?? [],
        recurrence: parsed.recurrence,
        timeEstimate: parsed.estimate,
      } satisfies ParsedCapture;
    },
    async create(draft: TaskDraft, body: string, innerSignal): Promise<CreatedTask> {
      const task = await call<PluginTask>(connection, "/api/tasks", {
        method: "POST",
        signal: innerSignal,
        body: {
          title: draft.title,
          status: draft.status,
          priority: draft.priority,
          due: draft.due,
          scheduled: draft.scheduled,
          tags: draft.tags.length ? draft.tags : undefined,
          contexts: draft.contexts.length ? draft.contexts : undefined,
          projects: draft.projects.length ? draft.projects : undefined,
          recurrence: draft.recurrence,
          timeEstimate: draft.timeEstimate,
          details: body || undefined,
          creationContext: "api",
        },
      });
      return { title: task.title, path: task.path, openUrl: obsidianUrl(name, task.path) };
    },
  };
}
