/**
 * TypeScript declarations for browser polyfill
 */

declare global {
  const browser: typeof chrome;
}

export default browser;