/**
 * Build-time facts about this bundle (see scripts/build.mjs). Code that loads the
 * mdbase SDK tests `__TN_MDBASE__` itself rather than `build.mdbase`, so the bundler
 * drops the SDK from builds without it.
 */
export const build = {
  browser: __TN_BROWSER__,
  /** Whether this build can sign in to mdbase (Chrome builds). */
  mdbase: __TN_MDBASE__,
  mdbaseEnvironment: __TN_MDBASE_ENV__,
  /** Shared by every bundle of one build, so they use one mdbase session. */
  sessionBuild: __TN_SESSION_BUILD__,
  /** The TaskNotes web app for this mdbase environment. */
  appUrl: __TN_APP_URL__,
  mdbaseAppManifest: __TN_MDBASE_APP_MANIFEST__,
} as const;
