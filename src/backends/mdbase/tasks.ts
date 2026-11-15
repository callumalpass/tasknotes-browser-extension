import { uuidv7, type MdbaseClient } from "@mdbase-dev/sdk";
import { parseFrontmatter } from "@tasknotes/model/frontmatter";
import { mapTaskToFrontmatter } from "@tasknotes/model/mapping";
import {
  resolveTaskNotesModelConfigFromImplementation,
  TASKNOTES_CONTRACT_DIGEST,
  TASKNOTES_LEGACY_CONTRACT_DIGESTS,
} from "@tasknotes/model/mdbase";
import { updateToNextScheduledOccurrence } from "@tasknotes/model/recurrence";
import { TASKNOTES_SETTINGS_PATH } from "@tasknotes/model/settings";
import { TASKNOTES_SPEC_VERSION, type TaskInfo, type TaskNotesModelConfig } from "@tasknotes/model/types";

import { mergeTags, type TaskDraft } from "../../shared/draft";
import { CaptureError, TaskRefusedError } from "../backend";

import { pathCandidates, pathPattern, taskPath } from "./task-path";

/** The parts of an mdbase connection that capturing a task uses. */
export type TaskRecords = Pick<MdbaseClient, "describe" | "resources" | "find" | "create">;

/** How the collection's TaskNotes type is set up. */
export interface TaskNotesSetup {
  readonly typeName: string;
  readonly config: TaskNotesModelConfig;
  readonly pathPattern: string;
}

export const notSetUpMessage =
  "This collection isn't set up for TaskNotes yet. Open it once in TaskNotes, then try again.";

/** The tasknotes.task contracts TaskNotes reads, newest first (as the app does). */
const readableContracts = [
  { version: TASKNOTES_SPEC_VERSION, digest: TASKNOTES_CONTRACT_DIGEST },
  ...Object.entries(TASKNOTES_LEGACY_CONTRACT_DIGESTS).map(([version, digest]) => ({ version, digest })),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function plainObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value) as Record<string, unknown>;
  return isRecord(value) ? value : {};
}

/** Read the collection's TaskNotes task type, its field names, statuses and defaults. */
export async function readTaskNotesSetup(client: TaskRecords, signal?: AbortSignal): Promise<TaskNotesSetup> {
  const catalog = await client.describe({ signal });
  const contract = readableContracts
    .map((readable) =>
      catalog.contracts.find(
        (candidate) =>
          candidate.id === "tasknotes.task" &&
          candidate.version === readable.version &&
          candidate.digest === readable.digest,
      ),
    )
    .find((candidate) => candidate !== undefined);
  if (!contract) throw new CaptureError(notSetUpMessage, "open-app");
  const implementing = catalog.types.flatMap((type) => {
    const implementation = type.implements.find(
      (item) => item.contract === contract.id && item.version === contract.version,
    );
    return implementation ? [{ type, implementation }] : [];
  });
  // The type named "task" first, as the starter collection names it.
  const chosen = implementing.find(({ type }) => type.name === "task") ?? implementing[0];
  if (!chosen) throw new CaptureError(notSetUpMessage, "open-app");

  const [resource, settingsRecord] = await Promise.all([
    client.resources.get(chosen.type.path, { signal }),
    client.find({ path: TASKNOTES_SETTINGS_PATH }, { signal }).catch(() => null),
  ]);
  if (resource.text === undefined) {
    throw new CaptureError("mdbase didn't return the TaskNotes task type. Try again.", "retry");
  }
  const definition = parseFrontmatter(resource.text).frontmatter;
  const binding = plainObject(chosen.implementation.binding);
  const schema = isRecord(definition.schema) && isRecord(definition.schema.value) ? definition.schema.value : undefined;
  const settings = settingsRecord ? plainObject(settingsRecord.frontmatter) : undefined;
  const config = resolveTaskNotesModelConfigFromImplementation(
    { fields: plainObject(chosen.implementation.fields), binding, ...(schema ? { schema } : {}) },
    undefined,
    settings ? { settings } : {},
  );
  return {
    typeName: chosen.type.name,
    config,
    pathPattern: pathPattern(definition.collection, binding),
  };
}

/**
 * A timed Scheduled or Due date as the TaskNotes app stores it in mdbase: the instant,
 * in UTC (`2026-11-20T23:00:00Z`). mdbase refuses a time without a zone. Dates stay
 * as they are.
 */
export function storedDateTime(value: string | undefined): string | undefined {
  if (!value || /^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const instant = new Date(value);
  return Number.isNaN(instant.valueOf()) ? value : instant.toISOString().replace(".000Z", "Z");
}

function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A new task's record, by the collection's own TaskNotes rules. */
export function taskRecord(
  setup: TaskNotesSetup,
  draft: TaskDraft,
  context: { id: string; now: Date },
): { path: string; frontmatter: Record<string, unknown> } {
  const title = draft.title.trim();
  if (!title) throw new CaptureError("Give the task a title.");
  const { config } = setup;
  const now = context.now.toISOString();
  const today = localDate(context.now);
  const info: TaskInfo = {
    id: context.id,
    path: "",
    title,
    status: draft.status || config.defaults.status,
    priority: draft.priority || config.defaults.priority,
    due: draft.due,
    scheduled: draft.scheduled,
    tags: draft.tags.length ? mergeTags(draft.tags) : undefined,
    contexts: draft.contexts.length ? [...draft.contexts] : undefined,
    projects: draft.projects.length ? [...draft.projects] : undefined,
    recurrence: draft.recurrence,
    timeEstimate: draft.timeEstimate,
    dateCreated: now,
    dateModified: now,
    archived: false,
  };
  if (info.recurrence && !info.scheduled) {
    // As the app does: store the next planned occurrence, from today.
    info.scheduled =
      updateToNextScheduledOccurrence({ ...info, scheduled: today }, false, { today }).scheduled ?? undefined;
  }
  info.scheduled = storedDateTime(info.scheduled);
  info.due = storedDateTime(info.due);
  const completed = config.statuses.find((status) => status.value === info.status)?.isCompleted;
  if (!info.recurrence && completed) info.completedDate = today;
  const frontmatter = {
    ...mapTaskToFrontmatter(
      config.fieldMapping,
      info,
      config.defaults.taskTag,
      config.storeTitleInFilename,
      config.userFields,
    ),
    id: context.id,
  };
  return { path: taskPath(setup.pathPattern, frontmatter, title, context.id, context.now), frontmatter };
}

/** Create the task, at the next free name if its own is taken. */
export async function createTask(
  client: TaskRecords,
  setup: TaskNotesSetup,
  draft: TaskDraft,
  body: string,
  signal?: AbortSignal,
): Promise<{ path: string; confirmed: Promise<void> }> {
  const id = uuidv7();
  const record = taskRecord(setup, draft, { id, now: new Date() });
  for (const path of pathCandidates(record.path)) {
    if (await client.find({ path }, { signal })) continue;
    const write = await client.create({
      id,
      type: setup.typeName,
      path,
      frontmatter: record.frontmatter as Parameters<TaskRecords["create"]>[0]["frontmatter"],
      body,
    });
    const confirmed = write.confirmed.then(
      () => undefined,
      (error: unknown) => {
        if (write.state !== "rejected") throw error;
        const reason = error instanceof Error ? error.message : "";
        throw new TaskRefusedError(/would not be valid/u.test(reason) ? "It doesn't fit the collection's task type." : reason);
      },
    );
    return { path, confirmed };
  }
  throw new CaptureError("Every name for this task is taken. Change its title and try again.");
}
