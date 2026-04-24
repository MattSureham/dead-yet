# Dead Yet Browser Extension

Chrome extension that clears your browsing history when you're confirmed dead.

## How It Works

1. User sets a webhook URL in the Dead Yet mobile app
2. User installs this extension and configures the same webhook URL
3. When death is confirmed, the app calls the webhook
4. The extension detects this and clears browser history

## Installation (Developer Mode)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `browser-extension/` folder from this repo

## Configuration

1. Click the Dead Yet extension icon in Chrome toolbar
2. Enter the same webhook URL you used in the mobile app
3. Click "Save"

## How the Webhook Trigger Works

**The Challenge:** Chrome extensions cannot intercept outbound HTTP requests from other apps on your phone/computer.

**The Solution:** The webhook URL points to a special page that the extension monitors:

1. Keep the "Dead Yet" tab open in Chrome (extension will detect this tab)
2. When the app calls your webhook URL (e.g., `https://example.com/clear`), it's actually calling a URL that redirects to or includes a specific pattern
3. The extension monitors tab updates and when it sees the webhook URL was accessed, it clears history

**Simplest Setup:** Use a free service like GitHub Gist or similar to create a simple "trigger page":

1. Create a public Gist or simple HTML page at `https://yourusername.github.io/trigger.html`
2. Set this as your webhook URL
3. Extension monitors for access to that URL and clears history

## Manual Clear

If the automated trigger doesn't work, you can:
1. Open the extension popup
2. Click "Clear History Now" for immediate clearing

## Security Notes

- Webhook URL is stored locally in Chrome extension storage
- No data is sent to any server except your configured webhook
- Requires "History" permission to clear browsing history

## Files

- `manifest.json` - Extension configuration
- `popup.html` - UI for setting webhook URL  
- `popup.js` - Popup logic
- `background.js` - Service worker for history clearing