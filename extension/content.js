// Quinn Trace Recorder - Content Script
// Captures clicks, form inputs, and navigation for baseline data

console.log('[Quinn Trace] Script loaded, window.self === window.top:', window.self === window.top, 'location:', window.location.href.substring(0, 50));

const isTopFrame = window.self === window.top;
const isIframe = !isTopFrame;

let isRecording = false;
let events = [];
let startTime = null;
let startUrl = null;

// Storage wrapper - use local storage (more compatible than session)
const storage = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },
  async set(data) {
    return chrome.storage.local.set(data);
  },
  async remove(keys) {
    return chrome.storage.local.remove(keys);
  }
};

// Restore recording state on page load (handles navigation)
async function restoreState() {
  console.log('[Quinn Trace] restoreState called, isTopFrame:', isTopFrame);

  // Only top frame should restore from storage
  if (isTopFrame) {
    try {
      console.log('[Quinn Trace] TOP: Trying storage.get...');
      const data = await storage.get(['isRecording', 'events', 'startTime', 'startUrl']);
      console.log('[Quinn Trace] TOP: Storage get succeeded, data.isRecording:', data.isRecording);

      if (data.isRecording) {
        isRecording = true;
        events = data.events || [];
        startTime = data.startTime;
        startUrl = data.startUrl;

        // Record this navigation
        recordEvent('navigation', {
          url: window.location.href,
          title: document.title
        });

        // Notify background of current count
        chrome.runtime.sendMessage({ action: 'eventRecorded', eventCount: events.length });
        attachListeners();
      }
      console.log('[Quinn Trace] TOP: restored, isRecording:', isRecording, 'events:', events.length);
      return;
    } catch (e) {
      console.log('[Quinn Trace] TOP: Storage error:', e.message);
      // Top frame should not fall back to background - storage must work
      return;
    }
  }

  // Iframe path - always ask background for state (most reliable for cross-origin)
  console.log('[Quinn Trace] IFRAME: asking background for state...');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRecordingState' });
    console.log('[Quinn Trace] IFRAME: background response:', response);
    if (response?.isRecording) {
      isRecording = true;
      startTime = response.startTime;
      attachListeners();
      console.log('[Quinn Trace] IFRAME: recording active, listeners attached');
    } else {
      console.log('[Quinn Trace] IFRAME: not recording');
    }
  } catch (e) {
    console.log('[Quinn Trace] IFRAME: Could not get state:', e.message);
  }
}

// Persist state to storage (only top frame should call this)
async function persistState() {
  if (!isTopFrame) return; // Iframes don't persist

  try {
    await storage.set({
      isRecording,
      events,
      startTime,
      startUrl
    });
  } catch (e) {
    console.log('[Quinn Trace] persistState error:', e.message);
  }
}

// Clear persisted state
async function clearState() {
  try {
    await storage.remove(['isRecording', 'events', 'startTime', 'startUrl']);
  } catch (e) {
    console.log('[Quinn Trace] clearState error:', e.message);
  }
}

// Generate a CSS selector for an element
function getSelector(el) {
  if (!el || el === document.body || el === document.documentElement) {
    return 'body';
  }

  // Try ID first
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  // Try unique attributes
  const uniqueAttrs = ['data-testid', 'data-cy', 'name', 'aria-label'];
  for (const attr of uniqueAttrs) {
    const value = el.getAttribute(attr);
    if (value) {
      const selector = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Try type + name for inputs
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    const type = el.getAttribute('type');
    const name = el.getAttribute('name');
    if (name) {
      const selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
    if (type) {
      const selector = `${el.tagName.toLowerCase()}[type="${CSS.escape(type)}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Build path from parent
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();

  const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  if (siblings.length === 1) {
    return `${getSelector(parent)} > ${el.tagName.toLowerCase()}`;
  }

  const index = siblings.indexOf(el) + 1;
  return `${getSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}

// Get element metadata
function getElementInfo(el) {
  return {
    selector: getSelector(el),
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || null,
    name: el.getAttribute('name') || null,
    id: el.id || null,
    placeholder: el.getAttribute('placeholder') || null,
    innerText: el.innerText?.substring(0, 100) || null,
    href: el.getAttribute('href') || null,
  };
}

// Record an event
function recordEvent(type, data) {
  if (!isRecording) return;

  const event = {
    type,
    timestamp: Date.now() - startTime,
    url: window.location.href,
    isIframe,
    frameOrigin: isIframe ? window.location.origin : null,
    ...data
  };

  if (isTopFrame) {
    // Top frame stores events directly
    events.push(event);
    persistState();
    chrome.runtime.sendMessage({ action: 'eventRecorded', eventCount: events.length });
  } else {
    // Iframe sends event to background to relay to top frame
    chrome.runtime.sendMessage({ action: 'iframeEvent', event });
  }
}

// Click handler
function handleClick(e) {
  if (!isRecording) return;

  const el = e.target;
  recordEvent('click', {
    element: getElementInfo(el),
    x: e.clientX,
    y: e.clientY
  });
}

// Input handler (fires on blur/change)
function handleInput(e) {
  if (!isRecording) return;

  const el = e.target;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    recordEvent('input', {
      element: getElementInfo(el),
      value: el.value,
      valueLength: el.value?.length || 0
    });
  }
}

// Focus handler - track which fields get focused
function handleFocus(e) {
  if (!isRecording) return;

  const el = e.target;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    recordEvent('focus', {
      element: getElementInfo(el)
    });
  }
}

// Navigation handler
function handleNavigation() {
  if (!isRecording) return;

  recordEvent('navigation', {
    url: window.location.href,
    title: document.title
  });
}

// Attach event listeners
function attachListeners() {
  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', handleInput, true);
  document.addEventListener('focus', handleFocus, true);

  // Watch for URL changes (SPA navigation)
  if (!history._quinnPatched) {
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleNavigation();
    };
    history._quinnPatched = true;
  }

  window.addEventListener('popstate', handleNavigation);
}

// Detach event listeners
function detachListeners() {
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('change', handleInput, true);
  document.removeEventListener('focus', handleFocus, true);
  window.removeEventListener('popstate', handleNavigation);
}

// Start recording (only called from top frame)
function startRecording() {
  if (!isTopFrame) return;

  isRecording = true;
  events = [];
  startTime = Date.now();
  startUrl = window.location.href;

  recordEvent('start', {
    url: startUrl,
    title: document.title
  });

  attachListeners();
  persistState();
}

// Stop recording and return trace (only called from top frame)
function stopRecording() {
  if (!isTopFrame) return null;

  // Record stop event before changing state
  events.push({
    type: 'stop',
    timestamp: Date.now() - startTime,
    url: window.location.href,
    isIframe: false,
    frameOrigin: null,
    title: document.title
  });

  const trace = {
    metadata: {
      startUrl,
      endUrl: window.location.href,
      startTime: new Date(startTime).toISOString(),
      duration: Date.now() - startTime,
      eventCount: events.length,
      recordedAt: new Date().toISOString()
    },
    events
  };

  // Clean up
  isRecording = false;
  detachListeners();
  clearState();

  return trace;
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only top frame handles start/stop/status
  if (isTopFrame) {
    if (message.action === 'startRecording') {
      startRecording();
      sendResponse({ success: true });
      return true;
    } else if (message.action === 'stopRecording') {
      const trace = stopRecording();
      sendResponse({ success: true, trace });
      return true;
    } else if (message.action === 'getStatus') {
      sendResponse({ isRecording, eventCount: events.length });
      return true;
    } else if (message.action === 'iframeEvent') {
      // Receive event from iframe via background
      if (isRecording && message.event) {
        events.push(message.event);
        persistState();
        chrome.runtime.sendMessage({ action: 'eventRecorded', eventCount: events.length });
      }
      sendResponse({ success: true });
      return true;
    }
  }

  // Iframes ignore these messages
  sendResponse({ ignored: true, isIframe });
  return true;
});

// Restore recording state on page load (handles cross-page navigation)
restoreState();
