// Background service worker for Dead Yet browser extension
// Listens for webhook trigger and clears browser history

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'clearHistory') {
    clearBrowserHistory()
      .then(() => {
        console.log('Browser history cleared successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Failed to clear history:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Listen for webhook calls
// Note: Chrome extensions can't directly intercept HTTP requests
// But we can poll or use other methods to check for triggers

// Alternative approach: Use declarativeWebRequest or check periodically
// For now, we'll use a simpler approach where the app calls a URL
// and the user manually triggers clear, or we listen to tab updates

async function clearBrowserHistory() {
  try {
    // Clear all browsing history
    await chrome.history.deleteAll();
    console.log('History deleted');

    // Also try to clear other data
    // Note: chrome.browsingData API requires more permissions
    return true;
  } catch (error) {
    console.error('Error clearing history:', error);
    throw error;
  }
}

// Listen for tab updates to check if webhook was triggered
// This is a fallback - ideally the app calls the webhook directly
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Could check if the URL matches our webhook pattern
    chrome.storage.local.get(['webhookUrl'], (result) => {
      if (result.webhookUrl && changeInfo.url.startsWith(result.webhookUrl.split('/').slice(0, 3).join('/'))) {
        // Webhook URL was called - clear history
        clearBrowserHistory();
      }
    });
  }
});

// Export for testing
module.exports = { clearBrowserHistory };