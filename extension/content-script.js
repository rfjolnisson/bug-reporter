/**
 * Content Script - Captures console logs from the page
 * Injected into all pages to monitor console activity
 */

(function() {
  'use strict';

  // Store captured console logs
  const consoleLogs = [];
  
  // Store native console methods (grab them as early as possible)
  // We'll use these as fallbacks and for apply() calls
  const nativeConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
    clear: console.clear,
  };

  /**
   * Safely convert argument to string
   */
  function argToString(arg) {
    if (typeof arg === 'object' && arg !== null) {
      try {
        // Try to extract preview if available (from debugger-style logs)
        if (arg.preview && arg.preview.properties) {
          const props = arg.preview.properties.map(p => `${p.name}: ${p.value || JSON.stringify(p.value)}`).join(', ');
          return `{${props}}`;
        }
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }

  /**
   * Create a wrapper function that intercepts console calls
   * This uses apply() pattern to ensure we catch calls even through framework wrappers
   */
  function createConsoleWrapper(methodName, nativeMethod) {
    return function(...args) {
      // Extract stack trace
      const stack = new Error().stack;
      let stackTrace = '';
      if (stack) {
        const lines = stack.split('\n').slice(2, 12); // Skip first 2 lines (Error, this function)
        stackTrace = lines.map(line => '  ' + line.trim()).join('\n');
      }
      
      // Capture the log with stack trace BEFORE calling native method
      const logEntry = {
        level: methodName,
        message: args.map(argToString).join(' '),
        timestamp: new Date().toISOString(),
        url: window.location.href,
        stackTrace: stackTrace,
      };
      
      consoleLogs.push(logEntry);
      
      // Keep only last 500 logs to avoid memory issues
      if (consoleLogs.length > 500) {
        consoleLogs.shift();
      }
      
      // Call native console method using apply() to preserve context
      // This ensures the log actually appears in the console
      try {
        if (nativeMethod && typeof nativeMethod === 'function') {
          nativeMethod.apply(console, args);
        } else if (console[methodName] && typeof console[methodName] === 'function') {
          // Fallback to current console method if native is not available
          console[methodName].apply(console, args);
        }
      } catch (e) {
        // Silently fail if console method call fails
      }
    };
  }

  /**
   * Override console methods using Object.defineProperty for persistence
   * Option 2: console.log.apply wrapper pattern with periodic re-application
   */
  function initConsoleCapture() {
    const methods = ['log', 'warn', 'error', 'info', 'debug'];
    
    function applyOverrides() {
      methods.forEach((method) => {
        try {
          // Get current console method (might be Salesforce's override)
          const currentMethod = console[method];
          
          // Create wrapper that intercepts calls
          const wrapper = createConsoleWrapper(method, currentMethod || nativeConsole[method]);
          
          // Use Object.defineProperty to make it persistent
          // configurable: true allows it to be replaced, but we'll re-apply
          Object.defineProperty(console, method, {
            value: wrapper,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          // If defineProperty fails, try direct assignment
          console[method] = createConsoleWrapper(method, console[method] || nativeConsole[method]);
        }
      });
      
      // Override console.clear
      try {
        const clearWrapper = function() {
          consoleLogs.push({
            level: 'info',
            message: '[Console was cleared]',
            timestamp: new Date().toISOString(),
            url: window.location.href,
          });
          
          try {
            if (nativeConsole.clear) {
              nativeConsole.clear.call(console);
            } else if (console.clear) {
              console.clear.call(console);
            }
          } catch (e) {
            // Silently fail
          }
        };
        
        Object.defineProperty(console, 'clear', {
          value: clearWrapper,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (e) {
        // Fallback
        console.clear = function() {
          consoleLogs.push({
            level: 'info',
            message: '[Console was cleared]',
            timestamp: new Date().toISOString(),
            url: window.location.href,
          });
          if (nativeConsole.clear) nativeConsole.clear.call(console);
        };
      }
    }
    
    // Apply overrides immediately
    applyOverrides();
    
    // Re-apply overrides periodically to catch Salesforce's late initialization
    // Check every 500ms for the first 10 seconds, then every 2 seconds
    let checkCount = 0;
    const reapplyInterval = setInterval(() => {
      checkCount++;
      
      // Check if our override is still in place
      const needsReapply = methods.some(method => {
        const current = console[method];
        // If the method doesn't have our wrapper signature, it might have been replaced
        // We can't perfectly detect this, so we'll just re-apply periodically
        return false; // We'll re-apply anyway for safety
      });
      
      // Re-apply overrides (every time for first 10 seconds, then less frequently)
      if (checkCount <= 20 || checkCount % 4 === 0) {
        applyOverrides();
      }
      
      // Stop after 5 minutes (safety limit)
      if (checkCount > 600) {
        clearInterval(reapplyInterval);
      }
    }, 500);
    
    // Also re-apply on DOM mutations (Salesforce loads dynamically)
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        applyOverrides();
      });
      
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
      
      // Stop observing after 30 seconds (by then Salesforce should have loaded)
      setTimeout(() => {
        observer.disconnect();
      }, 30000);
    }
  }

  /**
   * Extract Salesforce user name from DOM if available
   */
  function getSalesforceUserName() {
    try {
      // Method 1: Try the profile card name (more specific to get only the link text)
      const profileNameLink = document.querySelector('h1.profile-card-name > a.profile-link-label');
      if (profileNameLink) {
        const name = profileNameLink.textContent.trim();
        if (name && name !== 'View profile') {
          return name;
        }
      }
      
      // Method 2: Try the user profile button (get the aria-label or title)
      const profileBtn = document.querySelector('button.oneUserProfileCardTrigger');
      if (profileBtn) {
        const ariaLabel = profileBtn.getAttribute('aria-label');
        const title = profileBtn.getAttribute('title');
        if (ariaLabel && ariaLabel !== 'View profile') {
          return ariaLabel.replace('View profile for ', '').replace(', opens user detail dialog', '');
        }
        if (title && title !== 'View profile') {
          return title;
        }
      }
      
      // Method 3: Try to extract from Salesforce global context (if available)
      try {
        if (window.$A && window.$A.get) {
          const userName = window.$A.get('$Global.userContext.userName');
          if (userName) {
            return userName;
          }
        }
      } catch (e) {
        // Silent fail
      }
      
      // If on Salesforce but can't find name, return null
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Capture screenshot using Chrome API
   */
  async function captureScreenshot() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'captureScreenshot' },
        (response) => {
          if (response && response.screenshot) {
            resolve(response.screenshot);
          } else {
            // Fallback to html2canvas
            captureWithHtml2Canvas().then(resolve);
          }
        }
      );
    });
  }

  /**
   * Fallback screenshot using html2canvas
   */
  async function captureWithHtml2Canvas() {
    return new Promise((resolve) => {
      if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = () => {
          html2canvas(document.body, {
            useCORS: true,
            logging: false,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          }).then(canvas => {
            resolve(canvas.toDataURL('image/png'));
          }).catch(() => resolve(null));
        };
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      } else {
        html2canvas(document.body, {
          useCORS: true,
          logging: false,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
        }).then(canvas => {
          resolve(canvas.toDataURL('image/png'));
        }).catch(() => resolve(null));
      }
    });
  }

  /**
   * Merge logs from debugger and content script, removing duplicates
   * Uses timestamp + message as unique key
   */
  function mergeLogs(debuggerLogs, contentScriptLogs) {
    const logMap = new Map();
    
    // Add debugger logs first (they have more complete stack traces)
    debuggerLogs.forEach(log => {
      const key = `${log.timestamp}_${log.message.substring(0, 100)}`;
      if (!logMap.has(key)) {
        logMap.set(key, log);
      }
    });
    
    // Add content script logs (they may have KAPTIO logs that debugger missed)
    contentScriptLogs.forEach(log => {
      const key = `${log.timestamp}_${log.message.substring(0, 100)}`;
      // Only add if not already present or if content script log has more info
      if (!logMap.has(key)) {
        logMap.set(key, log);
      } else {
        // If duplicate exists, prefer the one with KAPTIO in message or longer stack trace
        const existing = logMap.get(key);
        if (log.message.includes('KAPTIO') || 
            (log.stackTrace && log.stackTrace.length > (existing.stackTrace || '').length)) {
          logMap.set(key, log);
        }
      }
    });
    
    // Convert to array and sort by timestamp
    const merged = Array.from(logMap.values());
    merged.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
    
    return merged;
  }

  /**
   * Handle messages from popup or background
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'capturePage') {
      // Popup is requesting capture
      // Use native console to avoid our wrapper interfering
      try {
        nativeConsole.log('📸 Capturing page data...');
        nativeConsole.log('Current console logs count:', consoleLogs.length);
      } catch (e) {}
      
      // Get current tab ID
      chrome.runtime.sendMessage({ action: 'getCurrentTabId' }, (tabResponse) => {
        const currentTabId = tabResponse ? tabResponse.tabId : null;
        
        // First get logs from debugger (which has complete history from page start)
        chrome.runtime.sendMessage(
          { action: 'getDebuggerLogs', tabId: currentTabId },
          (debuggerResponse) => {
          const debuggerLogs = (debuggerResponse && debuggerResponse.logs) ? debuggerResponse.logs : [];
          
          try {
            nativeConsole.log('Debugger has', debuggerLogs.length, 'logs');
            nativeConsole.log('Content script has', consoleLogs.length, 'logs');
            
            // Count KAPTIO logs in each source
            const debuggerKaptioCount = debuggerLogs.filter(l => l.message && l.message.includes('KAPTIO')).length;
            const contentKaptioCount = consoleLogs.filter(l => l.message && l.message.includes('KAPTIO')).length;
            nativeConsole.log('KAPTIO logs - Debugger:', debuggerKaptioCount, 'Content:', contentKaptioCount);
          } catch (e) {}
          
          // Merge both sources intelligently
          const allLogs = mergeLogs(debuggerLogs, consoleLogs.slice());
          
          try {
            nativeConsole.log('✅ Merged logs:', allLogs.length, 'total');
          } catch (e) {}
          
          captureScreenshot().then(screenshot => {
            // Get Salesforce user name if available
            const userName = getSalesforceUserName();
            
            const data = {
              consoleLogs: allLogs, // Merged logs from both sources
              screenshot: screenshot,
              url: window.location.href,
              title: document.title,
              reportedBy: userName, // Salesforce user name or null
            };
            
            try {
              nativeConsole.log('✅ Sending data with', data.consoleLogs.length, 'logs, screenshot, and user:', userName);
            } catch (e) {}
            
            // Send to background for storage
            chrome.runtime.sendMessage({
              action: 'storeData',
              consoleLogs: data.consoleLogs,
              screenshot: data.screenshot,
              reportedBy: data.reportedBy
            });
            
            sendResponse(data);
          }).catch(error => {
            try {
              nativeConsole.error('Capture error:', error);
            } catch (e) {}
            sendResponse({
              consoleLogs: allLogs,
              screenshot: null,
              url: window.location.href,
              title: document.title,
              reportedBy: null,
            });
          });
        }
      );
      });
      
      return true; // Will respond asynchronously
    }
    
    if (request.action === 'getLogs') {
      // Just return current logs
      try {
        nativeConsole.log('getLogs requested, returning', consoleLogs.length, 'logs');
      } catch (e) {}
      sendResponse({
        consoleLogs: consoleLogs.slice(),
        url: window.location.href,
        title: document.title,
      });
      return true;
    }
  });

  // Initialize console capture immediately
  // This captures logs that Salesforce's override emits (like KAPTIO logs)
  // Option 2: Persistent wrapper with periodic re-application
  initConsoleCapture();
  
  // Log to verify it's working (use native console to avoid capturing this)
  try {
    nativeConsole.log('✅ Kaptio JIRA Reporter content script loaded - Console capture is active (Option 2: Persistent wrapper)');
  } catch (e) {
    // Fallback if native console not available
  }
  
  // Don't add test logs - only capture real user-generated logs
})();

