import { useEffect, useState } from "preact/hooks";

import { CaptureError } from "../backends/backend";
import { checkObsidian } from "../backends/obsidian";
import { build } from "../env";
import {
  loadSettings,
  onSettingsChanged,
  parseTags,
  saveSettings,
  type BackendKind,
  type ExtensionSettings,
} from "../shared/settings";

import type { ComponentType } from "preact";

type ObsidianCheck =
  | { readonly state: "idle" }
  | { readonly state: "checking" }
  | { readonly state: "ok"; readonly vault: string }
  | { readonly state: "failed"; readonly message: string };

export function Options() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [MdbasePanel, setMdbasePanel] = useState<ComponentType | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);

  // The mdbase SDK loads only when it's the destination (and never in Firefox builds).
  useEffect(() => {
    if (!__TN_MDBASE__ || settings?.backend !== "mdbase" || MdbasePanel) return;
    void import("./MdbasePanel").then((module) => setMdbasePanel(() => module.default));
  }, [settings?.backend, MdbasePanel]);

  if (!settings) return null;

  const choose = (backend: BackendKind) => void saveSettings({ backend }).then(setSettings);

  return (
    <main class="options">
      <header class="options-header">
        <img src="/icons/tasknotes-icon-48.png" width="40" height="40" alt="" />
        <div>
          <h1>TaskNotes{build.mdbaseEnvironment === "production" ? "" : ` (${build.mdbaseEnvironment.toUpperCase()})`}</h1>
          <p class="supporting">Add tasks from any page, with the page linked and your selection quoted.</p>
        </div>
      </header>

      <section class="panel" aria-labelledby="destination-heading">
        <h2 id="destination-heading">Where tasks go</h2>
        <div class="backend-choices" role="radiogroup" aria-labelledby="destination-heading">
          <BackendChoice
            kind="mdbase"
            current={settings.backend}
            onChoose={choose}
            title="mdbase"
            description="Your TaskNotes collection in mdbase. Works without Obsidian running, and syncs to the TaskNotes app on every device."
            unavailable={build.mdbase ? undefined : "Signing in to mdbase needs Chrome, Edge or another Chromium browser for now."}
          />
          <BackendChoice
            kind="obsidian"
            current={settings.backend}
            onChoose={choose}
            title="Obsidian"
            description="Your vault, through the TaskNotes plugin's HTTP API. Obsidian needs to be open on this computer."
          />
        </div>

        {settings.backend === "mdbase" && __TN_MDBASE__ ? (
          <div class="backend-detail">{MdbasePanel ? <MdbasePanel /> : <p class="supporting">Loading…</p>}</div>
        ) : null}
        {settings.backend === "obsidian" ? (
          <div class="backend-detail">
            <ObsidianPanel settings={settings} />
          </div>
        ) : null}
      </section>

      <section class="panel" aria-labelledby="capture-heading">
        <h2 id="capture-heading">When you add a task from a page</h2>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.attachPage}
            onChange={(event) => void saveSettings({ attachPage: event.currentTarget.checked })}
          />
          <span>
            Link the page in the task's notes
            <span class="supporting block">You can still turn it off for one task in the popup.</span>
          </span>
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.quoteSelection}
            onChange={(event) => void saveSettings({ quoteSelection: event.currentTarget.checked })}
          />
          <span>Quote text you've selected on the page</span>
        </label>
        <TagsField tags={settings.extraTags} />
      </section>

      <section class="panel" aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading">Faster ways in</h2>
        <dl class="shortcuts">
          <dt>
            <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
          </dt>
          <dd>Open the popup on any page.</dd>
          <dt>Right-click</dt>
          <dd>Add a task from selected text, a link, or the page.</dd>
          <dt>
            <kbd>task</kbd> <kbd>Space</kbd> in the address bar
          </dt>
          <dd>
            Type a task, such as <q>call the bank friday 10am #admin</q>, and press Enter. It's added without opening
            anything.
          </dd>
        </dl>
        {build.browser === "chrome" ? (
          <button
            class="button quiet shortcuts-change"
            type="button"
            onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}
          >
            Change the shortcut
          </button>
        ) : null}
      </section>
    </main>
  );
}

function BackendChoice(props: {
  kind: BackendKind;
  current: BackendKind | null;
  onChoose: (kind: BackendKind) => void;
  title: string;
  description: string;
  unavailable?: string;
}) {
  const selected = props.current === props.kind;
  return (
    <label class={`backend-choice${selected ? " selected" : ""}${props.unavailable ? " unavailable" : ""}`}>
      <input
        type="radio"
        name="backend"
        checked={selected}
        disabled={!!props.unavailable}
        onChange={() => props.onChoose(props.kind)}
      />
      <span class="backend-title">{props.title}</span>
      <span class="supporting">{props.unavailable ?? props.description}</span>
    </label>
  );
}

function ObsidianPanel({ settings }: { settings: ExtensionSettings }) {
  const [port, setPort] = useState(String(settings.obsidian.port));
  const [token, setToken] = useState(settings.obsidian.token);
  const [showToken, setShowToken] = useState(false);
  const [check, setCheck] = useState<ObsidianCheck>({ state: "idle" });

  async function test(event: Event): Promise<void> {
    event.preventDefault();
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setCheck({ state: "failed", message: "The port is a number from 1 to 65535." });
      return;
    }
    const saved = await saveSettings({ obsidian: { port: portNumber, token: token.trim() } });
    setCheck({ state: "checking" });
    try {
      setCheck({ state: "ok", vault: await checkObsidian(saved.obsidian) });
    } catch (error) {
      setCheck({ state: "failed", message: error instanceof CaptureError ? error.message : String(error) });
    }
  }

  return (
    <form class="stack" onSubmit={(event) => void test(event)}>
      <ol class="steps supporting">
        <li>In Obsidian, open Settings → TaskNotes → Integrations.</li>
        <li>Turn on the HTTP API, and copy its port and API token here.</li>
      </ol>
      <div class="obsidian-fields">
        <label class="field">
          <span>Port</span>
          <input
            class="input"
            inputMode="numeric"
            value={port}
            onInput={(event) => {
              setPort(event.currentTarget.value);
              setCheck({ state: "idle" });
            }}
          />
        </label>
        <label class="field">
          <span>API token</span>
          <span class="token">
            <input
              class="input"
              type={showToken ? "text" : "password"}
              autocomplete="off"
              spellcheck={false}
              value={token}
              onInput={(event) => {
                setToken(event.currentTarget.value);
                setCheck({ state: "idle" });
              }}
            />
            <button class="button quiet" type="button" onClick={() => setShowToken(!showToken)}>
              {showToken ? "Hide" : "Show"}
            </button>
          </span>
        </label>
      </div>
      <div class="row">
        <button class="button primary" type="submit" disabled={check.state === "checking"}>
          {check.state === "checking" ? <span class="spinner" aria-hidden="true" /> : null}
          Save and connect
        </button>
        <span aria-live="polite">
          {check.state === "ok" ? (
            <span class="success-text">Connected to {check.vault}.</span>
          ) : check.state === "failed" ? (
            <span class="error-text">{check.message}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}

function TagsField({ tags }: { tags: readonly string[] }) {
  const [value, setValue] = useState(tags.join(", "));
  useEffect(() => setValue(tags.join(", ")), [tags]);
  return (
    <label class="field tags-field">
      <span>Tags for every task added here</span>
      <input
        class="input"
        placeholder="web, inbox"
        value={value}
        onInput={(event) => setValue(event.currentTarget.value)}
        onBlur={() => void saveSettings({ extraTags: parseTags(value) })}
      />
      <span class="hint">Optional. TaskNotes adds its own task tag as usual.</span>
    </label>
  );
}
