# Quick Installation Guide

## For End Users

### Install the Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the extension folder
6. Done! The bug icon (🐛) appears in your toolbar

### Use the Extension

1. Visit any page with an issue
2. Click the bug icon in Chrome toolbar
3. Fill in the issue details
4. Click "Submit to JIRA"
5. Get a link to the created issue!

---

## For Citrix Admins

See `CITRIX_ADMIN_GUIDE.md` for detailed installation and deployment instructions.

---

## Server Setup

Make sure the backend server is running:

```bash
cd server-directory
npm install
npm start
```

Default URL: `http://localhost:3519`

---

## Updating

To update the extension:

1. Download new version
2. Extract to same folder (overwrite)
3. Go to `chrome://extensions/`
4. Click reload icon on the extension

