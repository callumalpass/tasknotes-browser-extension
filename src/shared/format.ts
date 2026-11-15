/** Short, readable labels for parsed fields, shown as chips under the title. */

const weekdays: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

function localDay(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "Today", "Tomorrow", "Fri 21 Nov", or "21 Nov 2027"; with ", 15:00" when timed. */
export function formatDate(value: string, now = new Date(), locale?: string): string {
  const [date = "", time] = value.split("T");
  const day = localDay(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  let label: string;
  if (difference === 0) label = "Today";
  else if (difference === 1) label = "Tomorrow";
  else if (difference === -1) label = "Yesterday";
  else if (difference > 1 && difference < 7) label = day.toLocaleDateString(locale, { weekday: "long" });
  else
    label = day.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
  return time ? `${label}, ${time}` : label;
}

/** "Every week on Monday", "Every 2 days", ... or the rule itself when it's unusual. */
export function formatRecurrence(rule: string): string {
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/u, "")
      .split(";")
      .map((part) => part.split("=") as [string, string]),
  );
  const interval = Number(parts.INTERVAL ?? 1);
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[parts.FREQ as string];
  if (!unit) return rule;
  let label = interval > 1 ? `Every ${interval} ${unit}s` : `Every ${unit}`;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(",")
      .map((day) => weekdays[day.slice(-2)] ?? day);
    if (unit === "week" && interval === 1 && days.length === 5 && !days.includes("Saturday") && !days.includes("Sunday")) {
      return "Every weekday";
    }
    label += ` on ${days.join(", ")}`;
  } else if (parts.BYMONTHDAY) {
    label += ` on day ${parts.BYMONTHDAY}`;
  }
  return label;
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** A project or context as written, without wikilink brackets. */
export function linkLabel(value: string): string {
  const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/u.exec(value.trim());
  if (!match) return value;
  const target = match[1] ?? value;
  return match[2] ?? (target.split("/").pop() ?? target).replace(/\.md$/u, "");
}

/** A URL for display: host and path, without the scheme. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}
