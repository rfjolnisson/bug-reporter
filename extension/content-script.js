/**
 * Content Script - Captures console logs from the page
 * Injected into all pages to monitor console activity
 */

(function() {
  'use strict';

  // Store captured console logs
  const consoleLogs = [];
  
  // Store original console methods
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    clear: console.clear.bind(console),
  };

  /**
   * Safely convert argument to string
   */
  function argToString(arg) {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }

  /**
   * Capture existing console history if available
   */
  function captureExistingLogs() {
  // We still capture via content script to catch Salesforce's overridden console
  // This is complementary to the debugger approach
  }

  /**
   * Override console methods to capture logs
   */
  function initConsoleCapture() {
    // First, try to capture any existing logs
    captureExistingLogs();
    
    ['log', 'warn', 'error', 'info', 'debug'].forEach((method) => {
      const original = console[method];
      console[method] = function(...args) {
        // Call original method first
        originalConsole[method].apply(console, args);
        
        // Extract stack trace
        const stack = new Error().stack;
        let stackTrace = '';
        if (stack) {
          const lines = stack.split('\n').slice(2, 12); // Skip first 2 lines (Error, this function)
          stackTrace = lines.map(line => '  ' + line.trim()).join('\n');
        }
        
        // Capture the log with stack trace
        const logEntry = {
          level: method,
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
      };
    });
    
    // Capture console.clear
    console.clear = function() {
      originalConsole.clear();
      consoleLogs.push({
        level: 'info',
        message: '[Console was cleared]',
        timestamp: new Date().toISOString(),
        url: window.location.href,
      });
    };
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
   * Handle messages from popup or background
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'capturePage') {
      // Popup is requesting capture
      originalConsole.log('📸 Capturing page data...');
      originalConsole.log('Current console logs count:', consoleLogs.length);
      
      // Log current logs for debugging
      if (consoleLogs.length > 0) {
        originalConsole.log('Sample log:', consoleLogs[0]);
      }
      
      // Get current tab ID
      chrome.runtime.sendMessage({ action: 'getCurrentTabId' }, (tabResponse) => {
        const currentTabId = tabResponse ? tabResponse.tabId : null;
        
        // First get logs from debugger (which has complete history)
        chrome.runtime.sendMessage(
          { action: 'getDebuggerLogs', tabId: currentTabId },
          (debuggerResponse) => {
          const debuggerLogs = (debuggerResponse && debuggerResponse.logs) ? debuggerResponse.logs : [];
          
          originalConsole.log('Debugger has', debuggerLogs.length, 'logs');
          originalConsole.log('Content script has', consoleLogs.length, 'logs');
          
          // Use debugger logs if available (more complete), otherwise use content script logs
          const allLogs = debuggerLogs.length > 0 ? debuggerLogs : consoleLogs.slice();
          
          captureScreenshot().then(screenshot => {
            // Get Salesforce user name if available
            const userName = getSalesforceUserName();
            
            const data = {
              consoleLogs: allLogs, // Use debugger logs for complete history
              screenshot: screenshot,
              url: window.location.href,
              title: document.title,
              reportedBy: userName, // Salesforce user name or null
            };
            
            originalConsole.log('✅ Sending data with', data.consoleLogs.length, 'logs, screenshot, and user:', userName);
            
            // Send to background for storage
            chrome.runtime.sendMessage({
              action: 'storeData',
              consoleLogs: data.consoleLogs,
              screenshot: data.screenshot,
              reportedBy: data.reportedBy
            });
            
            sendResponse(data);
          }).catch(error => {
            originalConsole.error('Capture error:', error);
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
      originalConsole.log('getLogs requested, returning', consoleLogs.length, 'logs');
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
  initConsoleCapture();
  
  // Log to verify it's working (use original console to avoid capturing this)
  originalConsole.log('✅ Kaptio JIRA Reporter content script loaded - Console capture is active');
  
  // Don't add test logs - only capture real user-generated logs
})();

