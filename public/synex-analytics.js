(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !script.dataset.siteId || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  var endpoint = new URL('/api/public/analytics/collect', script.src).href;
  var site = script.dataset.siteId;
  function send(kind, id) {
    if (!crypto.randomUUID) return;
    fetch(endpoint, { method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: site, eventId: id || crypto.randomUUID(), kind: kind })
    }).catch(function () {});
  }
  var visitId = null;
  try {
    var key = 'synex-visit-' + site;
    var previous = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (previous && Date.now() - previous.at < 30 * 60 * 1000) visitId = previous.id;
    else { visitId = crypto.randomUUID(); sessionStorage.setItem(key, JSON.stringify({ id: visitId, at: Date.now() })); }
  } catch (_) {}
  send('visit', visitId);
  window.synexAnalytics = { conversion: function (eventId) { send('conversion', eventId); } };
  window.addEventListener('synex:conversion', function (event) { send('conversion', event.detail && event.detail.eventId); });
})();