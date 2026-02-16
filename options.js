const GLOBAL_KEY = "__global__";

function normalizeDomain(s) {
  return (s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
}

function renderDomainList(domainsMap, selectedKey) {

  const sel = document.getElementById("domainSelect");

  // Empty existing list
  var length = sel.options.length;
  for (i = length-1; i >= 0; i--) {
    sel.options[i] = null;
  }

  const keys = Object.keys(domainsMap || {});
  keys.sort((a, b) => (a === GLOBAL_KEY ? -1 : a.localeCompare(b)));
  keys.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = (k === GLOBAL_KEY) ? "Global" : k;
    sel.appendChild(opt);
  });
  sel.value = selectedKey || GLOBAL_KEY;
}


function loadDomainToUI(domainKey, domainsMap) {
  const domain = (domainsMap && domainsMap[domainKey]) || { whitelist: [], blacklist: [], inheritVisits: false };
  document.getElementById("whitelist").value = (domain.whitelist || []).join("\n");
  document.getElementById("blacklist").value = (domain.blacklist || []).join("\n");
  document.getElementById("inheritVisits").checked = !!domain.inheritVisits;
  domainDirty = false;
}


function collectDomainFromUI() {
  const whitelist = document.getElementById("whitelist").value
    .split("\n").map(l => l.trim()).filter(Boolean);
  const blacklist = document.getElementById("blacklist").value
    .split("\n").map(l => l.trim()).filter(Boolean);
  const inheritVisits = document.getElementById("inheritVisits").checked;
  return { whitelist, blacklist, inheritVisits };
}


// Save currently edited domain - only when dirty; used when switching tabs or hiding page
async function saveCurrentDomainToStorage() {
  try {
    // Only persist if user changed something
    if (!domainDirty) return;

    const currentKey = document.getElementById("domainSelect").value || GLOBAL_KEY;
    const domainData = collectDomainFromUI();

    const all = await browser.storage.local.get("domains");
    const map = all.domains || {};
    map[currentKey] = domainData;
    await browser.storage.local.set({ domains: map, selectedDomain: currentKey });

    domainDirty = false;

  } catch (err) {
    console.error("Error saving current domain on tab switch:", err);
  }
}


document.addEventListener("DOMContentLoaded", async () => {
  const stored = await browser.storage.local.get([
    "domains",
    "selectedDomain",
    "locale",
    "useCache",
    "maxCacheSize",
    "cacheSize",
    "urlsLimit",
    // backward compatibility keys
    "whitelist",
    "blacklist",
    "inheritVisits"
  ]);

  const domains = stored.domains || {};

  // If old global keys exist, migrate them into GLOBAL_KEY
  if ((stored.whitelist && stored.whitelist.length) || (stored.blacklist && stored.blacklist.length) || stored.inheritVisits) {
    domains[GLOBAL_KEY] = domains[GLOBAL_KEY] || {};
    domains[GLOBAL_KEY].whitelist = stored.whitelist || domains[GLOBAL_KEY].whitelist || [];
    domains[GLOBAL_KEY].blacklist = stored.blacklist || domains[GLOBAL_KEY].blacklist || [];
    domains[GLOBAL_KEY].inheritVisits = typeof stored.inheritVisits !== 'undefined' ? stored.inheritVisits : domains[GLOBAL_KEY].inheritVisits || false;
  }

  const selectedDomain = stored.selectedDomain || GLOBAL_KEY;

  renderDomainList(domains, selectedDomain);
  loadDomainToUI(selectedDomain, domains);

  // set initial prevKey to the selected domain so switching saves correctly
  try { document.getElementById("domainSelect").dataset.prevKey = selectedDomain; } catch (e) { }

  // global non-domain settings
  document.getElementById("localeSelect").value = stored.locale || "en";
  const useCache = !!stored.useCache;
  document.getElementById("useCache").checked = useCache;
  document.getElementById("maxCacheSize").disabled = !useCache;
  document.getElementById("clearCache").disabled = !useCache;
  document.getElementById("maxCacheSize").value = stored.maxCacheSize || 1000;
  document.getElementById("cacheSize").textContent = stored.cacheSize || 0;
  document.getElementById("urlsLimit").value = stored.urlsLimit || 100;

  // Track if domain form has unsaved changes (dirty) to avoid overwriting stored domains
  let domainDirty = false;
  const whitelistEl = document.getElementById('whitelist');
  const blacklistEl = document.getElementById('blacklist');
  const inheritEl = document.getElementById('inheritVisits');
  function markDirty() { domainDirty = true; }
  if (whitelistEl) whitelistEl.addEventListener('input', markDirty);
  if (blacklistEl) blacklistEl.addEventListener('input', markDirty);
  if (inheritEl) inheritEl.addEventListener('change', markDirty);

  // Hook tab buttons (added in options.html) to persist domain edits when switching
  const tabGeneral = document.getElementById('tabBtnGeneral');
  const tabDomains = document.getElementById('tabBtnDomains');
  const tabPanelGeneral = document.getElementById('tab-general');
  const tabPanelDomains = document.getElementById('tab-domains');

  function showGeneralPanel() {
    if (tabGeneral) tabGeneral.classList.add('active');
    if (tabDomains) tabDomains.classList.remove('active');
    if (tabPanelGeneral) tabPanelGeneral.classList.remove('hidden');
    if (tabPanelDomains) tabPanelDomains.classList.add('hidden');
    try { localStorage.setItem('optionsActiveTab', 'general'); } catch (e) { }
  }

  function showDomainsPanel() {
    if (tabDomains) tabDomains.classList.add('active');
    if (tabGeneral) tabGeneral.classList.remove('active');
    if (tabPanelDomains) tabPanelDomains.classList.remove('hidden');
    if (tabPanelGeneral) tabPanelGeneral.classList.add('hidden');
    try { localStorage.setItem('optionsActiveTab', 'domains'); } catch (e) { }
  }

  if (tabGeneral) tabGeneral.addEventListener('click', async () => { await saveCurrentDomainToStorage(); showGeneralPanel(); });
  if (tabDomains) tabDomains.addEventListener('click', async () => { await saveCurrentDomainToStorage(); showDomainsPanel(); });

  // initialize active tab from localStorage (or default to general)
  try {
    const active = localStorage.getItem('optionsActiveTab');
    if (active === 'domains') showDomainsPanel(); else showGeneralPanel();
  } catch (e) {
    showGeneralPanel();
  }

  // Autosave current domain when the page is hidden (visibilitychange).
  // Avoid relying on beforeunload since async storage may not complete during unload.
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveCurrentDomainToStorage();
    });
  } catch (e) {
    // ignore
  }

});


// Export / Import domain handlers
document.getElementById('exportDomains').addEventListener('click', async () => {
  try {
    const all = await browser.storage.local.get('domains');
    const data = JSON.stringify(all.domains || {}, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'amnesia-domains.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    document.getElementById('importStatus').textContent = 'Domains exported.';
  } catch (e) {
    console.error('Export failed:', e);
    document.getElementById('importStatus').textContent = 'Export failed.';
  }
});


const importFile = document.getElementById('importFile');
document.getElementById('importDomains').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  const importStatus = document.getElementById('domainStatus');
  importStatus.textContent = '';
  if (!f) return;
  try {
    const txt = await f.text();
    const parsed = JSON.parse(txt);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid format');
    // basic validation: each key maps to object with arrays and boolean
    const map = {};
    for (const k of Object.keys(parsed)) {
      const v = parsed[k];
      map[k] = {
        whitelist: Array.isArray(v.whitelist) ? v.whitelist : [],
        blacklist: Array.isArray(v.blacklist) ? v.blacklist : [],
        inheritVisits: !!v.inheritVisits
      };
    }

    // Get initialy selected domain 
    const currentKey = document.getElementById("domainSelect").value || GLOBAL_KEY;
    let initialSelected = (currentKey in map) ? currentKey : GLOBAL_KEY;

    // save and render
    await browser.storage.local.set({ domains: map, selectedDomain: initialSelected });
    renderDomainList(map, initialSelected);

    // ensure prevKey is set so switching saves correctly
    try { document.getElementById("domainSelect").dataset.prevKey = initialSelected; } catch (e) { }
    loadDomainToUI(initialSelected, map);

    importStatus.textContent = 'Import successful.';

    // clear input
    importFile.value = '';

  } catch (e) {
    console.error('Import failed:', e);
    importStatus.textContent = 'Import failed (invalid file).';
  }
});


// wire domain select change
document.getElementById("domainSelect").addEventListener("change", async (e) => {
  const prevSelected = document.getElementById("domainSelect").dataset.prevKey || GLOBAL_KEY;
  // save previous domain changes before switching
  try {
    const all = await browser.storage.local.get("domains");
    const map = all.domains || {};
    map[prevSelected] = collectDomainFromUI();
    await browser.storage.local.set({ domains: map, selectedDomain: e.target.value });
  } catch (err) {
    console.error("Error saving previous domain before switch:", err);
  }
  document.getElementById("domainSelect").dataset.prevKey = e.target.value;
  const all2 = await browser.storage.local.get("domains");
  loadDomainToUI(e.target.value, all2.domains || {});
});


document.getElementById("addDomain").addEventListener("click", async () => {

  // persist current edits first to avoid overwriting unsaved changes
  await saveCurrentDomainToStorage();

  const raw = document.getElementById("newDomainInput").value;
  const domain = normalizeDomain(raw);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    document.getElementById("status").textContent = "Invalid domain name.";
    return;
  }

  const all = await browser.storage.local.get("domains");
  const map = all.domains || {};
  if (map[domain]) {
    document.getElementById("domainStatus").textContent = "Domain already exists.";
    return;
  }

  // Initialize new domain
  map[domain] = { whitelist: [], blacklist: [], inheritVisits: false };
  await browser.storage.local.set({ domains: map, selectedDomain: domain });

  // Render new domain
  renderDomainList(map, domain);
  loadDomainToUI(domain, map);

  // Set prevKey to new domain
  document.getElementById("domainSelect").dataset.prevKey = domain;

  document.getElementById("newDomainInput").value = "";
  document.getElementById("domainStatus").textContent = "Domain added.";
});


document.getElementById("deleteDomain").addEventListener("click", async () => {
  
  const key = document.getElementById("domainSelect").value;
  if (!key || key === GLOBAL_KEY) {
    document.getElementById("domainStatus").textContent = "Cannot delete Global.";
    return;
  }

  const all = await browser.storage.local.get("domains");
  const map = all.domains || {};

  if (map[key]) delete map[key];
  await browser.storage.local.set({ domains: map, selectedDomain: GLOBAL_KEY });

  renderDomainList(map, GLOBAL_KEY);
  loadDomainToUI(GLOBAL_KEY, map);

  // Kill prevKey to prevent deleted domain to spawn again
  document.getElementById("domainSelect").dataset.prevKey = GLOBAL_KEY;
  document.getElementById("domainStatus").textContent = "Domain deleted.";
});



document.getElementById("save").addEventListener("click", async () => {
  try {
    const sel = document.getElementById("domainSelect");
    const currentKey = sel.value || GLOBAL_KEY;
    const domainData = collectDomainFromUI();

    const all = await browser.storage.local.get("domains");
    const map = all.domains || {};
    map[currentKey] = domainData;

    const locale = document.getElementById("localeSelect").value || "en";
    const useCache = document.getElementById("useCache").checked;
    const maxCacheSize = document.getElementById("maxCacheSize").value || 1000;
    const urlsLimit = document.getElementById("urlsLimit").value || 100;

    await browser.storage.local.set({
      domains: map,
      selectedDomain: currentKey,
      locale,
      useCache,
      maxCacheSize,
      urlsLimit
    });

    document.getElementById("status").textContent = "Preferences saved.";
  } catch (e) {
    console.error("Error saving preferences:", e);
    document.getElementById("status").textContent = "Error saving preferences.";
  }
});


document.getElementById("useCache").addEventListener("change", async () => {
  const cbx = document.getElementById("useCache");
  if (cbx.checked) {
    document.getElementById("maxCacheSize").disabled = false;
    document.getElementById("clearCache").disabled = false;
  } else {
    document.getElementById("maxCacheSize").disabled = true;
    document.getElementById("clearCache").disabled = true;
  }
});


document.getElementById("clearCache").addEventListener("click", async () => {
  const stored = await browser.storage.local.get("cacheSize");
  const btn = document.getElementById("clearCache");
  btn.disabled = true;
  try {
    await browser.runtime.sendMessage({
      type: "CLEAR_CACHE"
    });
    await browser.storage.local.set({ cacheSize: 0 });
    document.getElementById("status").textContent = "Cache cleared.";
    document.getElementById("cacheSize").textContent = stored.cacheSize || 0;
  } catch (e) {
    console.error("Error clearing cache: ", e);
    document.getElementById("status").textContent = "Error clearing cache.";
  } finally {
    btn.disabled = false;
  }
});


document.getElementById("resetStats").addEventListener("click", async () => {
  const btn = document.getElementById("resetStats");
  btn.disabled = true;
  try {
    await browser.storage.local.set({ stats_totalSearchTimeMs: 0, stats_searchCount: 0 });
    document.getElementById("status").textContent = "Statistics reset.";
  } catch (e) {
    console.error("Error resetting statistics:", e);
    document.getElementById("status").textContent = "Error resetting statistics.";
  } finally {
    btn.disabled = false;
  }
});
