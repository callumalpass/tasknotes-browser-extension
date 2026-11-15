import type { TaskDraft } from "../shared/draft";

export interface Choice {
  readonly value: string;
  readonly label: string;
}

/** What the person can pick from, read from the destination's TaskNotes setup. */
export interface Vocabulary {
  readonly statuses: readonly (Choice & { readonly completed: boolean })[];
  readonly priorities: readonly Choice[];
  readonly defaultStatus?: string;
  readonly defaultPriority?: string;
  /** Known projects, contexts and tags, for suggestions. */
  readonly projects: readonly string[];
  readonly contexts: readonly string[];
  readonly tags: readonly string[];
}

/** Fields read from text such as "Call Sam tomorrow 3pm #work". */
export interface ParsedCapture {
  /** The title with the recognised parts taken out. */
  readonly title: string;
  readonly details?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly due?: string;
  readonly scheduled?: string;
  readonly tags: readonly string[];
  readonly contexts: readonly string[];
  readonly projects: readonly string[];
  readonly recurrence?: string;
  readonly timeEstimate?: number;
}

export interface CreatedTask {
  readonly title: string;
  readonly path: string;
  /** Where to open it, when there is a place to. */
  readonly openUrl?: string;
  /**
   * mdbase: settles when the collection's log confirms the task. The task is
   * already saved on this device and keeps syncing if the popup closes. Rejects
   * with a `TaskRefusedError` when mdbase refused the task, which is then not saved.
   */
  readonly confirmed?: Promise<void>;
}

/** Where tasks go: one TaskNotes collection or vault, ready to use. */
export interface TaskDestination {
  /** The collection's or vault's name. */
  readonly name: string;
  vocabulary(signal?: AbortSignal): Promise<Vocabulary>;
  parse(text: string, signal?: AbortSignal): Promise<ParsedCapture>;
  create(draft: TaskDraft, body: string, signal?: AbortSignal): Promise<CreatedTask>;
}

/** An error to show the person as it is, with what to do about it. */
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly action?: "settings" | "retry" | "open-app",
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

/** mdbase refused a task after it was saved on this device: it is not kept anywhere. */
export class TaskRefusedError extends CaptureError {
  constructor(reason: string) {
    super(`mdbase didn't accept this task, so it wasn't saved. ${reason}`, "retry");
    this.name = "TaskRefusedError";
  }
}
