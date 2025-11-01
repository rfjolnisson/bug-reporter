/**
 * Popup Script - Handles the extension popup UI
 */

const API_URL = 'https://kaptio-bug-reporter-api-production.up.railway.app';

let capturedData = {
  consoleLogs: [],
  screenshot: null,
  url: '',
  title: '',
  reportedBy: null
};

let captureComplete = {
  logs: false,
  screenshot: false
};

let currentTabId = null; // Track current tab for clearing logs

/**
 * Load captured data from content script AND debugger
 */
async function loadCapturedData() {
  return new Promise((resolve) => {
    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        resolve({ consoleLogs: [], screenshot: null });
        return;
      }

      const tabId = tabs[0].id;
      currentTabId = tabId; // Store for later use

      // Use content script only (no debugger API to avoid Chrome notification)
      chrome.tabs.sendMessage(
        tabId,
        { action: 'capturePage' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error communicating with content script:', chrome.runtime.lastError);
            resolve({
              consoleLogs: [],
              screenshot: null,
              url: tabs[0].url,
              title: tabs[0].title
            });
          } else {
            resolve({
              ...response,
              consoleLogs: response?.consoleLogs || [],
              url: tabs[0].url,
              title: tabs[0].title
            });
          }
        }
      );
    });
  });
}

/**
 * Render preview sections
 */
function renderPreviews() {
  const previewSection = document.getElementById('previewSection');
  const consoleLogs = capturedData.consoleLogs || [];
  const screenshot = capturedData.screenshot;

  let html = '';

  if (consoleLogs.length > 0) {
    html += `
      <div class="card preview-section">
        <h3>Console Logs (${consoleLogs.length})</h3>
        <div class="console-logs">
          ${consoleLogs.slice(-20).map(log => `
            <div class="console-log-item ${log.level}">
              <strong>[${log.level.toUpperCase()}]</strong> ${escapeHtml((log.message || '').substring(0, 200))}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (screenshot) {
    html += `
      <div class="card preview-section">
        <h3>Screenshot</h3>
        <div class="screenshot-preview">
          <img src="${screenshot}" alt="Screenshot">
        </div>
      </div>
    `;
  }

  previewSection.innerHTML = html;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Submit issue to JIRA
 */
async function submitIssue(formData) {
  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  const message = document.getElementById('message');

  submitBtn.disabled = true;
  loading.classList.add('show');
  message.className = 'message';

  // Build description with "REPORTED BY" prefix if we have a valid user name
  let fullDescription = '';
  if (capturedData.reportedBy && capturedData.reportedBy !== 'View profile') {
    fullDescription = 'REPORTED BY: ' + capturedData.reportedBy + '\n\n';
  }
  fullDescription += formData.description;
  fullDescription += '\n\n---\nPage: ' + capturedData.url;
  
  const payload = {
    summary: formData.summary,
    description: fullDescription,
    consoleLogs: capturedData.consoleLogs || [],
    screenshotBase64: capturedData.screenshot,
  };

  try {
    const response = await fetch(API_URL + '/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      message.className = 'message success';
      message.innerHTML = `✅ Issue created! <a href="${data.issue.url}" target="_blank">View ${data.issue.key}</a>`;
      document.getElementById('issueForm').reset();
      
      // Clear console logs for next submission
      if (currentTabId) {
        chrome.runtime.sendMessage({
          action: 'clearLogs',
          tabId: currentTabId
        }, () => {
          console.log('✅ Logs cleared for next submission');
        });
      }
      
      // Close popup after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);
    } else {
      throw new Error(data.error || 'Failed to create issue');
    }
  } catch (error) {
    message.className = 'message error';
    message.textContent = '❌ Error: ' + error.message;
    submitBtn.disabled = false;
  } finally {
    loading.classList.remove('show');
  }
}

/**
 * Update UI based on capture status
 */
function updateCaptureStatus() {
  const statusEl = document.getElementById('captureStatus');
  const form = document.getElementById('issueForm');
  const submitBtn = document.getElementById('submitBtn');
  
  // Disable form until both captures are complete
  const allComplete = captureComplete.logs && captureComplete.screenshot;
  
  if (allComplete) {
    form.style.opacity = '1';
    form.style.pointerEvents = 'auto';
    submitBtn.disabled = false;
    statusEl.textContent = `✅ Ready! Captured ${capturedData.consoleLogs.length} console logs`;
    statusEl.style.background = '#EFF5F5';
    statusEl.style.borderLeftColor = '#056F82';
    
    // Hide status after 2 seconds
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 2000);
  } else {
    form.style.opacity = '0.5';
    form.style.pointerEvents = 'none';
    submitBtn.disabled = true;
    
    const steps = [];
    if (!captureComplete.logs) steps.push('console logs');
    if (!captureComplete.screenshot) steps.push('screenshot');
    
    statusEl.textContent = `⏳ Capturing ${steps.join(' and ')}...`;
    statusEl.style.background = '#FFFBF5';
    statusEl.style.borderLeftColor = '#FFBC42';
  }
}

/**
 * Initialize popup
 */
async function init() {
  const statusEl = document.getElementById('captureStatus');
  const form = document.getElementById('issueForm');
  
  // Disable form initially
  form.style.opacity = '0.5';
  form.style.pointerEvents = 'none';
  form.style.transition = 'opacity 300ms';
  
  try {
    // Update status
    statusEl.textContent = '⏳ Capturing console logs and screenshot...';
    updateCaptureStatus();
    
    // Load captured data
    capturedData = await loadCapturedData();
    
    console.log('Captured data loaded:', capturedData);
    console.log('Console logs count:', capturedData.consoleLogs ? capturedData.consoleLogs.length : 0);
    console.log('Screenshot present:', !!capturedData.screenshot);
    console.log('Reported by:', capturedData.reportedBy);
    
    // Mark logs as captured
    captureComplete.logs = true;
    
    // Mark screenshot as captured (or not available)
    if (capturedData.screenshot) {
      captureComplete.screenshot = true;
    } else {
      // Try to capture screenshot if not already done
      statusEl.textContent = '📸 Taking screenshot...';
      // Give it a moment
      await new Promise(resolve => setTimeout(resolve, 500));
      captureComplete.screenshot = true; // Continue even if no screenshot
    }
    
    // Update UI
    updateCaptureStatus();
    
    // Render previews
    renderPreviews();
  } catch (error) {
    console.error('Init error:', error);
    statusEl.textContent = '⚠️ Error loading data: ' + error.message;
    statusEl.style.background = '#FFF5F5';
    statusEl.style.borderLeftColor = '#C1121F';
    
    // Enable form anyway after error
    setTimeout(() => {
      form.style.opacity = '1';
      form.style.pointerEvents = 'auto';
    }, 2000);
  }
}

// Form submission handler
document.getElementById('issueForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const formData = {
    summary: document.getElementById('summary').value,
    description: document.getElementById('description').value,
  };
  
  submitIssue(formData);
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

