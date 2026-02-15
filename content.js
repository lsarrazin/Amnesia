browser.runtime.onMessage.addListener((message) => {
  if (message.type === "TRIGGER_POPUP") {
    createPopup();
  }
});

async function createPopup() {

  // --------- Récupération préférences ---------

  // --------- Récupération préférences ---------

  const stored = await browser.storage.local.get([
  "whitelist",
  "blacklist",
  "locale"
  ]);

  const whitelistRaw = stored.whitelist || [];
  const blacklistRaw = stored.blacklist || [];

  function compile(list) {
  return list.map(r => {
      try {
      return new RegExp(r);
      } catch {
      return null;
      }
  }).filter(Boolean);
  }

  const whitelist = compile(whitelistRaw);
  const blacklist = compile(blacklistRaw);

  const locale = stored.locale || "en";
  const translations = {
    en: {
      title: `Amnesia - links found`,
      labels: { link: "Link", lastVisit: "Last visit", visits: "Visits", exact: "Exact" },
      querying: "Querying",
      urlsWord: "URL",
      estimated: "Estimated",
      never: "Never",
      yes: "Yes",
      no: "No"
    },
    fr: {
      title: `Amnesia - liens trouvés`,
      labels: { link: "Lien", lastVisit: "Dernière visite", visits: "Nb visites", exact: "Exacte" },
      querying: "Interrogation de",
      urlsWord: "URL",
      estimated: "Estimé",
      never: "Jamais",
      yes: "Oui",
      no: "Non"
    },
    es: {
      title: `Amnesia - enlaces encontrados`,
      labels: { link: "Enlace", lastVisit: "Última visita", visits: "Visitas", exact: "Exacto" },
      querying: "Consultando",
      urlsWord: "URL",
      estimated: "Estimado",
      never: "Nunca",
      yes: "Sí",
      no: "No"
    },
    de: {
      title: `Amnesia - gefundene Links`,
      labels: { link: "Link", lastVisit: "Letzter Besuch", visits: "Besuche", exact: "Exakt" },
      querying: "Abfrage",
      urlsWord: "URL",
      estimated: "Geschätzt",
      never: "Nie",
      yes: "Ja",
      no: "Nein"
    }
  };
  const t = translations[locale] || translations.en;

  // --------- Collecte + déduplication robuste ---------

  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(a => new URL(a.href).toString());

  const uniqueLinks = [...new Set(links)];

  // --------- Filtrage double système ---------

  let filteredLinks = uniqueLinks;

  // Whitelist (si non vide)
  if (whitelist.length > 0) {
    filteredLinks = filteredLinks.filter(url => {
      let res = false;
      for (const regex of whitelist) {
        if (regex.test(url)) {
          console.log(url + " matched whitelisted regex:" + regex);
          res = true;
          break;
        }
      }
      return res;
    });
  }

  // Blacklist
  if (blacklist.length > 0) {
    filteredLinks = filteredLinks.filter(url => {
      let res = true;
      for (const regex of blacklist) {
        if (regex.test(url)) {
          console.log(url + " matched blacklisted regex:" + regex);
          res = false;
          break;
        }
      }
      return res;
    });
  }

  // --------- UI ---------

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
  popup.style.width = "90vw";
  popup.style.height = "90vh";
  popup.style.maxWidth = "1200px";
  popup.style.borderRadius = "8px";
  popup.style.display = "flex";
  popup.style.flexDirection = "column";
  popup.style.padding = "8px";
  popup.style.fontFamily = "Arial";
  popup.style.fontSize = "13px";
  popup.style.position = "relative";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.padding = "4px 0px";
  header.style.background = "#2b2b2b";
  header.style.color = "#ffffff";
  header.style.margin = "-8px -8px 8px -8px";
  header.style.borderTopLeftRadius = "8px";
  header.style.borderTopRightRadius = "8px";
  header.style.zIndex = "3";

  const title = document.createElement("p");
  title.textContent = `${t.title} (${filteredLinks.length}/${uniqueLinks.length})`;
  title.style.justifyContent = "center";
  title.style.margin = "0px 16px";
  title.style.fontSize = "14px";
  title.style.fontWeight = "600";

  let loaderInterval = null;
  let spinnerCountdownInterval = null;

  const closeBtn = document.createElement("button");
  closeBtn.id = "closeBtn";
  closeBtn.textContent = "✖";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.color = "#ffffff";
  closeBtn.style.width = "28px";
  closeBtn.style.height = "28px";
  closeBtn.style.borderRadius = "4px";
  closeBtn.style.display = "inline-flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "14px";
  closeBtn.style.padding = "0";
  closeBtn.style.margin = "0";
  closeBtn.style.boxShadow = "none";
  closeBtn.style.transition = "background 120ms ease";
  closeBtn.onmouseenter = () => closeBtn.style.background = "rgba(255,255,255,0.06)";
  closeBtn.onmouseleave = () => closeBtn.style.background = "transparent";

  closeBtn.onclick = () => {
    if (loaderInterval) {
      clearInterval(loaderInterval);
      loaderInterval = null;
    }
    if (spinnerCountdownInterval) {
      clearInterval(spinnerCountdownInterval);
      spinnerCountdownInterval = null;
    }
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  popup.appendChild(header);

  const tableContainer = document.createElement("div");
  tableContainer.style.flex = "1";
  tableContainer.style.overflowY = "auto";
  tableContainer.style.marginTop = "2px";

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  table.style.tableLayout = "auto";
  table.style.fontSize = "12px";
  // Construire le header du tableau sans innerHTML
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const headers = [
    { label: t.labels.link, field: "url", width: "60%" },
    { label: t.labels.lastVisit, field: "lastVisitTime", width: "20%" },
    { label: t.labels.visits, field: "visitCount", width: "10%" },
    { label: t.labels.exact, field: "exactMatch", width: "10%" }
  ];
  headers.forEach(h => {
    const th = document.createElement("th");
    th.dataset.field = h.field;
    th.style.width = h.width;
    th.style.textAlign = "left";
    th.style.padding = "0px 8px 0px 8px";

    th.appendChild(document.createTextNode(h.label + " "));

    const span = document.createElement("span");
    span.className = "sort-indicator";
    span.style.marginLeft = "6px";
    th.appendChild(span);

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbodyEl = document.createElement("tbody");
  table.appendChild(tbodyEl);

  tableContainer.appendChild(table);
  popup.appendChild(tableContainer);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Afficher un conteneur centré occupant 50% de la popup avec un spinner bleu
  const spinnerWrapper = document.createElement("div");
  spinnerWrapper.style.position = "absolute";
  spinnerWrapper.style.left = "50%";
  spinnerWrapper.style.top = "50%";
  spinnerWrapper.style.transform = "translate(-50%,-50%)";
  spinnerWrapper.style.width = "50%";
  spinnerWrapper.style.height = "50%";
  spinnerWrapper.style.display = "flex";
  spinnerWrapper.style.flexDirection = "column";
  spinnerWrapper.style.alignItems = "center";
  spinnerWrapper.style.justifyContent = "center";
  spinnerWrapper.style.background = "rgba(255,255,255,0.9)";
  spinnerWrapper.style.zIndex = "2";

  const spinner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  spinner.setAttribute("viewBox", "0 0 100 100");
  spinner.style.width = "100%";
  spinner.style.height = "80%";

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "50");
  circle.setAttribute("cy", "50");
  circle.setAttribute("r", "40");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "#2563eb");
  circle.setAttribute("stroke-width", "8");
  circle.setAttribute("stroke-linecap", "round");
  circle.setAttribute("stroke-dasharray", "180 280");

  const anim = document.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
  anim.setAttribute("attributeName", "transform");
  anim.setAttribute("type", "rotate");
  anim.setAttribute("from", "0 50 50");
  anim.setAttribute("to", "360 50 50");
  anim.setAttribute("dur", "1s");
  anim.setAttribute("repeatCount", "indefinite");

  circle.appendChild(anim);
  spinner.appendChild(circle);

  const info = document.createElement("div");
  info.style.marginTop = "8px";
  info.style.fontSize = "14px";
  info.style.color = "#2563eb";
  info.style.textAlign = "center";
  
  // compute average search duration from stored stats (ms)
  const stats = await browser.storage.local.get(["stats_totalSearchTimeMs", "stats_searchCount"]);
  const totalMs = Number(stats.stats_totalSearchTimeMs || 0);
  const statCount = Number(stats.stats_searchCount || 0);
  const avgMs = statCount > 0 ? (totalMs / statCount) : 1000;

  let estimatedMs = avgMs;
  info.textContent = `${t.querying} ${filteredLinks.length} ${t.urlsWord}${filteredLinks.length > 1 ? 's' : ''}… ${t.estimated}: ${Math.ceil(estimatedMs/1000)}s`;

  spinnerWrapper.appendChild(spinner);
  spinnerWrapper.appendChild(info);
  popup.insertBefore(spinnerWrapper, tableContainer);

  // start countdown display based on estimatedMs
  const spinnerStart = Date.now();
  spinnerCountdownInterval = setInterval(() => {
    const elapsed = Date.now() - spinnerStart;
    const remainingSeconds = Math.max(0, Math.ceil((estimatedMs - elapsed) / 1000));
    info.textContent = `${t.querying} ${filteredLinks.length} ${t.urlsWord}${filteredLinks.length > 1 ? 's' : ''}… ${t.estimated}: ${remainingSeconds}s`;
  }, 250);

  const historyData = await browser.runtime.sendMessage({
    type: "GET_HISTORY",
    urls: filteredLinks
  });

  // Retirer le spinner après la récupération
  if (spinnerCountdownInterval) {
    clearInterval(spinnerCountdownInterval);
    spinnerCountdownInterval = null;
  }
  if (spinnerWrapper && spinnerWrapper.parentNode) spinnerWrapper.parentNode.removeChild(spinnerWrapper);

  const data = filteredLinks.map(url => {
    const h = historyData[url];
    return {
      url,
      lastVisitTime: h ? h.lastVisitTime : null,
      visitCount: h ? h.visitCount : 0,
      exactMatch: h ? !!h.exactMatch : false
    };
  });

  let sortField = "url";
  let sortDirection = 1;

  const tbody = table.querySelector("tbody");

  function render() {

    // Vider le tbody sans utiliser innerHTML
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    // Met à jour les indicateurs de tri sur les en-têtes
    table.querySelectorAll("th").forEach(th => {
      const ind = th.querySelector(".sort-indicator");
      if (ind) {
        ind.textContent = (th.dataset.field === sortField ? (sortDirection === 1 ? "▲" : "▼") : "");
      }
    });

    const sorted = [...data].sort((a, b) => {

      let valA = a[sortField] ?? 0;
      let valB = b[sortField] ?? 0;

      if (sortField === "url") {
        return sortDirection * valA.localeCompare(valB);
      }

      return sortDirection * ((valA || 0) - (valB || 0));
    });

    sorted.forEach(d => {

      const row = document.createElement("tr");

      if (!d.lastVisitTime) {
        row.style.background = "#ffeaea"; // highlight never visited
      }

      // Construire la ligne sans innerHTML
      const tdUrl = document.createElement("td");
      tdUrl.style.padding = "0px 8px 0px 8px";
      tdUrl.style.verticalAlign = "top";

      const a = document.createElement("a");
      a.href = d.url;
      a.target = "_blank";
      a.style.color = "#66a0ff";
      a.style.textDecoration = "none";
      a.style.display = "block";
      a.style.wordBreak = "break-all";
      a.textContent = d.url;

      tdUrl.appendChild(a);

      const tdLast = document.createElement("td");
      tdLast.style.padding = "0px 8px 0px 8px";
      tdLast.style.verticalAlign = "top";
      tdLast.textContent = d.lastVisitTime ? new Date(d.lastVisitTime).toLocaleString() : t.never;


      const tdCount = document.createElement("td");
      tdCount.style.padding = "0px 8px 0px 8px";
      tdCount.style.verticalAlign = "top";
      tdCount.textContent = String(d.visitCount);

      const tdExact = document.createElement("td");
      tdExact.style.padding = "0px 8px 0px 8px";
      tdExact.style.verticalAlign = "top";
      tdExact.style.textAlign = "center";
      tdExact.textContent = d.exactMatch ? t.yes : t.no;

      row.appendChild(tdUrl);
      row.appendChild(tdLast);
      row.appendChild(tdCount);
      row.appendChild(tdExact);

      tbody.appendChild(row);
    });
  }

  table.querySelectorAll("th").forEach(th => {
    th.style.cursor = "pointer";
    th.style.lineHeight = "normal";
    th.onclick = () => {
      const field = th.dataset.field;
      if (sortField === field) {
        sortDirection *= -1;
      } else {
        sortField = field;
        sortDirection = 1;
      }
      render();
    };
  });

  render();
}
