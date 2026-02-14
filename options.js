document.addEventListener("DOMContentLoaded", async () => {

  const stored = await browser.storage.local.get([
    "whitelist",
    "blacklist"
  ]);

  document.getElementById("whitelist").value =
    (stored.whitelist || []).join("\n");

  document.getElementById("blacklist").value =
    (stored.blacklist || []).join("\n");
  document.getElementById("inheritVisits").checked = !!stored.inheritVisits;
  document.getElementById("localeSelect").value = stored.locale || "en";
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

  await browser.storage.local.set({
    whitelist,
    blacklist
  });

  const inheritVisits = document.getElementById("inheritVisits").checked;
  const locale = document.getElementById("localeSelect").value || "en";
  await browser.storage.local.set({ inheritVisits, locale });

  document.getElementById("status").textContent = "Preferences saved.";
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
