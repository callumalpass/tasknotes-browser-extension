/**
 * Where a new task's file goes, by the same rules as the TaskNotes app
 * (tasknotes-app src/domain/task-path-policy.ts and src/storage/tasknotes-collection.ts),
 * so a task captured here is named like one created there.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/gu, "");
}

/** The folder tasks live in, from the type's `collection.path`. */
export function recordsFolder(collection: unknown): string {
  const path = isRecord(collection) ? collection.path : undefined;
  if (!isRecord(path)) return "tasks";
  if (typeof path.folder === "string" && path.folder.trim()) return path.folder;
  const pattern = path.pattern ?? path.template;
  if (typeof pattern !== "string") return "tasks";
  const marker = pattern.search(/\{[^}]+\}/u);
  const prefix = (marker < 0 ? pattern : pattern.slice(0, marker)).replace(/\/+$/gu, "").trim();
  return prefix || "tasks";
}

/** The type's own path pattern, or the one its TaskNotes binding's title settings imply. */
export function pathPattern(collection: unknown, binding: unknown): string {
  const path = isRecord(collection) ? collection.path : undefined;
  if (isRecord(path)) {
    const pattern = path.pattern ?? path.template;
    if (typeof pattern === "string" && pattern.trim()) {
      const template = pattern.trim().replace(/^\/+/u, "");
      const folder = typeof path.folder === "string" ? trimSlashes(path.folder.trim()) : "";
      if (!folder || template === folder || template.startsWith(`${folder}/`)) return template;
      return `${folder}/${template}`;
    }
  }
  const title = isRecord(binding) && isRecord(binding.title) ? binding.title : {};
  const format = title.storage === "filename" ? "title" : title.filename_format;
  const custom = typeof title.custom_filename_template === "string" ? title.custom_filename_template.trim() : "";
  const template =
    format === "title"
      ? "{{title}}"
      : format === "timestamp"
        ? "{{timestamp}}"
        : format === "uuid"
          ? "{{uuid}}"
          : format === "custom" && custom
            ? custom
            : "{{zettel}}";
  return `${trimSlashes(recordsFolder(collection)) || "tasks"}/${template}`;
}

function pathValues(frontmatter: Record<string, unknown>, title: string, id: string, now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = String(now.getFullYear());
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? [];
  const capitalize = (word: string) => `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1).toLocaleLowerCase()}`;
  const scalar = (value: unknown) =>
    typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const priority = scalar(frontmatter.priority);
  const status = scalar(frontmatter.status);
  return {
    ...frontmatter,
    id,
    uuid: id,
    title,
    titleKebab: words.map((word) => word.toLocaleLowerCase()).join("-"),
    titleSnake: words.map((word) => word.toLocaleLowerCase()).join("_"),
    titleCamel: words
      .map((word, index) => (index ? capitalize(word) : word.toLocaleLowerCase()))
      .join(""),
    titlePascal: words.map(capitalize).join(""),
    titleUpper: title.toLocaleUpperCase(),
    titleLower: title.toLocaleLowerCase(),
    priority,
    priorityShort: priority.slice(0, 3).toLocaleLowerCase(),
    status,
    statusShort: status.slice(0, 3).toLocaleLowerCase(),
    dueDate: scalar(frontmatter.due),
    scheduledDate: scalar(frontmatter.scheduled),
    year,
    month,
    day,
    date: `${year}-${month}-${day}`,
    shortDate: `${year}${month}${day}`,
    time,
    timestamp: `${year}${month}${day}${time}`,
    zettel: `${year}${month}${day}${time}`,
  } as Record<string, unknown>;
}

function sanitize(value: string): string {
  return value
    .replace(/[\p{Cc}<>:"|?*]/gu, "")
    .replace(/[\\/]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\/+/u, "");
  const parts = normalized.split("/");
  if (
    !normalized ||
    value.trim().startsWith("/") ||
    normalized.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("The collection's task path pattern makes an unsafe path.");
  }
  return /\.md$/iu.test(normalized) ? normalized : `${normalized}.md`;
}

/** The path for a new task from its pattern. */
export function taskPath(
  pattern: string,
  frontmatter: Record<string, unknown>,
  title: string,
  id: string,
  now: Date,
): string {
  const values = pathValues(frontmatter, title, id, now);
  const expanded = pattern.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/gu, (_match, double?: string, single?: string) => {
    const key = double ?? single ?? "";
    const value = values[key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      throw new Error(`The collection names tasks by "${key}", which this task doesn't have.`);
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`The collection names tasks by "${key}", which isn't a single value.`);
    }
    return sanitize(String(value));
  });
  return normalizePath(expanded);
}

/** The path, then `-2`, `-3`, ... as TaskNotes does when a name is taken. */
export function* pathCandidates(path: string): Generator<string> {
  yield path;
  const extension = /\.md$/iu.test(path) ? ".md" : "";
  const stem = extension ? path.slice(0, -extension.length) : path;
  for (let index = 2; index < 1000; index++) yield `${stem}-${index}${extension}`;
}
