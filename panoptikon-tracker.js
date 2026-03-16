/**
 * Panoptikon Tracker v1.0
 * Privacy-first analytics snippet — Firebase RTDB
 * < 3KB minified · Zero cookies · Zero fingerprinting
 *
 * Usage:
 *   <script src="panoptikon-tracker.js"
 *     data-site-id="nexia-hub"
 *     data-site-name="Nexia Digital"
 *     data-site-color="#C9A84C"
 *     defer></script>
 */
(function() {
  'use strict';

  // ── Config from data attributes ──
  var sc = document.currentScript;
  if (!sc) return;
  var SITE_ID    = sc.getAttribute('data-site-id') || 'unknown';
  var SITE_NAME  = sc.getAttribute('data-site-name') || document.title;
  var SITE_COLOR = sc.getAttribute('data-site-color') || '#00FFB2';

  // ── Firebase RTDB endpoint (REST API — no SDK needed) ──
  var DB_URL = 'https://volo-sst-prod-default-rtdb.firebaseio.com';

  // ── Visitor ID (localStorage, not cookies) ──
  var VID_KEY = 'panoptikon_vid';
  var vid = localStorage.getItem(VID_KEY);
  if (!vid) {
    vid = 'v_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    localStorage.setItem(VID_KEY, vid);
  }

  // ── Device info ──
  var ua = navigator.userAgent;
  var device = {
    type: /Mobi|Android/i.test(ua) ? 'mobile' : /Tablet|iPad/i.test(ua) ? 'tablet' : 'desktop',
    viewport: window.innerWidth + 'x' + window.innerHeight
  };

  // ── Geolocation (ipapi.co — free, privacy-first, IP anonymized) ──
  var geo = null;
  var geoXhr = new XMLHttpRequest();
  geoXhr.open('GET', 'https://ipapi.co/json/', true);
  geoXhr.timeout = 3000;
  geoXhr.onload = function() {
    try {
      var d = JSON.parse(geoXhr.responseText);
      geo = { city: d.city || '', region: d.region || '', country: d.country_name || '', lat: d.latitude || 0, lng: d.longitude || 0 };
    } catch(e) {}
  };
  geoXhr.send();

  // ── State ──
  var startedAt = new Date().toISOString();
  var lastEvent = 0;        // rate limit: 1 event/sec
  var scrollMax = 0;        // max scroll depth %
  var idleTimer = null;
  var isIdle = false;
  var heartbeatInterval = null;
  var page = location.pathname + location.search;

  // ── Bot filtering ──
  var bots = /bot|crawl|spider|slurp|googlebot|bingbot|yandex|baidu|duckduck|facebookexternalhit|twitterbot|linkedinbot|whatsapp/i;
  if (bots.test(ua)) return;

  // ── Helpers ──
  function rtdbPut(path, data) {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', DB_URL + path + '.json', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  function rtdbPost(path, data) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', DB_URL + path + '.json', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  function rtdbDelete(path) {
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', DB_URL + path + '.json', true);
    xhr.send();
  }

  function elapsed() {
    return Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
  }

  function throttled() {
    var now = Date.now();
    if (now - lastEvent < 1000) return true;
    lastEvent = now;
    return false;
  }

  // ── Live presence ──
  function updateLive(extra) {
    var data = {
      site_id: SITE_ID,
      site_name: SITE_NAME,
      site_color: SITE_COLOR,
      page: page,
      device: device,
      geo: geo || null,
      started_at: startedAt,
      last_heartbeat: new Date().toISOString(),
      duration_seconds: elapsed(),
      scroll_depth: scrollMax,
      idle: isIdle
    };
    if (extra) {
      for (var k in extra) data[k] = extra[k];
    }
    rtdbPut('/tracking/live/' + vid, data);
  }

  // ── Track event ──
  function trackEvent(type, meta) {
    if (throttled()) return;
    var ev = {
      visitor_id: vid,
      site_id: SITE_ID,
      event_type: type,
      page: page,
      timestamp: new Date().toISOString(),
      metadata: meta || null
    };
    rtdbPost('/tracking/events', ev);
  }

  // ── Scroll depth ──
  function onScroll() {
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    if (docH <= 0) return;
    var pct = Math.round((window.scrollY / docH) * 100);
    if (pct > scrollMax) scrollMax = pct;
  }

  // ── Idle detection (60s without interaction) ──
  function resetIdle() {
    if (isIdle) { isIdle = false; updateLive(); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() {
      isIdle = true;
      updateLive();
    }, 60000);
  }

  // ── Init ──
  function init() {
    // Page view event
    trackEvent('page_view');

    // Initial live presence
    updateLive();

    // Heartbeat every 30s
    heartbeatInterval = setInterval(function() {
      updateLive();
    }, 30000);

    // Scroll tracking (passive)
    window.addEventListener('scroll', onScroll, { passive: true });

    // Idle detection
    ['mousemove', 'keydown', 'touchstart', 'click'].forEach(function(evt) {
      document.addEventListener(evt, resetIdle, { passive: true });
    });
    resetIdle();

    // Click tracking (links & buttons)
    document.addEventListener('click', function(e) {
      var target = e.target.closest('a, button');
      if (!target) return;
      var label = target.textContent.trim().substring(0, 60);
      var href = target.getAttribute('href') || '';
      trackEvent('click', { label: label, href: href });
    });

    // Form submit tracking
    document.addEventListener('submit', function(e) {
      var form = e.target;
      var id = form.id || form.action || 'form';
      trackEvent('form_submit', { form: id });
    });

    // Scroll depth event on leave
    function onLeave() {
      trackEvent('scroll_depth', { depth: scrollMax });
      trackEvent('time_on_page', { seconds: elapsed() });
      // Clean up live presence
      rtdbDelete('/tracking/live/' + vid);
    }

    // Cleanup on page leave
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        onLeave();
        clearInterval(heartbeatInterval);
      } else if (document.visibilityState === 'visible') {
        startedAt = new Date().toISOString();
        scrollMax = 0;
        updateLive();
        heartbeatInterval = setInterval(function() { updateLive(); }, 30000);
      }
    });
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
