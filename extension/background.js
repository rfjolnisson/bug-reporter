/**
 * Background Service Worker for Kaptio JIRA Reporter
 * Handles communication between content script and popup
 * Uses Chrome DevTools Protocol to capture ALL console logs
 */

// Store captured data temporarily
let capturedData = {};

// Store console logs per tab using DevTools Protocol
let consoleLogsFromDebugger = {};

/**
 * Attach debugger to a tab to capture console logs
 */
async function attachDebugger(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Console.enable');
    
    console.log('✅ Debugger attached to tab', tabId);
    
    // Initialize console logs array for this tab
    if (!consoleLogsFromDebugger[tabId]) {
      consoleLogsFromDebugger[tabId] = [];
    }
  } catch (error) {
    console.error('Failed to attach debugger:', error);
  }
}

/**
 * Detach debugger from tab
 */
async function detachDebugger(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
    console.log('Debugger detached from tab', tabId);
  } catch (error) {
    // Already detached or tab closed
  }
}

// Listen for debugger events (console messages)
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const tabId = source.tabId;
    
    if (!consoleLogsFromDebugger[tabId]) {
      consoleLogsFromDebugger[tabId] = [];
    }
    
    const log = {
      level: params.type,
      message: params.args.map(arg => {
        if (arg.value !== undefined) {
          return String(arg.value);
        }
        if (arg.preview) {
          return arg.preview.description || String(arg);
        }
        return String(arg);
      }).join(' '),
      timestamp: new Date(params.timestamp).toISOString(),
      url: params.stackTrace && params.stackTrace.callFrames[0] ? params.stackTrace.callFrames[0].url : '',
    };
    
    consoleLogsFromDebugger[tabId].push(log);
    
    // Keep only last 500 logs
    if (consoleLogsFromDebugger[tabId].length > 500) {
      consoleLogsFromDebugger[tabId].shift();
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'attachDebugger') {
    // Popup requesting to attach debugger for console capture
    const tabId = request.tabId;
    attachDebugger(tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.action === 'getDebuggerLogs') {
    // Return console logs captured via debugger
    const tabId = request.tabId;
    const logs = consoleLogsFromDebugger[tabId] || [];
    sendResponse({ logs });
    return true;
  }
  
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
  delete consoleLogsFromDebugger[tabId];
  detachDebugger(tabId);
});

// When tab is updated (refreshed), attach debugger
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    // Attach debugger early to capture all console logs
    attachDebugger(tabId);
  }
});

console.log('🚀 Kaptio JIRA Reporter background worker loaded');

