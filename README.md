# TaskNotes browser extension

Capture tasks from any web page into [TaskNotes](https://tasknotes.dev/): your mdbase
collection, or the Obsidian vault the TaskNotes plugin runs in.

- **Quick add.** Click the toolbar button or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>,
  type a task the way you would in TaskNotes (`Reply to Sam tomorrow 3pm #work @email +Launch`),
  and press <kbd>Enter</kbd>. Dates, tags, contexts, projects, priority and recurrence are
  read as you type and shown before you save.
- **From the page.** The task links back to the page it came from. GitHub issues and pull
  requests, and Gmail and Outlook messages, suggest their own title; a short selection
  becomes the title and a longer one is quoted in the task's notes.
- **Right-click.** Add a task from selected text, a link or the page itself.
- **Address bar.** Type `task`, a space, then the task, and press <kbd>Enter</kbd>.
- **Drafts are kept.** If the popup closes before you save, what you typed is still there
  when you open it again on the same page.

## Where tasks go

Choose in the extension's settings (right-click the toolbar button → Options).

### mdbase (Chrome, Edge and other Chromium browsers)

Sign in to mdbase, pick a collection, and allow the extension to use it. Tasks are created
in the collection's TaskNotes task type, named and filled in the same way the TaskNotes
app does it, and they sync to every device. The collection must already be set up for
TaskNotes: open it once in [the TaskNotes app](https://app.tasknotes.dev/) first.

The extension asks mdbase only to read the collection (to learn its statuses, priorities
and naming rules) and to create records.

Firefox can't sign in to mdbase yet, so the Firefox build offers Obsidian only.

### Obsidian

Uses the HTTP API of the TaskNotes plugin on this computer. Obsidian must be running.

1. In Obsidian, open **Settings → TaskNotes → Integrations → HTTP API**, turn it on and set
   an API token. Note the port (8080 by default).
2. In the extension's settings choose **Obsidian**, enter the port and token, and click
   **Save and connect**.

Natural-language parsing, statuses, priorities, projects and templates come from the
plugin, so tasks match ones you create in Obsidian.

## Install

- Chrome Web Store: [TaskNotes](https://chromewebstore.google.com/detail/kcbplgbcleppckifepdciipecjhdmchh)
- GitHub: download a zip from the [latest release](https://github.com/callumalpass/tasknotes-browser-extension/releases/latest),
  unzip it, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
  and pick the folder. In Firefox, open `about:debugging#/runtime/this-firefox` and load
  `manifest.json` from the Firefox zip as a temporary add-on.

Upgrading from version 1 keeps your Obsidian port, token and default tags. The buttons
version 1 added inside Gmail, Outlook and GitHub are gone: open the popup on those pages
instead, which fills in the subject or issue title.

## Development

Requires Node 22.

```sh
npm install
npm run build            # dist/chrome and dist/firefox
npm run check            # typecheck, lint, tests and builds
npm run package          # zips in dist/ for the stores and releases
```

Load `dist/chrome` (or `dist/firefox/manifest.json`) unpacked to try a build.

Build variants:

| Command | Output | Use |
| --- | --- | --- |
| `npm run build` | `dist/chrome`, `dist/firefox` | Store builds against production mdbase |
| `TASKNOTES_DEV_KEY=1 npm run build:chrome` | `dist/chrome-dev` | Unpacked Chrome build with a fixed ID, against production |
| `MDBASE_ENV=lab npm run build:chrome` | `dist/chrome-lab` | Unpacked Chrome build against mdbase LAB |

mdbase only accepts sign-in from extension IDs listed in the extension's mdbase app
manifest (`scripts/manifest.mjs`). Store builds use the Chrome Web Store ID; development
and LAB builds carry a public key so they always load as
`bpcblaeaghagohijhhghbbeniecjflhg`.

### How it fits together

- `src/popup/`: the capture popup (Preact).
- `src/options/`: settings, including mdbase sign-in and collection choice.
- `src/background.ts`: the service worker: context menus, the `task` address-bar keyword
  and notifications.
- `src/backends/obsidian.ts`: the TaskNotes plugin's HTTP API.
- `src/backends/mdbase/`: mdbase. The SDK runs its worker in an offscreen document
  (`offscreen.html`), which the service worker opens on demand and every extension page
  shares. `tasks.ts` and `task-path.ts` create tasks by the collection's TaskNotes rules,
  using `@tasknotes/model` and `tasknotes-nlp-core`.

## License

MIT
