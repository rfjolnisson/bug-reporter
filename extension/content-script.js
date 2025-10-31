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
    // Some browsers store console history - try to access it
    // This is a best-effort approach
    try {
      // Check for existing console entries via performance API or window.console storage
      // Add a marker log to verify capture is working
      consoleLogs.push({
        level: 'info',
        message: '=== Kaptio Console Capture Started ===',
        timestamp: new Date().toISOString(),
        url: window.location.href,
      });
    } catch (e) {
      // Silent fail
    }
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
        
        // Capture the log
        const logEntry = {
          level: method,
          message: args.map(argToString).join(' '),
          timestamp: new Date().toISOString(),
          url: window.location.href,
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
      // Try multiple selectors for different Salesforce layouts
      const selectors = [
        '.profile-card-name a.profile-link-label',
        '.profile-card-name a',
        '[data-aura-class="oneConsoleUserProfile"] .profile-link-label',
        '.oneUserProfileCardTrigger',
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      
      // Check if on Salesforce domain
      if (window.location.hostname.includes('salesforce.com') || 
          window.location.hostname.includes('force.com')) {
        return 'Salesforce User';
      }
      
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
      
      captureScreenshot().then(screenshot => {
        // Get Salesforce user name if available
        const userName = getSalesforceUserName();
        
        const data = {
          consoleLogs: consoleLogs.slice(), // Copy array
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
          consoleLogs: consoleLogs.slice(),
          screenshot: null,
          url: window.location.href,
          title: document.title,
          reportedBy: null,
        });
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
  initConsoleCapture();
  
  // Log to verify it's working (this should be captured)
  originalConsole.log('✅ Kaptio JIRA Reporter content script loaded');
  
  // Test: add a captured log entry to verify capture is working
  setTimeout(() => {
    console.log('🧪 Test log - if you see this in the extension, console capture is working!');
  }, 100);
})();

