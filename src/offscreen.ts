import { createMdbase } from "@mdbase-dev/sdk";

import { extensionDeclaration, sessionBuild } from "./backends/mdbase/declaration";

// The one context that runs the mdbase SDK's Worker for the extension. It has no UI:
// pages and the service worker join its session, and open sign-in themselves.
const mdbase = createMdbase(extensionDeclaration(), {
  session: { build: sessionBuild },
  followVisibility: false,
  urlSelection: false,
});
mdbase.setForeground(false);
void mdbase.start().catch(() => undefined);
