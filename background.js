// Background service worker
console.log("AMZ Media Downloader Background Script Loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension successfully installed.");
});
