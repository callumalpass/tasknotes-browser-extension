
import { CaptureError, type TaskDestination } from "./backend";
import { openObsidian } from "./obsidian";

import type { ExtensionSettings } from "../shared/settings";

export type DestinationState =
  | { readonly kind: "ready"; readonly destination: TaskDestination; close(): void }
  /** Nothing to save to until the person does something in settings. */
  | { readonly kind: "attention"; readonly message: string; close(): void };

const noop = () => {};

function attention(message: string, close = noop): DestinationState {
  return { kind: "attention", message, close };
}

/**
 * Open the destination the settings name. A page passes "page"; the service worker
 * passes "worker", which also opens mdbase's offscreen host itself.
 */
export async function openDestination(
  settings: ExtensionSettings,
  context: "page" | "worker",
  signal?: AbortSignal,
): Promise<DestinationState> {
  if (settings.backend === null) return attention("Choose where your tasks go.");
  if (settings.backend === "obsidian") {
    try {
      return { kind: "ready", destination: await openObsidian(settings.obsidian, signal), close: noop };
    } catch (error) {
      if (error instanceof CaptureError) return attention(error.message);
      throw error;
    }
  }
  if (!__TN_MDBASE__) return attention("This browser can't sign in to mdbase. Use Obsidian instead.");

  const [{ joinMdbase, openChosenCollection }, { mdbaseDestination }] = await Promise.all([
    import("./mdbase/session"),
    import("./mdbase/destination"),
  ]);
  const mdbase = joinMdbase(context);
  const close = () => void mdbase.close().catch(() => undefined);
  try {
    const phase = await openChosenCollection(mdbase, signal);
    switch (phase.kind) {
      case "ready":
        return {
          kind: "ready",
          destination: mdbaseDestination({
            id: phase.collectionId,
            displayName: phase.collection.displayName,
            records: phase.connection.records,
          }),
          close,
        };
      case "signed_out":
        return attention("Sign in to mdbase to add tasks.", close);
      case "authorizing":
        return attention("Finish signing in to mdbase in its tab.", close);
      case "choosing":
        return attention("Choose the collection your tasks go to.", close);
      case "needs_approval":
        return attention(`Allow the extension to use ${phase.displayName ?? "your collection"}.`, close);
      case "needs_unlock":
        return attention(`Unlock ${phase.displayName ?? "your collection"} to add tasks to it.`, close);
      case "needs_setup":
        return attention(`${phase.collection.displayName} needs setting up first.`, close);
      case "opening":
        return attention(`${phase.displayName ?? "Your collection"} is taking a while to open. Try again in a moment.`, close);
      case "problem":
      case "unavailable":
        return attention(phase.problem.message, close);
      default:
        return attention("mdbase is still starting. Try again in a moment.", close);
    }
  } catch (error) {
    close();
    throw error;
  }
}
