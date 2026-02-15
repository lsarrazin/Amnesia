document.addEventListener("DOMContentLoaded", async () => {

  const stored = await browser.storage.local.get([
    "whitelist",
    "blacklist",
    "inheritVisits",
    "locale",
    "useCache",
    "maxCacheSize",
    "cacheSize",
    "urlsLimit"
  ]);

  document.getElementById("whitelist").value =
    (stored.whitelist || []).join("\n");

  document.getElementById("blacklist").value =
    (stored.blacklist || []).join("\n");
  
  document.getElementById("inheritVisits").checked = !!stored.inheritVisits;
  document.getElementById("localeSelect").value = stored.locale || "en";
  const useCache = !!stored.useCache;
  document.getElementById("useCache").checked = useCache;
  document.getElementById("maxCacheSize").disabled = !useCache;
  document.getElementById("clearCache").disabled = !useCache;
  document.getElementById("maxCacheSize").value = stored.maxCacheSize || 1000;
  document.getElementById("cacheSize").textContent = stored.cacheSize || 0;
  document.getElementById("urlsLimit").value = stored.urlsLimit || 100;

});


document.getElementById("save").addEventListener("click", async () => {

  const whitelist = document.getElementById("whitelist").value
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const blacklist = document.getElementById("blacklist").value
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const inheritVisits = document.getElementById("inheritVisits").checked;
  const locale = document.getElementById("localeSelect").value || "en";
  const useCache = document.getElementById("useCache").checked;
  const maxCacheSize = document.getElementById("maxCacheSize").value || 1000;
  const urlsLimit = document.getElementById("urlsLimit").value || 100;

  await browser.storage.local.set({
    locale,
    whitelist,
    blacklist,
    inheritVisits,
    useCache,
    maxCacheSize,
    urlsLimit
  });

  document.getElementById("status").textContent = "Preferences saved.";
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
