const webhookInput = document.getElementById('webhookUrl');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

// Load saved webhook URL on popup open
chrome.storage.local.get(['webhookUrl'], (result) => {
  if (result.webhookUrl) {
    webhookInput.value = result.webhookUrl;
  }
});

saveBtn.addEventListener('click', () => {
  const url = webhookInput.value.trim();

  if (!url) {
    showStatus('Please enter a webhook URL', 'error');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showStatus('URL must start with http:// or https://', 'error');
    return;
  }

  chrome.storage.local.set({ webhookUrl: url }, () => {
    showStatus('Webhook URL saved!', 'success');

    // Also update the webhook URL in the extension's badge/action
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  });
});

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}