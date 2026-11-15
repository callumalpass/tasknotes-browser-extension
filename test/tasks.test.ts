import { buildTaskNotesMdbaseResources, TASKNOTES_CONTRACT_DIGEST } from "@tasknotes/model/mdbase";
import { describe, expect, it } from "vitest";

import { createTask, readTaskNotesSetup, taskRecord, type TaskRecords } from "../src/backends/mdbase/tasks";
import { emptyDraft, type TaskDraft } from "../src/shared/draft";

/** A collection set up by TaskNotes, as mdbase describes it, holding `occupied` paths. */
function collection(occupied: string[] = []) {
  const resources = buildTaskNotesMdbaseResources();
  const created: Parameters<TaskRecords["create"]>[0][] = [];
  const client = {
    describe: () =>
      Promise.resolve({
        types: [{ name: "task", path: resources.paths.type, implements: resources.type.implements }],
        contracts: [{ id: "tasknotes.task", version: "0.3.0-rc.6", digest: TASKNOTES_CONTRACT_DIGEST }],
      }),
    resources: { get: () => Promise.resolve({ state: "ready", text: resources.typeDocument }) },
    find: ({ path }: { path: string }) => Promise.resolve(occupied.includes(path) ? { path } : null),
    create: (input: Parameters<TaskRecords["create"]>[0]) => {
      created.push(input);
      return Promise.resolve({ confirmed: Promise.resolve() });
    },
  } as unknown as TaskRecords;
  return { client, created };
}

const draft = (fields: Partial<TaskDraft>): TaskDraft => ({ ...emptyDraft, ...fields });
const now = new Date(2026, 10, 15, 9, 30, 5);

describe("mdbase tasks", () => {
  it("writes a task the way the TaskNotes app does", async () => {
    const setup = await readTaskNotesSetup(collection().client);
    const record = taskRecord(
      setup,
      draft({ title: "Reply to Sam", due: "2026-11-20", tags: ["#work", "work"], projects: ["[[Launch]]"] }),
      { id: "0193-test", now },
    );
    expect(record.path).toBe("tasks/20261115093005.md");
    expect(record.frontmatter).toMatchObject({
      id: "0193-test",
      title: "Reply to Sam",
      status: "open",
      priority: "normal",
      due: "2026-11-20",
      projects: ["[[Launch]]"],
    });
    // The type matches records by their task tag.
    expect(record.frontmatter.tags).toEqual(expect.arrayContaining(["task", "work"]));
  });

  it("stores a timed date as an instant, which mdbase requires", async () => {
    const setup = await readTaskNotesSetup(collection().client);
    const record = taskRecord(setup, draft({ title: "Call", scheduled: "2026-11-20T10:00", due: "2026-11-21" }), {
      id: "c",
      now,
    });
    expect(record.frontmatter.scheduled).toBe(new Date(2026, 10, 20, 10, 0).toISOString().replace(".000Z", "Z"));
    expect(record.frontmatter.due).toBe("2026-11-21");
  });

  it("dates a completed task and schedules a recurring one", async () => {
    const setup = await readTaskNotesSetup(collection().client);
    const done = taskRecord(setup, draft({ title: "Done already", status: "done" }), { id: "a", now });
    expect(done.frontmatter.completedDate).toBe("2026-11-15");
    const weekly = taskRecord(setup, draft({ title: "Water plants", recurrence: "FREQ=WEEKLY;BYDAY=MO" }), {
      id: "b",
      now,
    });
    expect(weekly.frontmatter.scheduled).toBe("2026-11-16");
  });

  it("takes the next free name when a task's own is taken", async () => {
    const { client, created } = collection(["tasks/Pay rent.md"]);
    const setup = { ...(await readTaskNotesSetup(client)), pathPattern: "tasks/{{title}}" };
    const result = await createTask(client, setup, draft({ title: "Pay rent" }), "Body");
    expect(result.path).toBe("tasks/Pay rent-2.md");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: "task", path: "tasks/Pay rent-2.md", body: "Body" });
  });

  it("asks for setup when the collection has no TaskNotes type", async () => {
    const client = {
      describe: () => Promise.resolve({ types: [], contracts: [] }),
    } as unknown as TaskRecords;
    await expect(readTaskNotesSetup(client)).rejects.toMatchObject({ action: "open-app" });
  });
});
