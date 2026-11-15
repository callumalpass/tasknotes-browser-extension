/** What the extension reads from a page, only when the person opens it there. */
export interface RawPage {
  readonly url: string;
  readonly title: string;
  readonly selection: string;
  /** Gmail's open conversation subject, when there is one. */
  readonly mailSubject?: string;
}

export type PageKind = "github-issue" | "github-pull" | "mail" | "page";

export interface PageContext {
  readonly kind: PageKind;
  readonly url: string;
  /** The page's title, tidied for a link. */
  readonly title: string;
  readonly selection: string;
  /** A starting title for the task; the person types over it. */
  readonly suggestedTitle: string;
  /** A short reference shown beside the source, such as `owner/repo#12`. */
  readonly reference?: string;
}

/**
 * Runs in the page (through `chrome.scripting.executeScript`), so it must not use
 * anything from the module around it.
 */
export function readPage(): RawPage {
  const selection = (window.getSelection()?.toString() ?? "").trim().slice(0, 4000);
  let mailSubject: string | undefined;
  if (location.hostname === "mail.google.com") {
    const heading = document.querySelector<HTMLElement>("h2[data-thread-perm-id], h2.hP");
    mailSubject = heading?.innerText.trim() || undefined;
  } else if (/^outlook\.(live|office|office365)\.com$/u.test(location.hostname)) {
    const heading = document.querySelector<HTMLElement>(
      '[role="main"] [role="heading"][aria-level="2"], [role="main"] h2',
    );
    mailSubject = heading?.innerText.trim() || undefined;
  }
  return { url: location.href, title: document.title, selection, mailSubject };
}

const githubTitle = /^(.*) · (?:Issue|Pull Request) #(\d+) · ([^·]+?)(?: · GitHub)?$/u;
const githubPath = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/u;
const gmailTitle = /^(.*?) - [^-]+@[^-]+ - (?:[^-]+ - )?Gmail$/u;

/** A selection short enough to be the task's title rather than a quote. */
function titleLikeSelection(selection: string): string | null {
  const text = selection.replace(/\s+/gu, " ").trim();
  return text && text.length <= 140 && !selection.includes("\n\n") ? text : null;
}

const squash = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The title without a trailing site name that repeats the address, as in
 * "Fix the build - Stack Overflow" on stackoverflow.com.
 */
function withoutSiteName(title: string, hostname: string | undefined): string {
  const match = /^(.+?)\s+[-–—|·]\s+([^-–—|·]+)$/u.exec(title);
  if (!match?.[1] || !match[2] || !hostname) return title;
  const site = squash(match[2]);
  const host = squash(hostname.replace(/^www\./u, ""));
  return site.length >= 3 && host.includes(site) ? match[1].trim() : title;
}

export function interpretPage(raw: RawPage): PageContext {
  const url = raw.url;
  const title = raw.title.replace(/\s+/gu, " ").trim();
  const selection = raw.selection.trim();
  const selected = titleLikeSelection(selection);
  let parsed: URL | null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (parsed?.hostname === "github.com") {
    const path = githubPath.exec(parsed.pathname);
    if (path) {
      const [, owner, repo, section, number] = path;
      const match = githubTitle.exec(title);
      const issueTitle = match?.[1]?.trim() || title;
      return {
        kind: section === "pull" ? "github-pull" : "github-issue",
        url: `https://github.com/${owner}/${repo}/${section}/${number}`,
        title: issueTitle,
        selection,
        suggestedTitle: selected ?? issueTitle,
        reference: `${owner}/${repo}#${number}`,
      };
    }
  }

  if (raw.mailSubject) {
    return {
      kind: "mail",
      url,
      title: raw.mailSubject,
      selection,
      suggestedTitle: selected ?? raw.mailSubject,
    };
  }
  if (parsed?.hostname === "mail.google.com") {
    const subject = gmailTitle.exec(title)?.[1]?.trim();
    // Only an open conversation has its own address (#inbox/<id>).
    const inThread = /\/[A-Za-z0-9]{16,}$/u.test(parsed.hash);
    if (subject && inThread) {
      return { kind: "mail", url, title: subject, selection, suggestedTitle: selected ?? subject };
    }
  }

  return {
    kind: "page",
    url,
    title: title || url,
    selection,
    suggestedTitle: selected ?? withoutSiteName(title, parsed?.hostname),
  };
}

/** Pages the extension cannot read or link usefully. */
export function isCapturableUrl(url: string | undefined): boolean {
  return !!url && /^(https?|file):/u.test(url);
}
