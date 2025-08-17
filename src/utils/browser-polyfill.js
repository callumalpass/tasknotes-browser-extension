/**
 * Browser polyfill utility for cross-browser compatibility
 * 
 * This module provides a consistent interface across Chrome, Firefox, and Safari
 * by using the webextension-polyfill library when available, or falling back
 * to the native browser APIs.
 */

// Declare browser as global to avoid eslint errors
/* global browser */

let browserAPI;

if (typeof browser !== 'undefined') {
  // Firefox and other browsers that support the `browser` namespace
  browserAPI = browser;
} else if (typeof chrome !== 'undefined') {
  // Chrome uses the `chrome` namespace, but we'll use the polyfill
  // The polyfill is loaded as a content script before other scripts
  browserAPI = window.browser || chrome;
} else {
  // Fallback for environments where neither is available
  throw new Error('No browser API available');
}

export default browserAPI;