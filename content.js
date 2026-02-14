console.log("Content script chargé");

browser.runtime.onMessage.addListener((message) => {

  if (message.type === "TRIGGER_POPUP") {
    console.log("Message reçu dans content script");
    createPopup();
  }

});

async function createPopup() {

  console.log("Création popup");

  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(a => a.href);

  const uniqueLinks = [...new Set(links)];

  // Popup immédiate
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.4)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  const popup = document.createElement("div");
  popup.style.background = "white";
  popup.style.padding = "20px";
  popup.style.borderRadius = "8px";
  popup.style.width = "500px";
  popup.style.fontFamily = "Arial";

  popup.innerHTML = `
    <h2>Chargement...</h2>
    <p>Analyse de ${uniqueLinks.length} liens</p>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Appel background
  const historyData = await browser.runtime.sendMessage({
    type: "GET_HISTORY",
    urls: uniqueLinks
  });

  console.log("Historique reçu");

  popup.innerHTML = `
    <h2>Historique des liens (${uniqueLinks.length})</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <th style="text-align:left;border-bottom:1px solid #ddd;">Lien</th>
        <th style="text-align:left;border-bottom:1px solid #ddd;">Dernière visite</th>
        <th style="text-align:left;border-bottom:1px solid #ddd;">Nb visites</th>
      </tr>
    </table>
  `;

  const table = popup.querySelector("table");

  uniqueLinks.forEach(url => {

    const data = historyData[url];

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${url}</td>
      <td>${data ? new Date(data.lastVisitTime).toLocaleString() : "Jamais"}</td>
      <td>${data ? data.visitCount : 0}</td>
    `;

    table.appendChild(row);
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Fermer";
  closeBtn.style.marginTop = "15px";
  closeBtn.onclick = () => document.body.removeChild(overlay);

  popup.appendChild(closeBtn);
}
