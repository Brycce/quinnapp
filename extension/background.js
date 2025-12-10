// Quinn Trace Recorder - Background Service Worker
// Handles downloads and cross-tab state

let recordingTabId = null;
let recordingState = { isRecording: false, startTime: null };

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'eventRecorded') {
    // Update badge with event count
    const tabId = sender.tab?.id || recordingTabId;
    if (tabId) {
      chrome.action.setBadgeText({ text: String(message.eventCount), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
    }
  } else if (message.action === 'getRecordingState') {
    // Cross-origin iframes ask for recording state
    sendResponse(recordingState);
    return true;
  } else if (message.action === 'iframeEvent') {
    // Relay iframe event to the top frame of the same tab
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: 'iframeEvent', event: message.event }, { frameId: 0 });
    }
    sendResponse({ relayed: true });
    return true;
  } else if (message.action === 'downloadTrace') {
    console.log('[Quinn Trace BG] downloadTrace received, trace events:', message.trace?.events?.length);

    if (!message.trace) {
      console.error('[Quinn Trace BG] No trace data received');
      sendResponse({ success: false, error: 'No trace data' });
      return true;
    }

    // Generate filename from URL
    const url = new URL(message.trace.metadata.startUrl);
    const siteName = url.hostname.replace(/^www\./, '').replace(/\./g, '-');
    const date = new Date().toISOString().split('T')[0];
    const filename = `trace-${siteName}-${date}.json`;

    // Create blob URL and download
    const blob = new Blob([JSON.stringify(message.trace, null, 2)], { type: 'application/json' });
    const reader = new FileReader();
    reader.onerror = () => {
      console.error('[Quinn Trace BG] FileReader error');
      sendResponse({ success: false, error: 'FileReader error' });
    };
    reader.onload = () => {
      const dataUrl = reader.result;
      console.log('[Quinn Trace BG] Starting download:', filename);
      chrome.downloads.download({
        url: dataUrl,
        filename: `quinn-traces/${filename}`,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[Quinn Trace BG] Download error:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[Quinn Trace BG] Download started, id:', downloadId);
          sendResponse({ success: true, downloadId, filename });
        }
      });
    };
    reader.readAsDataURL(blob);
    return true; // Keep channel open
  } else if (message.action === 'setRecordingTab') {
    recordingTabId = message.tabId;
    recordingState = { isRecording: true, startTime: message.startTime || Date.now() };
    chrome.action.setBadgeText({ text: 'REC', tabId: message.tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: message.tabId });
  } else if (message.action === 'clearRecordingTab') {
    if (recordingTabId) {
      chrome.action.setBadgeText({ text: '', tabId: recordingTabId });
    }
    recordingTabId = null;
    recordingState = { isRecording: false, startTime: null };
  }
});
