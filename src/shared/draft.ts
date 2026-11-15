/** A task as the person is writing it, before it is saved anywhere. */
export interface TaskDraft {
  readonly title: string;
  readonly status?: string;
  readonly priority?: string;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
  readonly due?: string;
  readonly scheduled?: string;
  readonly tags: readonly string[];
  readonly contexts: readonly string[];
  readonly projects: readonly string[];
  /** An RRULE, from text such as "every Monday". */
  readonly recurrence?: string;
  /** Minutes. */
  readonly timeEstimate?: number;
  /** What the person wrote for the task's body. */
  readonly details: string;
}

/** Where a task came from: linked once in its body, never in the person's own text. */
export interface CaptureSource {
  readonly url: string;
  readonly title: string;
}

export const emptyDraft: TaskDraft = { title: "", tags: [], contexts: [], projects: [], details: "" };

const dateOnly = /^\d{4}-\d{2}-\d{2}$/u;
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

/** A date field's value from a date and an optional time; time without a date is dropped. */
export function joinDateTime(date: string, time: string): string | undefined {
  if (!dateOnly.test(date)) return undefined;
  return /^\d{2}:\d{2}$/u.test(time) ? `${date}T${time}` : date;
}

export function splitDateTime(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  if (dateTime.test(value)) return { date: value.slice(0, 10), time: value.slice(11, 16) };
  return { date: dateOnly.test(value) ? value : "", time: "" };
}

function escapeLinkText(text: string): string {
  return text.replace(/([[\]\\])/gu, "\\$1").replace(/\s+/gu, " ").trim();
}

/**
 * The task's body: the person's details, then the quoted selection, then one link to
 * the page. Each part appears only when present, so turning "Link this page" off
 * really leaves the link out, and the link is never written twice.
 */
export function composeBody(input: {
  details: string;
  quote?: string | null;
  source?: CaptureSource | null;
}): string {
  const parts: string[] = [];
  const details = input.details.trim();
  if (details) parts.push(details);
  const quote = input.quote?.trim();
  if (quote) {
    parts.push(
      quote
        .split(/\r?\n/u)
        .map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">"))
        .join("\n"),
    );
  }
  if (input.source) {
    const label = escapeLinkText(input.source.title) || input.source.url;
    parts.push(`Source: [${label}](<${input.source.url}>)`);
  }
  return parts.join("\n\n");
}

/** Merge tags without duplicates, keeping their first spelling. */
export function mergeTags(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of lists.flat()) {
    const clean = tag.trim().replace(/^#/u, "");
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
  }
  return [...seen.values()];
}
