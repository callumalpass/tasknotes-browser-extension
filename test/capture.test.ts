import { describe, expect, it } from "vitest";

import { taskPath } from "../src/backends/mdbase/task-path";
import { composeBody, mergeTags } from "../src/shared/draft";
import { interpretPage } from "../src/shared/page-context";
import { migrateLegacy } from "../src/shared/settings";

describe("capturing a page", () => {
  it("names a GitHub issue by its title and reference", () => {
    const page = interpretPage({
      url: "https://github.com/callumalpass/tasknotes/issues/2542",
      title: "Delete calendar events · Issue #2542 · callumalpass/tasknotes · GitHub",
      selection: "",
    });
    expect(page.suggestedTitle).toBe("Delete calendar events");
    expect(page.reference).toBe("callumalpass/tasknotes#2542");
  });

  it("drops a site name that repeats the address", () => {
    const page = (title: string, url: string) => interpretPage({ url, title, selection: "" }).suggestedTitle;
    expect(page("Fix the build - Stack Overflow", "https://stackoverflow.com/q/1")).toBe("Fix the build");
    expect(page("Ship it – Release notes", "https://example.com/")).toBe("Ship it – Release notes");
  });

  it("uses a short selection as the title, but not a long one", () => {
    const short = interpretPage({ url: "https://example.com/", title: "Example", selection: "Renew passport" });
    expect(short.suggestedTitle).toBe("Renew passport");
    const long = interpretPage({ url: "https://example.com/", title: "Example", selection: "One.\n\nTwo." });
    expect(long.suggestedTitle).not.toContain("Two");
  });

  it("puts notes, the quote and the source in the body, in that order", () => {
    expect(
      composeBody({
        details: "Call first.",
        quote: "Line one\nLine two",
        source: { url: "https://example.com/a b", title: "Example [draft]" },
      }),
    ).toBe("Call first.\n\n> Line one\n> Line two\n\nSource: [Example \\[draft\\]](<https://example.com/a b>)");
  });

  it("merges tags without duplicates or hashes", () => {
    expect(mergeTags(["#Work", "home"], ["work", "errand"])).toEqual(["Work", "home", "errand"]);
  });

  it("refuses a path pattern that escapes the collection", () => {
    expect(() => taskPath("tasks/{{title}}", {}, "../../etc", "id", new Date())).not.toThrow();
    expect(taskPath("tasks/{{title}}", {}, "a/../b", "id", new Date())).toBe("tasks/a-..-b.md");
    expect(() => taskPath("../{{id}}", {}, "x", "id", new Date())).toThrow();
  });
});

describe("settings from version 1", () => {
  it("keep the Obsidian connection and default tags", () => {
    expect(migrateLegacy({ apiPort: "8123", apiAuthToken: "secret", defaultTags: "web, #inbox" })).toMatchObject({
      backend: "obsidian",
      obsidian: { port: 8123, token: "secret" },
      extraTags: ["web", "inbox"],
    });
    expect(migrateLegacy({})).toBeNull();
  });
});
