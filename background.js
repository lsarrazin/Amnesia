
browser.browserAction.onClicked.addListener((tab) => {

    browser.tabs.sendMessage(tab.id, {
    type: "TRIGGER_POPUP"
  }).catch(err => {
    console.error("Erreur envoi message:", err);
  });

});

browser.runtime.onMessage.addListener(async (message) => {

  if (message.type === "GET_HISTORY") {

    console.log("Requête historique reçue");
    const results = {};

        // start timing this search
        const searchStart = Date.now();

        // Charger préférence d'héritage des visites (par défaut false)
        const stored = await browser.storage.local.get("inheritVisits");
        const inheritVisits = !!stored.inheritVisits;

    const urls = message.urls;
    if (urls.length <= 100) {

        // To be more accurate, query URLs one by one and optionally consider child URLs
        const historyMap = new Map();
        for (const url of urls) {

            console.log("Requête historique pour URL: " + url);

            // request several results so we can find children if needed
            const historyItems = await browser.history.search({ 
                text: url,
                startTime: 0,
                maxResults: 20
            });

            historyItems.forEach(item => {
                historyMap.set(item.url, item);
            });
        }

        for (const url of urls) {
            let item = historyMap.get(url);
            let exactMatch = false;
            if (item) exactMatch = (item.url === url);
            if (!item && inheritVisits) {
                // find the most recently visited child URL whose URL starts with the parent URL
                let best = null;
                for (const [hurl, hitem] of historyMap.entries()) {
                    if (hurl.startsWith(url) && hitem.lastVisitTime) {
                        if (!best || hitem.lastVisitTime > best.lastVisitTime) best = hitem;
                    }
                }
                if (best) {
                  item = best;
                  exactMatch = false;
                }
            }

            if (item) {
                results[url] = {
                lastVisitTime: item.lastVisitTime,
                visitCount: item.visitCount,
                exactMatch: !!exactMatch
                };
            }
        }

    } else {

        // Let's sample last 10000 visited URLs
        const historyItems = await browser.history.search({
            text: "",
            startTime: 0,
            maxResults: 10000
        });

        const historyMap = new Map();
        historyItems.forEach(item => {
            historyMap.set(item.url, item);
        });

        for (const url of urls) {
            let item = historyMap.get(url);
            let exactMatch = false;
            if (item) exactMatch = (item.url === url);
            if (!item && inheritVisits) {
                // find most recent child in the sampled history
                let best = null;
                for (const [hurl, hitem] of historyMap.entries()) {
                    if (hurl.startsWith(url) && hitem.lastVisitTime) {
                        if (!best || hitem.lastVisitTime > best.lastVisitTime) best = hitem;
                    }
                }
                if (best) {
                  item = best;
                  exactMatch = false;
                }
            }

            if (item) {
                results[url] = {
                lastVisitTime: item.lastVisitTime,
                visitCount: item.visitCount,
                exactMatch: !!exactMatch
                };
            }
        }

    }
        // persist timing stats: total time and count
        try {
            const stats = await browser.storage.local.get(["stats_totalSearchTimeMs", "stats_searchCount"]);
            const prevTotal = Number(stats.stats_totalSearchTimeMs || 0);
            const prevCount = Number(stats.stats_searchCount || 0);
            const elapsed = Date.now() - searchStart;
            await browser.storage.local.set({
                stats_totalSearchTimeMs: prevTotal + elapsed,
                stats_searchCount: prevCount + 1
            });
        } catch (e) {
            console.error("Erreur en sauvegarde des stats de recherche:", e);
        }

        return results;

  }

});
