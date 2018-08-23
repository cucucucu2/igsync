const base = 'https://www.instagram.com/';
let options = null;
let fetcher = null;
const db = new DB();

function setupAlarms() {
  chrome.alarms.create('sync', {
    periodInMinutes: options.syncInt,
  });
  chrome.alarms.create('syncOne', {
    periodInMinutes: options.syncOneInt,
  });
}

// Set up init options - no need change
chrome.storage.local.get('options', (res) => {
  const defaultOptions = {
    autoReload: 10,
    feedDisplayOpts: '3--',
    feedPerPage: 500,
    syncCount: 1,
    syncEach: 30,
    syncInt: 999,
    syncOneInt: 10,
  };
  options = Object.assign(defaultOptions, res.options);
  chrome.storage.local.set({ options });

  fetcher = new Fetcher(options);
  // Export for main page
  window.fetcher = fetcher;
  fetcher.auto(1)
    .then((success) => {
      if (success) {
        setupAlarms();
      }
    });
});

chrome.alarms.onAlarm.addListener((alerm) => {
  switch (alerm.name) {
    case 'syncOne':
      fetcher.auto(1);
      break;
    case 'sync':
      fetcher.auto(options.syncCount);
      break;
    default:
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'sync':
      fetcher.auto(options.syncCount);
      break;
    case 'saveOptions':
      options = Object.assign({}, options, request.data);
      fetcher.syncEach = options.syncEach;
      setupAlarms();
      DB.s({ options });
      break;
    case 'search': {
      const { q, tagged, liked } = request.matcher;
      const matcher = new Matcher(q, tagged, liked);
      db.gCached(null, matcher).then((items) => {
        sendResponse(items);
      });
      break;
    }
    default:
  }
  return true;
});

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  let referer = false;
  details.requestHeaders.forEach((header) => {
    if (details.tabId === -1 && header.name === 'Origin') {
      header.value = base;
    }
    if (header.name === 'Referer') {
      header.value = base;
      referer = true;
    }
  });
  if (!referer) {
    details.requestHeaders.push({
      name: 'Referer',
      value: base,
    });
  }
  return { requestHeaders: details.requestHeaders };
}, { urls: [`${base}*`] }, ['blocking', 'requestHeaders']);
