document.addEventListener("DOMContentLoaded", async () => {

  const stored = await browser.storage.local.get([
    "whitelist",
    "blacklist"
  ]);

  document.getElementById("whitelist").value =
    (stored.whitelist || []).join("\n");

  document.getElementById("blacklist").value =
    (stored.blacklist || []).join("\n");
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

  document.getElementById("status").textContent = "Préférences enregistrées.";
});
