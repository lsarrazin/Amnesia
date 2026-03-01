const GLOBAL_KEY = "__global__";


browser.browserAction.onClicked.addListener(async (tab) => {

    await browser.tabs.sendMessage(tab.id, {
        command: "POPUP_TRIGGERED",
        tabId: tab.id
    }).catch(err => {
        console.error("Exception on message send:", err);
    });

});

browser.runtime.onMessage.addListener(async (message) => {

    if (message.command === "GET_FILTERED_LINKS") {
        const pageLinks = await browser.tabs.sendMessage(message.tabId, {
            command: "GET_PAGE_LINKS"
        }).catch(err => {
            console.error("Exception on message send:", err);
            return { domain: "", links: [] };
        });

        const filteringOptions = await getFilteringOptions(pageLinks.domain);
        const filteredLinks = filterHistoryLinks(pageLinks.links, filteringOptions);

        return {
            domain: pageLinks.domain,
            inheritVisits: filteringOptions.inheritVisits,
            filteredLinks: filteredLinks
        };
    }
    else if (message.command === "CLEAR_CACHE") {

        clearCache();

    } else if (message.command === "LIMIT_CACHE_SIZE") {

        const cacheSize = message.size;
        setCacheSize(cacheSize);

    } else if (message.type === "GET_HISTORY") {

        // start timing this search
        const searchStart = Date.now();

        // Charger préférence d'héritage des visites (par défaut false)
        const stored = await browser.storage.local.get(["useCache", "urlsLimit"]);
        const useCache = !!stored.useCache;
        const urlsLimit = stored.urlsLimit || 100;

        const urls = message.urls;
        const inheritVisits = message.inheritVisits;

        const results = (urls.length <= urlsLimit) ?
            await getHistoryItems(urls, useCache, inheritVisits) :
            await sampleHistoryItems(urls, inheritVisits);

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
            console.error("Search statistics can not be saved:", e);
        }

        return {historyMode: urls.length > urlsLimit ? "sample" : "full", historyItems: results};
    }

});



async function getHistoryItems(urls, useCache, inheritVisits) {
    const results = {};

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

        const visits = await browser.history.getVisits({ url }).catch(err => {
            console.error("Error getting visits for " + url + ":", err);
            return [];
        });

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
            const historyItems = await browser.history.search({
                text: url,
                startTime: 0,
                maxResults: 50
            }).catch(err => {
                console.error("Error searching history for " + url + ":", err);
                return [];
            });

            var lastVisitTime = null;
            var visitCount = 0;
            var exactMatch = false;

            historyItems.some(item => {
                lastVisitTime = item.lastVisitTime;
                visitCount = item.visitCount;
                if (item.url === url) {
                    exactMatch = true;
                    if (useCache) updateCache(url, lastVisitTime, visitCount);
                    return true;
                } else if (inheritVisits && item.url.startsWith(url)) {
                    exactMatch = false;
                    if (useCache) updateCache(url, lastVisitTime, visitCount);
                    return true;
                } else {
                    return false;
                }
            });
            results[url] = {
                lastVisitTime: lastVisitTime,
                visitCount: visitCount,
                exactMatch: exactMatch
            };
        }
    }

    return results;
}

/**
 * 
 */

async function sampleHistoryItems(urls, inheritVisits) {
    const results = {};

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

    return results;
};


/**
 * Fetches links from any tab's content script
 * 
 * @param {number} tabId - The ID of the active tab
 * @returns Links served by the active tab's content script
 */
async function getActiveTabLinks(tabId) {
    const pageLinks = await browser.tabs.sendMessage(tabId, { command: "GET_PAGE_LINKS" });
    return pageLinks;
}


/**
 * Retrieves filtering options for the current domain from storage, including whitelist and blacklist regexes
 * @returns {Promise<Object>} filtering options for the current domain
 */
async function getFilteringOptions(domain) {

    function normalizeDomain(s) {
        return (s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
    }

    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) {
        console.error("Invalid domain name: " + domain);
        return { domain: "", whitelist: [], blacklist: [], inheritVisits: false};
    }

    const all = await browser.storage.local.get("domains");
    const map = all.domains || {};
    const config = map[normalizedDomain] || map[GLOBAL_KEY] || null;

    const whitelistRaw = config.whitelist || [];
    const blacklistRaw = config.blacklist || [];
    const inheritVisits = config.inheritVisits || false;

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

    return { domain: domain, whitelist: whitelist, blacklist: blacklist, inheritVisits: inheritVisits };
}

/**
 * Filters an array of URLs based on provided filtering options, including whitelist and blacklist regexes
 * 
 * @param {[]} links  Array of URLs to filter 
 * @param {*} options  Filtering options including whitelist and blacklist regexes
 * @returns 
 */
function filterHistoryLinks(links, options) {
    if (links.length === 0) return [];
    return links.filter(url => {
        if (options.blacklist.some(regex => regex.test(url))) {
            return false;
        }
        if (options.whitelist.length === 0 || options.whitelist.some(regex => regex.test(url))) {
            return true;
        }
        return false;
    });
}


const stored = browser.storage.local.get(["useCache", "maxCacheSize"]);
const useCache = !!stored.useCache;
const maxCacheSize = !!stored.maxCacheSize || 1000;


// We start with an empty cache
const historyCache = {};
browser.storage.local.set({ cacheSize: 0 });


// Register history event handler to update cache on navigation
if (useCache) {
    browser.history.onVisited.addListener((details) => {
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


