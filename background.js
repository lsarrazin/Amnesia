console.log("Background script chargé");

browser.browserAction.onClicked.addListener((tab) => {
  console.log("Icône cliquée");

  browser.tabs.sendMessage(tab.id, {
    type: "TRIGGER_POPUP"
  }).catch(err => {
    console.error("Erreur envoi message:", err);
  });
});

browser.runtime.onMessage.addListener(async (message) => {

  if (message.type === "GET_HISTORY") {

    console.log("Requête historique reçue");

    const urls = message.urls;

    const historyItems = await browser.history.search({
      text: "",
      startTime: 0,
      maxResults: 10000
    });

    const historyMap = new Map();
    historyItems.forEach(item => {
      historyMap.set(item.url, item);
    });

    const results = {};

    urls.forEach(url => {
      const item = historyMap.get(url);
      if (item) {
        results[url] = {
          lastVisitTime: item.lastVisitTime,
          visitCount: item.visitCount
        };
      }
    });

    return results;
  }

});
