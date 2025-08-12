/**
 * Simple test background script to check if basic service worker works
 */

console.log('Test background script loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Test extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Test background received message:', request);
  sendResponse({ success: true, test: 'working' });
});