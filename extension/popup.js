// Quinn Trace Recorder - Popup Script

const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggleBtn');

let isRecording = false;
let currentTabId = null;

// Get current tab and check recording status
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Check if content script is recording
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'getStatus' });
    isRecording = response.isRecording;
    updateUI(response.eventCount || 0);
  } catch (e) {
    // Content script not loaded yet
    statusEl.textContent = 'Navigate to a page first';
    statusEl.className = 'status idle';
    toggleBtn.disabled = true;
  }
}

function updateUI(eventCount = 0) {
  if (isRecording) {
    statusEl.innerHTML = `Recording... <span class="event-count">${eventCount} events</span>`;
    statusEl.className = 'status recording';
    toggleBtn.textContent = 'Stop & Download';
    toggleBtn.className = 'stop';
  } else {
    statusEl.textContent = 'Ready to record';
    statusEl.className = 'status idle';
    toggleBtn.textContent = 'Start Recording';
    toggleBtn.className = 'start';
  }
}

toggleBtn.addEventListener('click', async () => {
  if (!currentTabId) return;

  if (!isRecording) {
    // Start recording
    const startTime = Date.now();
    await chrome.tabs.sendMessage(currentTabId, { action: 'startRecording' });
    chrome.runtime.sendMessage({ action: 'setRecordingTab', tabId: currentTabId, startTime });
    isRecording = true;
    updateUI(0);
  } else {
    // Stop recording and download
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'stopRecording' });
    chrome.runtime.sendMessage({ action: 'clearRecordingTab' });

    if (response.trace) {
      // Trigger download via background script
      chrome.runtime.sendMessage({ action: 'downloadTrace', trace: response.trace }, (result) => {
        if (result?.success) {
          statusEl.textContent = `Saved: ${result.filename}`;
        }
      });
    }

    isRecording = false;
    updateUI(0);
  }
});

init();
