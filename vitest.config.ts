import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __TN_BROWSER__: JSON.stringify("chrome"),
    __TN_MDBASE__: "true",
    __TN_MDBASE_ENV__: JSON.stringify("lab"),
    __TN_SESSION_BUILD__: JSON.stringify("tasknotes-extension-test"),
    __TN_APP_URL__: JSON.stringify("https://lab.tasknotes-app.pages.dev"),
    __TN_MDBASE_APP_MANIFEST__: JSON.stringify({ id: "dev.tasknotes.browser-extension", name: "TaskNotes browser extension" }),
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
