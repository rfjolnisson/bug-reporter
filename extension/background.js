/**
 * Background Service Worker for Kaptio JIRA Reporter
 * Handles communication between content script and popup
 */

// Store captured data temporarily
let capturedData = {};

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    // Capture screenshot using Chrome API
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Screenshot capture error:', chrome.runtime.lastError);
        sendResponse({ screenshot: null });
      } else {
        console.log('✅ Screenshot captured, size:', dataUrl ? dataUrl.length : 0, 'bytes');
        sendResponse({ screenshot: dataUrl });
      }
    });
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'storeData') {
    // Store data from content script
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      capturedData[tabId] = {
        consoleLogs: request.consoleLogs || [],
        screenshot: request.screenshot || null,
        url: sender.tab.url,
        title: sender.tab.title,
        timestamp: Date.now()
      };
      
      console.log('📦 Stored data for tab', tabId, ':', capturedData[tabId].consoleLogs.length, 'logs');
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getData') {
    // Popup requesting data
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        const data = capturedData[tabId] || { consoleLogs: [], screenshot: null };
        sendResponse(data);
      } else {
        sendResponse({ consoleLogs: [], screenshot: null });
      }
    });
    return true; // Will respond asynchronously
  }
});

// Clean up old data when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedData[tabId];
});

console.log('🚀 Kaptio JIRA Reporter background worker loaded');

