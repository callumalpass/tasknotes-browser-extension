import { describeError, type Mdbase, type MdbaseSnapshot } from "@mdbase-dev/sdk";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { CaptureError } from "../backends/backend";
import { appUrlFor } from "../backends/mdbase/destination";
import { joinMdbase, rememberCollection, rememberedCollection } from "../backends/mdbase/session";
import { readTaskNotesSetup } from "../backends/mdbase/tasks";

type Check =
  | { readonly state: "checking" }
  | { readonly state: "ok"; readonly typeName: string; readonly statuses: number }
  | { readonly state: "missing"; readonly message: string };

function message(error: unknown): string {
  if (error instanceof CaptureError) return error.message;
  return describeError(error)?.message ?? (error instanceof Error ? error.message : "Something went wrong. Try again.");
}

/** Sign in to mdbase and choose the collection tasks go to. */
export default function MdbasePanel() {
  const mdbase = useMemo<Mdbase>(() => joinMdbase("page"), []);
  const [snapshot, setSnapshot] = useState<MdbaseSnapshot>(() => mdbase.getSnapshot());
  /** undefined until read from storage. */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [password, setPassword] = useState("");
  /** The collection last opened automatically: once per choice, so a failure doesn't loop. */
  const opened = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setSnapshot(mdbase.getSnapshot());
    const unsubscribe = mdbase.subscribe(update);
    void rememberedCollection().then(setChosen);
    void mdbase.start().catch(() => undefined);
    update();
    return () => {
      unsubscribe();
      void mdbase.close().catch(() => undefined);
    };
  }, [mdbase]);

  const { phase, collections } = snapshot;

  // Open the chosen collection once the session is signed in and has nothing else open.
  useEffect(() => {
    // A session that already has a collection open, with none chosen here: keep that one.
    if (chosen === undefined) return;
    if (chosen === null && phase.kind === "ready") {
      setChosen(phase.collectionId);
      void rememberCollection(phase.collectionId);
      return;
    }
    if (!chosen || busy) return;
    if (phase.kind !== "choosing" && !(phase.kind === "ready" && phase.collectionId !== chosen)) return;
    if (!collections.some((item) => item.collectionId === chosen) || opened.current === chosen) return;
    opened.current = chosen;
    void run(() => mdbase.select(chosen));
  }, [chosen, phase, collections, busy]);

  // When the chosen collection is open, check it has TaskNotes' task type.
  const readyId = phase.kind === "ready" ? phase.collectionId : null;
  useEffect(() => {
    if (phase.kind !== "ready") {
      setCheck(null);
      return;
    }
    const scope = new AbortController();
    setCheck({ state: "checking" });
    readTaskNotesSetup(phase.connection.records, scope.signal).then(
      (setup) => {
        if (!scope.signal.aborted) {
          setCheck({ state: "ok", typeName: setup.typeName, statuses: setup.config.statuses.length });
        }
      },
      (error: unknown) => {
        if (!scope.signal.aborted) setCheck({ state: "missing", message: message(error) });
      },
    );
    return () => scope.abort();
  }, [readyId]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function choose(collectionId: string): Promise<void> {
    opened.current = null;
    setChosen(collectionId);
    await rememberCollection(collectionId);
  }

  if (phase.kind === "starting" || phase.kind === "closed") {
    return (
      <p class="status-line">
        <span class="spinner" aria-hidden="true" /> Starting mdbase…
      </p>
    );
  }

  if (phase.kind === "signed_out") {
    return (
      <div class="stack">
        {phase.notice ? <p class="notice">{phase.notice.message}</p> : null}
        <p class="supporting">
          Sign in with your mdbase account. You'll choose which collection the extension may add tasks to; it can
          read that collection and create tasks in it, nothing else.
        </p>
        <div>
          <button class="button primary" type="button" disabled={busy} onClick={() => void run(() => mdbase.signIn())}>
            Sign in to mdbase
          </button>
        </div>
        {problem ? <p class="notice error">{problem}</p> : null}
      </div>
    );
  }

  if (phase.kind === "authorizing") {
    // The person may have closed the mdbase tab: let them open it again, or give up.
    const reopen =
      phase.purpose === "add"
        ? () => mdbase.addCollection()
        : phase.purpose === "approve"
          ? () => mdbase.reauthorize()
          : () => mdbase.signIn();
    return (
      <div class="stack">
        <p class="status-line">
          <span class="spinner" aria-hidden="true" /> Finish in the mdbase tab, then come back here.
        </p>
        <div class="row">
          <button class="button" type="button" disabled={busy} onClick={() => void run(reopen)}>
            Open the mdbase tab again
          </button>
          <button class="button quiet" type="button" disabled={busy} onClick={() => void run(() => mdbase.signOut())}>
            Start over
          </button>
        </div>
        {problem ? <p class="notice error">{problem}</p> : null}
      </div>
    );
  }

  if (phase.kind === "unavailable") {
    return <p class="notice error">{phase.problem.message}</p>;
  }

  const openId = phase.kind !== "choosing" && "collectionId" in phase ? phase.collectionId : null;
  const selected = chosen ?? openId;

  return (
    <div class="stack">
      <fieldset class="collections">
        <legend>Add tasks to</legend>
        {collections.length ? (
          collections.map((collection) => (
            <label key={collection.collectionId} class="choice">
              <input
                type="radio"
                name="collection"
                checked={selected === collection.collectionId}
                disabled={busy || collection.role === "viewer"}
                onChange={() => void choose(collection.collectionId)}
              />
              <span>
                <strong>{collection.displayName}</strong>
                {collection.role === "viewer" ? <span class="muted"> · view only</span> : null}
                {collection.kind === "private" || collection.mode === "private" ? (
                  <span class="muted"> · Private</span>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p class="supporting">No collections yet. Add one to start.</p>
        )}
        <div class="row">
          <button class="button" type="button" disabled={busy} onClick={() => void run(() => mdbase.addCollection())}>
            Add a collection…
          </button>
        </div>
      </fieldset>

      <CollectionStatus
        snapshot={snapshot}
        check={check}
        busy={busy}
        password={password}
        onPassword={setPassword}
        run={run}
        mdbase={mdbase}
      />

      {problem ? <p class="notice error">{problem}</p> : null}

      <div class="row quiet-row">
        {snapshot.links?.account ? (
          <a href={snapshot.links.account} target="_blank" rel="noreferrer">
            Your mdbase account
          </a>
        ) : null}
        <button
          class="button quiet"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await mdbase.signOut();
              await rememberCollection(null);
              setChosen(null);
            })
          }
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function CollectionStatus(props: {
  snapshot: MdbaseSnapshot;
  check: Check | null;
  busy: boolean;
  password: string;
  onPassword: (value: string) => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
  mdbase: Mdbase;
}) {
  const { snapshot, check, busy, run, mdbase } = props;
  const { phase } = snapshot;
  switch (phase.kind) {
    case "choosing":
      return <p class="supporting">Choose the collection your tasks go to.</p>;
    case "opening":
      return (
        <p class="status-line">
          <span class="spinner" aria-hidden="true" /> Opening {phase.displayName ?? "the collection"}
          {phase.slow ? " (this is taking longer than usual)" : ""}…
        </p>
      );
    case "needs_approval":
      return (
        <div class="notice">
          <p>
            {phase.declined ? "You didn't allow" : "Allow"} the extension to add tasks to{" "}
            {phase.displayName ?? "this collection"}.
          </p>
          <button class="button primary" type="button" disabled={busy} onClick={() => void run(() => mdbase.approve(phase.collectionId))}>
            Allow in mdbase…
          </button>
        </div>
      );
    case "needs_unlock":
      return phase.mode === "password" ? (
        <form
          class="notice stack"
          onSubmit={(event) => {
            event.preventDefault();
            const secret = props.password;
            props.onPassword("");
            void run(() => mdbase.unlock(phase.collectionId, { password: secret }));
          }}
        >
          <p>{phase.displayName ?? "This collection"} is Private. Enter its encryption password to unlock it here.</p>
          {phase.problem ? <p class="error-text">{phase.problem.message}</p> : null}
          <div class="row">
            <input
              class="input"
              type="password"
              autocomplete="current-password"
              aria-label="Encryption password"
              value={props.password}
              onInput={(event) => props.onPassword(event.currentTarget.value)}
            />
            <button class="button primary" type="submit" disabled={busy || phase.unlocking || !props.password}>
              Unlock
            </button>
          </div>
        </form>
      ) : (
        <p class="notice">
          {phase.displayName ?? "This collection"} is Private and can only be unlocked on a computer running the
          mdbase app.
        </p>
      );
    case "needs_setup":
      return (
        <div class="notice">
          <p>{phase.collection.displayName} needs a one-time setup before the extension can use it.</p>
          <button class="button primary" type="button" disabled={busy} onClick={() => void run(() => mdbase.configure())}>
            Set up
          </button>
        </div>
      );
    case "problem":
      return (
        <div class="notice error">
          <p>{phase.problem.message}</p>
          <button class="button" type="button" disabled={busy} onClick={() => void run(() => recover(mdbase, phase.problem))}>
            {phase.problem.actionLabel ?? "Try again"}
          </button>
        </div>
      );
    case "ready":
      if (!check || check.state === "checking") {
        return (
          <p class="status-line">
            <span class="spinner" aria-hidden="true" /> Checking {phase.collection.displayName}…
          </p>
        );
      }
      if (check.state === "missing") {
        return (
          <div class="notice">
            <p>{check.message}</p>
            <a class="button" href={appUrlFor(phase.collectionId)} target="_blank" rel="noreferrer">
              Open TaskNotes
            </a>
          </div>
        );
      }
      return (
        <p class="notice success">
          Ready. New tasks go to <strong>{phase.collection.displayName}</strong>.
        </p>
      );
    default:
      return null;
  }
}

function recover(mdbase: Mdbase, problem: { action: string; updateUrl: string | null }): Promise<unknown> {
  switch (problem.action) {
    case "sign_in":
      return mdbase.signIn();
    case "approve":
      return mdbase.reauthorize();
    case "choose_collection":
      return mdbase.chooseAnother();
    case "set_up":
      return mdbase.configure();
    case "update_app":
      return chrome.tabs.create({ url: problem.updateUrl ?? "https://mdbase.dev/" });
    case "reload":
      location.reload();
      return Promise.resolve();
    default:
      return mdbase.start();
  }
}
