import { createTaskParser, type TaskDate, type TriggerOptions } from "tasknotes-nlp-core";

import { joinDateTime } from "../../shared/draft";

import type { ParsedCapture } from "../backend";
import type { TaskNotesModelConfig } from "@tasknotes/model/types";

const triggerFor: Record<string, keyof TriggerOptions> = {
  tags: "tag",
  contexts: "context",
  projects: "project",
  status: "status",
  priority: "priority",
};

/** The collection's trigger characters (from its TaskNotes settings), over the parser's defaults. */
export function parserTriggers(config: TaskNotesModelConfig): TriggerOptions {
  const triggers: TriggerOptions = {};
  for (const item of config.nlp?.triggers ?? []) {
    const key = triggerFor[item.propertyId];
    if (key) triggers[key] = item.enabled && item.trigger ? item.trigger : false;
  }
  return triggers;
}

function dateField(value: TaskDate | undefined): string | undefined {
  return value ? joinDateTime(value.date, value.time ?? "") : undefined;
}

/** A parser for this collection's statuses, priorities and triggers. */
export function captureParser(config: TaskNotesModelConfig, language = navigator.language) {
  const parser = createTaskParser({
    language,
    statuses: config.statuses.map((status) => ({
      value: status.value,
      label: status.label,
      completed: status.isCompleted,
    })),
    priorities: config.priorities.map((priority) => ({ value: priority.value, label: priority.label })),
    triggers: parserTriggers(config),
  });
  return (text: string): ParsedCapture => {
    const { task } = parser.parse(text);
    return {
      title: task.title,
      details: task.details,
      status: task.status,
      priority: task.priority,
      due: dateField(task.due),
      scheduled: dateField(task.scheduled),
      tags: task.tags,
      contexts: task.contexts,
      projects: task.projects,
      recurrence: task.recurrence,
      timeEstimate: task.estimate,
    };
  };
}
