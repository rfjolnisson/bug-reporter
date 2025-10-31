# Kaptio JIRA Reporter - Chrome Extension

A beautiful, Kaptio-branded Chrome extension that captures console logs and screenshots to report issues to JIRA with one click.

## Features

- 🐛 **One-Click Bug Reporting** - Click the toolbar icon to capture everything
- 📸 **Automatic Screenshots** - Captures the current page view
- 📝 **Console Log Capture** - Grabs all console logs (errors, warnings, info)
- 👤 **Salesforce Integration** - Automatically extracts reporter name from Salesforce
- ✨ **Works in Salesforce** - Bypasses Content Security Policy restrictions
- 🎨 **Kaptio Branding** - Beautiful, friendly UI users will love

## Quick Installation

### For End Users

1. Download this repository (green "Code" button → Download ZIP)
2. Extract the ZIP file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top-right)
5. Click "Load unpacked"
6. Select the `extension` folder
7. Done! The bug icon (🐛) appears in your toolbar

See `extension/README_INSTALL.md` for detailed instructions.

### For Citrix Admins

See `extension/admin-setup-guide.html` for a beautiful step-by-step guide with screenshots and troubleshooting.

Open `extension/admin-setup-guide.html` in your browser for the full deployment guide.

## Usage

1. Visit any webpage (works great in Salesforce!)
2. Click the bug icon 🐛 in Chrome toolbar
3. Wait 1-2 seconds for capture (form will enable when ready)
4. Fill in:
   - Title (required)
   - Description
   - Labels (optional, comma-separated)
5. Click "Submit to JIRA"
6. Get a link to the created JIRA issue!

### What Gets Captured

- ✅ All console logs from page load onward
- ✅ Screenshot of the page
- ✅ Page URL and title
- ✅ Your Salesforce username (if on Salesforce)

## Architecture

- **Content Script** - Captures console logs automatically
- **Background Worker** - Handles screenshots via Chrome API
- **Popup UI** - Beautiful Kaptio-branded form
- **Backend API** - Submits to JIRA (hosted on Railway)
- **PostgreSQL** - Audit logging for reliability

## Download Latest Release

Download the pre-packaged extension:
- [kaptio-jira-reporter-extension.zip](../../releases/latest)

## Configuration

The extension connects to a backend API server that handles JIRA integration.

**Production API:** `https://kaptio-api-production.up.railway.app`

No configuration needed - it just works!

## For Developers

### Extension Structure

```
extension/
├── manifest.json           # Extension configuration
├── background.js           # Service worker (screenshot capture)
├── content-script.js       # Console log capture
├── popup.html              # Extension popup UI
├── popup.js                # Popup logic
├── styles.css              # Kaptio-branded styles
├── icons/                  # Extension icons
├── admin-setup-guide.html  # Beautiful setup guide
└── CITRIX_ADMIN_GUIDE.md   # Detailed admin documentation
```

### Tech Stack

- **Frontend:** Vanilla JavaScript, Kaptio Design System
- **Chrome APIs:** tabs, storage, scripting, activeTab
- **Backend:** Node.js + Express (separate repo)
- **Database:** PostgreSQL for audit logging

## Why Chrome Extension vs Bookmarklet?

Salesforce Lightning has strict Content Security Policy (CSP) that blocks bookmarklets from loading external scripts. Chrome extensions bypass CSP entirely, making them work perfectly in Salesforce and other secure environments.

## Support

For issues or questions:
1. Check `extension/CITRIX_ADMIN_GUIDE.md` for troubleshooting
2. Open an issue on GitHub
3. Contact: Kaptio team

## License

Private - For internal use only

## Version

**v1.0.0** - Initial release with console capture, screenshots, and JIRA integration

---

Built with ❤️ using the Kaptio Design System

