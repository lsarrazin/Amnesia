function getActiveTab() {
  return browser.tabs.query({ active: true, currentWindow: true });
}

async function getHistory() {

  const tabs = await getActiveTab();
  const tab = tabs[0];

  // Gather links from background script
  const filtered = await browser.runtime.sendMessage({
    command: "GET_FILTERED_LINKS",
    tabId: tab.id
  });
  const inheritVisits = filtered.inheritVisits;
  const filteredLinks = filtered.filteredLinks;
  const domain = filtered.domain || getPageDomain();

  const headerTitle = document.getElementById("header-title");
  headerTitle.textContent = `Amnesia - remind ${domain}`;

  // compute average search duration from stored stats (ms)
  const stats = await browser.storage.local.get(["stats_totalSearchTimeMs", "stats_searchCount"]);
  const totalMs = Number(stats.stats_totalSearchTimeMs || 0);
  const statCount = Number(stats.stats_searchCount || 0);
  const avgMs = statCount > 0 ? (totalMs / statCount) : 1000;

  let estimatedMs = avgMs;
  const loaderText = document.getElementById("loader-text");
  loaderText.textContent = `Recovering memory from ${filteredLinks.length} link${filteredLinks.length > 1 ? 's' : ''}… Estimated: ${Math.ceil(estimatedMs / 1000)}s`;

  // Update .loader class
  const styleSheet = document.styleSheets[0];
  for (const rule of styleSheet.cssRules) {
    if (rule.selectorText === ".loader::before") {
      rule.style.animationDuration = `${estimatedMs}ms`;
      break;
    }
  }

  // start countdown display based on estimatedMs
  const spinnerStart = Date.now();
  spinnerCountdownInterval = setInterval(() => {
    const elapsed = Date.now() - spinnerStart;
    const remainingSeconds = Math.max(0, Math.ceil((estimatedMs - elapsed) / 1000));
    loaderText.textContent = `Recovering memory from ${filteredLinks.length} link${filteredLinks.length > 1 ? 's' : ''}… Estimated: ${remainingSeconds}s`;
  }, 250);

  const historyData = await browser.runtime.sendMessage({
    type: "GET_HISTORY",
    inheritVisits: inheritVisits,
    urls: filteredLinks
  });

  return historyData;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleString();
}


function renderHistory(items, sortOrder) {
  
  const sortOptions = {
    "UrlAsc": { field: "url", direction: 1 },
    "UrlDesc": { field: "url", direction: -1 },
    "LastVisitAsc": { field: "lastVisitTime", direction: 1 },
    "LastVisitDesc": { field: "lastVisitTime", direction: -1 },
    "VisitsAsc": { field: "visitCount", direction: 1 },
    "VisitsDesc": { field: "visitCount", direction: -1 },
  }

  let sortField = "lastVisitTime";
  let sortDirection = -1;
  if (sortOrder in sortOptions) {
    sortField = sortOptions[sortOrder].field;
    sortDirection = sortOptions[sortOrder].direction;
  }

  const data = [];
  for (const url of Object.keys(items)) {
    const h = items[url];
    data.push({
      url,
      lastVisitTime: h ? h.lastVisitTime : null,
      visitCount: h ? h.visitCount : 0,
      exactMatch: h ? !!h.exactMatch : false
    });
  }

  const tbody = document.getElementById("table-body");
  const thead = document.getElementById("table-head");

  function render() {

    // Update sort indicators
    thead.querySelectorAll("th").forEach(th => {
        const ind = th.querySelector(".sort-indicator");
        if (ind) {
          ind.textContent = (th.id === sortField ? (sortDirection === 1 ? "▲" : "▼") : "");
        }
    });

    // Reset table body
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    // Sort data
    data.sort((a, b) => {
      if (a[sortField] < b[sortField]) return -1 * sortDirection;
      if (a[sortField] > b[sortField]) return 1 * sortDirection;
      return 0;
    });

    // Fill table body
    data.forEach(item => {
      const tr = document.createElement("tr");

      const a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.style.color = item.visitCount > 0 ? "#b68abe" : "#66a0ff";
      a.textContent = item.url;

      const tdUrl = document.createElement("td");
      tdUrl.style.width = "480px";
      tdUrl.style.textAlign = "left";
      tdUrl.appendChild(a);

      const tdLast = document.createElement("td");
      tdLast.style.width = "160px";
      tdLast.textContent = item.lastVisitTime ? formatDate(item.lastVisitTime) : "Never";

      const tdCount = document.createElement("td");
      tdCount.style.width = "80px";
      tdCount.style.textAlign = "center";
      tdCount.textContent = String(item.visitCount);

      const tdExact = document.createElement("td");
      tdExact.style.width = "80px";
      tdExact.style.textAlign = "center";
      tdExact.textContent = item.exactMatch ? "Yes" : "No";

      tr.appendChild(tdUrl);
      tr.appendChild(tdLast);
      tr.appendChild(tdCount);
      tr.appendChild(tdExact);

      tbody.appendChild(tr);
    });
  }

  render();

  // Add click listeners for sorting
  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const field = th.id;
      if (field === sortField) {
        sortDirection *= -1; // Toggle direction
      } else {
        sortField = field;
        sortDirection = 1; // Default to ascending
      }
      render();
    });
  });
}

async function init() {
  const stored = await browser.storage.local.get(["locale", "sortOrder"]);

  // Retrieve preferences ---------
  const locale = stored.locale || "en";
  const sortOrder = stored.sortOrder || "DateDesc";

  const historyItems = await getHistory();

  // Hide animation and show table
  document.getElementById("anim-div").style.display = "none";
  document.getElementById("table-div").style.display = "block";

  renderHistory(historyItems, sortOrder);
}


document.getElementById("close").addEventListener("click", () => {
  window.close();
});

document.getElementById("options").addEventListener("click", () => {
  window.location.href = "../options/options.html";
});

document.getElementById("refresh").addEventListener("click", () => {
  // Show animation and hide table
  document.getElementById("anim-div").style.display = "block";
  document.getElementById("table-div").style.display = "none";

  init();
});

init();
