// ══════════════════════════════════════════
//  VOLO SST — Network Status Module
//  Bandeau offline + compteur queue + auto-flush
//  Usage: VoloNetwork.init()  (appeler après DOMContentLoaded)
// ══════════════════════════════════════════

var VoloNetwork = (function() {
  'use strict';

  var _initialized = false;
  var _bannerId = 'volo-offline-banner';
  var _badgeId = 'volo-queue-badge';
  var _queueKeys = ['volo_queue', 'volo_fb_queue', 'volo_pointage_queue', 'volo_inv_offline_queue', 'volo_agenda_offline_queue'];
  var _refreshInterval = null;

  // ── Count total queued items across all queues ──
  function getQueueCount() {
    var total = 0;
    for (var i = 0; i < _queueKeys.length; i++) {
      try {
        var raw = localStorage.getItem(_queueKeys[i]);
        if (raw) {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr)) total += arr.length;
        }
      } catch(e) {}
    }
    return total;
  }

  // ── Inject CSS (once) ──
  function _injectStyles() {
    if (document.getElementById('volo-network-css')) return;
    var style = document.createElement('style');
    style.id = 'volo-network-css';
    style.textContent = [
      '#' + _bannerId + '{',
      '  position:fixed;top:0;left:0;right:0;z-index:99999;',
      '  padding:10px 16px;',
      '  background:linear-gradient(135deg,rgba(192,57,43,.95),rgba(155,35,25,.95));',
      '  color:#fff;display:flex;align-items:center;gap:10px;',
      '  font-family:"Oswald",sans-serif;font-size:13px;letter-spacing:1px;',
      '  border-bottom:2px solid rgba(255,255,255,.15);',
      '  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
      '  transform:translateY(-100%);transition:transform .3s ease;',
      '  box-shadow:0 4px 20px rgba(0,0,0,.4);',
      '}',
      '#' + _bannerId + '.visible{transform:translateY(0);}',
      '#' + _bannerId + ' .vn-dot{',
      '  width:8px;height:8px;border-radius:50%;background:#fff;',
      '  animation:vn-pulse 1.5s infinite;flex-shrink:0;',
      '}',
      '#' + _bannerId + ' .vn-text{flex:1;font-weight:600;}',
      '#' + _bannerId + ' .vn-queue{',
      '  padding:2px 8px;border-radius:10px;',
      '  background:rgba(255,255,255,.2);font-size:11px;',
      '  font-family:"JetBrains Mono",monospace;white-space:nowrap;',
      '}',
      '#' + _badgeId + '{',
      '  position:fixed;top:8px;right:12px;z-index:99998;',
      '  padding:4px 10px;border-radius:12px;',
      '  font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;',
      '  letter-spacing:1px;display:none;cursor:pointer;',
      '  transition:all .3s ease;',
      '}',
      '#' + _badgeId + '.online{',
      '  background:rgba(39,174,96,.12);color:var(--green,#27AE60);',
      '  border:1px solid rgba(39,174,96,.3);',
      '}',
      '#' + _badgeId + '.online .vn-bdot{background:var(--green,#27AE60);}',
      '#' + _badgeId + '.offline{',
      '  background:rgba(192,57,43,.15);color:var(--red,#E74C3C);',
      '  border:1px solid rgba(192,57,43,.3);',
      '}',
      '#' + _badgeId + '.offline .vn-bdot{background:var(--red,#E74C3C);}',
      '#' + _badgeId + '.has-queue{',
      '  background:rgba(230,126,34,.15);color:var(--orange,#E67E22);',
      '  border:1px solid rgba(230,126,34,.3);',
      '}',
      '#' + _badgeId + '.has-queue .vn-bdot{background:var(--orange,#E67E22);}',
      '.vn-bdot{',
      '  display:inline-block;width:6px;height:6px;border-radius:50%;',
      '  margin-right:6px;vertical-align:middle;',
      '  animation:vn-pulse 2s ease-in-out infinite;',
      '}',
      '@keyframes vn-pulse{',
      '  0%,100%{opacity:1;}50%{opacity:.3;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Create banner element ──
  function _createBanner() {
    if (document.getElementById(_bannerId)) return;
    var div = document.createElement('div');
    div.id = _bannerId;
    div.innerHTML = '<div class="vn-dot"></div>' +
      '<div class="vn-text">HORS-LIGNE</div>' +
      '<div class="vn-queue" id="vn-queue-count"></div>';
    document.body.insertBefore(div, document.body.firstChild);
  }

  // ── Create floating badge ──
  function _createBadge() {
    if (document.getElementById(_badgeId)) return;
    var div = document.createElement('div');
    div.id = _badgeId;
    div.onclick = function() { _flushAll(); };
    document.body.appendChild(div);
  }

  // ── Update UI state ──
  function _update() {
    var online = navigator.onLine;
    var qCount = getQueueCount();
    var banner = document.getElementById(_bannerId);
    var badge = document.getElementById(_badgeId);

    // Banner — visible only when offline
    if (banner) {
      if (online) {
        banner.classList.remove('visible');
      } else {
        banner.classList.add('visible');
        var qEl = document.getElementById('vn-queue-count');
        if (qEl) {
          qEl.textContent = qCount > 0 ? qCount + ' en queue' : '';
          qEl.style.display = qCount > 0 ? '' : 'none';
        }
      }
    }

    // Badge — always visible, shows status
    if (badge) {
      badge.style.display = '';
      if (!online) {
        badge.className = _badgeId.replace(/-/g,'') + ' offline'; // avoid ID collision
        badge.className = 'offline';
        badge.innerHTML = '<span class="vn-bdot"></span>HORS-LIGNE' +
          (qCount > 0 ? ' <span style="opacity:.7">(' + qCount + ')</span>' : '');
      } else if (qCount > 0) {
        badge.className = 'has-queue';
        badge.innerHTML = '<span class="vn-bdot"></span>' + qCount + ' EN QUEUE';
        badge.title = 'Cliquer pour envoyer';
      } else {
        badge.className = 'online';
        badge.innerHTML = '<span class="vn-bdot"></span>EN LIGNE';
      }
      badge.id = _badgeId; // restore id after className reset
    }
  }

  // ── Flush all queues ──
  function _flushAll() {
    // 1. VoloData Firebase queue
    if (typeof VoloData !== 'undefined' && typeof VoloData.flushQueue === 'function') {
      try { VoloData.flushQueue(); } catch(e) { console.warn('[VoloNetwork] VoloData.flushQueue:', e); }
    }

    // 2. Main webhook queue (volo_queue)
    if (typeof flushQueue === 'function') {
      try { flushQueue(); } catch(e) {}
    }

    // 3. Pointage queue
    if (typeof flushOfflineQueue === 'function') {
      try { flushOfflineQueue(); } catch(e) {}
    }

    // 4. Inventory queue (caisses-stock)
    if (typeof flushOfflineQueueInv === 'function') {
      try { flushOfflineQueueInv(); } catch(e) {}
    }

    // Refresh UI after a delay
    setTimeout(_update, 2000);
  }

  // ── Event handlers ──
  function _onOnline() {
    _update();
    // Auto-flush after short delay
    setTimeout(function() {
      if (navigator.onLine) _flushAll();
    }, 1500);
  }

  function _onOffline() {
    _update();
  }

  // ── Init ──
  function init(opts) {
    if (_initialized) return;
    _initialized = true;

    opts = opts || {};

    _injectStyles();
    _createBanner();

    // Only create floating badge if page doesn't already have its own net-badge
    if (!opts.skipBadge && !document.querySelector('.net-badge') && !document.getElementById('netBadge')) {
      _createBadge();
    }

    window.addEventListener('online', _onOnline);
    window.addEventListener('offline', _onOffline);

    // Periodic queue count refresh (every 10s)
    _refreshInterval = setInterval(_update, 10000);

    // Initial state
    _update();
  }

  // ══════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════
  return {
    init: init,
    getQueueCount: getQueueCount,
    update: _update,
    flushAll: _flushAll
  };

})();
