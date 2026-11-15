import { describeError } from "@mdbase-dev/sdk";

import { build } from "../../env";
import { CaptureError } from "../backend";

import { captureParser } from "./parse";
import { createTask, readTaskNotesSetup, type TaskNotesSetup, type TaskRecords } from "./tasks";

import type { TaskDestination, Vocabulary } from "../backend";

/** The TaskNotes web app, opened on this collection. */
export function appUrlFor(collectionId: string): string {
  const url = new URL(build.appUrl);
  url.searchParams.set("collection", collectionId);
  return url.toString();
}

/** mdbase's own wording for its errors, with what to do. */
function plainError(error: unknown): unknown {
  if (error instanceof CaptureError || (error instanceof DOMException && error.name === "AbortError")) return error;
  const description = describeError(error);
  return description ? new CaptureError(description.message, "retry") : error;
}

/** Tasks go to an mdbase collection through the extension's SDK session. */
export function mdbaseDestination(connection: {
  readonly id: string;
  readonly displayName: string;
  readonly records: TaskRecords;
}): TaskDestination {
  let setup: Promise<TaskNotesSetup> | null = null;
  let parse: ((text: string) => ReturnType<ReturnType<typeof captureParser>>) | null = null;
  // Shared by every caller, so one caller giving up (a keystroke's parse) doesn't cancel it.
  const loadSetup = () => {
    setup ??= readTaskNotesSetup(connection.records).catch((error: unknown) => {
      setup = null;
      throw plainError(error);
    });
    return setup;
  };
  return {
    name: connection.displayName,
    async vocabulary(): Promise<Vocabulary> {
      const { config } = await loadSetup();
      return {
        statuses: config.statuses.map((status) => ({
          value: status.value,
          label: status.label || status.value,
          completed: status.isCompleted,
        })),
        priorities: config.priorities.map((priority) => ({
          value: priority.value,
          label: priority.label || priority.value,
        })),
        defaultStatus: config.defaults.status,
        defaultPriority: config.defaults.priority,
        projects: [],
        contexts: [],
        tags: [],
      };
    },
    async parse(text) {
      if (!parse) parse = captureParser((await loadSetup()).config);
      return parse(text);
    },
    async create(draft, body, signal) {
      const created = await createTask(connection.records, await loadSetup(), draft, body, signal).catch(
        (error: unknown) => {
          throw plainError(error);
        },
      );
      return {
        title: draft.title,
        path: created.path,
        openUrl: appUrlFor(connection.id),
        confirmed: created.confirmed,
      };
    },
  };
}
