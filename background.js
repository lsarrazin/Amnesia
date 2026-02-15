
browser.browserAction.onClicked.addListener((tab) => {

    browser.tabs.sendMessage(tab.id, {
        type: "TRIGGER_POPUP"
    }).catch(err => {
        console.error("Erreur envoi message:", err);
    });

});


const stored = browser.storage.local.get(["useCache", "maxCacheSize"]);
const useCache = !!stored.useCache;
const maxCacheSize = !!stored.maxCacheSize || 1000;


// We start with an empty cache
const historyCache = {};
browser.storage.local.set({ cacheSize: 0 });


// Register history event handler to update cache on navigation
if (useCache) {
    browser.history.onVisited.addListener((details) => {
        console.log("Visited " + details.url);
        updateCache(details.url, details.lastVisitTime);
    });
}


function queryCache(url) {
    return historyCache[url];
}


function updateCache(url, visitTime, visitCount) {
    var now = new Date();
    const data = {
        visitTime: visitTime || now.getTime(),
        visitCount: visitCount || 1
    }
    historyCache[url] = data;

    // Save cache size stats
    const cacheSize = Object.keys(historyCache).length;
    browser.storage.local.set({ cacheSize: cacheSize });

    if (cacheSize > maxCacheSize) {
        setCacheSize(maxCacheSize);
    }
}


function setCacheSize(size) {
    const keys = Object.keys(historyCache);
    if (keys.length > size) {
        // Delete oldest values using visitTime as reference
        keys.sort((a, b) => {
            return historyCache[a].visitTime - historyCache[b].visitTime;
        });
        for (let i = 0; i < keys.length - size; i++) {
            delete historyCache[keys[i]];
        }
        browser.storage.local.set({ cacheSize: size });
    }
}   


function clearCache() {
    const keys = Object.keys(historyCache);
    for (let i = 0; i < keys.length; i++) {
        delete historyCache[keys[i]];
    }
    browser.storage.local.set({ cacheSize: 0 });
}


browser.runtime.onMessage.addListener(async (message) => {

    if (message.type === "CLEAR_CACHE") {

        console.log("Clearing cache...");
        clearCache();
       
    } else if (message.type === "LIMIT_CACHE_SIZE") {

        console.log("Limiting cache size...");

        const cacheSize = message.size;
        setCacheSize(cacheSize);

    } else if (message.type === "GET_HISTORY") {

        const results = {};

        // start timing this search
        const searchStart = Date.now();

        // Charger préférence d'héritage des visites (par défaut false)
        const stored = await browser.storage.local.get(["inheritVisits", "useCache", "urlsLimit"]);
        const inheritVisits = !!stored.inheritVisits;
        const useCache = !!stored.useCache;
        const urlsLimit = !!stored.urlsLimit;

        const urls = message.urls;
        if (urls.length <= urlsLimit) {

            for (const url of urls) {
                if (useCache) {
                    const cached = queryCache(url);
                    if (cached) {
                        results[url] = {
                            lastVisitTime: cached.visitTime,
                            visitCount: cached.visitCount,
                            exactMatch: true
                        };
                        continue;
                    }   
                }
                await browser.history.getVisits({
                    url: url
                }).then(visits => {
                    if (visits.length > 0) {
                        // Found
                        if (useCache) updateCache(url, visits[0].visitTime, visits.length);
                        results[url] = {
                            lastVisitTime: visits[0].visitTime,
                            visitCount: visits.length,
                            exactMatch: true
                        };
                    } else {
                        // Not found, perform search
                        browser.history.search({
                            text: url,
                            startTime: 0,
                            maxResults: 50
                        }).then(historyItems => {
                            historyItems.some(item => {
                                if (item.url === url) {
                                    console.warn("Url " + url + " found in search but not in visits!");
                                    if (useCache) updateCache(url, item.lastVisitTime, item.visitCount);
                                    results[url] = {
                                        lastVisitTime: item.lastVisitTime,
                                        visitCount: item.visitCount,
                                        exactMatch: true
                                    };
                                    return true;
                                } else if (inheritVisits && item.url.startsWith(url)) {
                                    if (useCache) updateCache(url, item.lastVisitTime, item.visitCount);
                                    results[url] = {
                                        lastVisitTime: item.lastVisitTime,
                                        visitCount: item.visitCount,
                                        exactMatch: false
                                    };
                                    return true;
                                } else return false;
                            }); 
                        }); 
                    }
                });
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
            const elapsed = Date.now() - searchStart;

            const stats = await browser.storage.local.get(["stats_totalSearchTimeMs", "stats_searchCount"]);
            const prevTotal = Number(stats.stats_totalSearchTimeMs || 0);
            const prevCount = Number(stats.stats_searchCount || 0);
            
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
