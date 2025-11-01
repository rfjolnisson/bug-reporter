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
    
    // Format stack trace from debugger
    let stackTrace = '';
    if (params.stackTrace && params.stackTrace.callFrames) {
      stackTrace = params.stackTrace.callFrames
        .slice(0, 10) // First 10 frames
        .map(frame => {
          const func = frame.functionName || '(anonymous)';
          const file = frame.url ? frame.url.split('/').pop() : 'unknown';
          const line = frame.lineNumber !== undefined ? frame.lineNumber : '?';
          const col = frame.columnNumber !== undefined ? frame.columnNumber : '?';
          return `  ${func} @ ${file}:${line}:${col}`;
        })
        .join('\n');
    }
    
    // Format arguments - extract full detail from objects
    const message = params.args.map(arg => {
      // Simple value (string, number, boolean)
      if (arg.value !== undefined) {
        return String(arg.value);
      }
      
      // Object with preview
      if (arg.preview) {
        let result = arg.preview.description || String(arg.type);
        
        // If object has properties, include them
        if (arg.preview.properties && arg.preview.properties.length > 0) {
          const props = arg.preview.properties.map(prop => {
            const val = prop.value && prop.value.value !== undefined 
              ? prop.value.value 
              : (prop.value && prop.value.description) || '...';
            return `${prop.name}: ${val}`;
          }).join(', ');
          result += ' {' + props + '}';
        }
        
        return result;
      }
      
      return String(arg);
    }).join(' ');
    
    const log = {
      level: params.type,
      message: message,
      timestamp: new Date(params.timestamp).toISOString(),
      url: params.stackTrace && params.stackTrace.callFrames[0] ? params.stackTrace.callFrames[0].url : '',
      stackTrace: stackTrace, // Include full stack trace
    };
    
    consoleLogsFromDebugger[tabId].push(log);
    
    // Debug: log to background console to verify capture
    if (log.message.includes('KAPTIO')) {
      console.log('📝 Captured KAPTIO log:', log.message.substring(0, 100));
    }
    
    // Keep only last 500 logs
    if (consoleLogsFromDebugger[tabId].length > 500) {
      consoleLogsFromDebugger[tabId].shift();
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentTabId') {
    // Return the sender's tab ID
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      // If no sender tab, get active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        sendResponse({ tabId: tabs[0] ? tabs[0].id : null });
      });
      return true;
    }
  }
  
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
  
  if (request.action === 'clearLogs') {
    // Clear console logs for a tab after submission
    const tabId = request.tabId;
    if (consoleLogsFromDebugger[tabId]) {
      console.log('🗑️ Clearing', consoleLogsFromDebugger[tabId].length, 'logs for tab', tabId);
      consoleLogsFromDebugger[tabId] = [];
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'captureScreenshot') {
    // Capture screenshot using Chrome API
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Screenshot capture error:', chrome.runtime.lastError);
        sendResponse({ screenshot: null });
      } else if (dataUrl) {
        console.log('✅ Screenshot captured, size:', dataUrl.length, 'bytes');
        sendResponse({ screenshot: dataUrl });
      } else {
        console.error('Screenshot capture returned null dataUrl');
        sendResponse({ screenshot: null });
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

// DISABLED: Debugger API causes Chrome notification
// We now rely on content script Proxy wrapper to capture all logs
// When tab is updated (refreshed), attach debugger
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
//     // Attach debugger early to capture all console logs
//     attachDebugger(tabId);
//   }
// });

console.log('🚀 Kaptio JIRA Reporter background worker loaded');

