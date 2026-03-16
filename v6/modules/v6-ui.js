/**
 * @module v6-ui.js
 * @description UI rendering, dashboard, profile, photos, weather, theme, PDF, announcements, chat FAB
 * @version 6.0.0
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS, escapeHtml, getHistory, getActiveItems, parseFlexDate)
 * @depends v6-auth.js (isUserChef, isUserSurv)
 * @depends v6-certs.js (renderCertSection, getCertAlerts)
 * @depends v6-engine.js (state, setState)
 * @depends data.js (ITEMS, PERSONNEL, CAISSES)
 */
(function(window) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var VOLO_VERSION = 'V10.5';
  var WEATHER_CACHE_KEY = 'volo_weather_cache';
  var WEATHER_CACHE_TTL = 3600000; // 1 hour

  var WMO_ICONS = {
    0: '\u2600\uFE0F', 1: '\u26C5', 2: '\u26C5', 3: '\u2601\uFE0F',
    45: '\uD83C\uDF2B\uFE0F', 48: '\uD83C\uDF2B\uFE0F',
    51: '\uD83C\uDF26\uFE0F', 53: '\uD83C\uDF26\uFE0F', 55: '\uD83C\uDF27\uFE0F',
    61: '\uD83C\uDF27\uFE0F', 63: '\uD83C\uDF27\uFE0F', 65: '\uD83C\uDF27\uFE0F',
    71: '\uD83C\uDF28\uFE0F', 73: '\uD83C\uDF28\uFE0F', 75: '\uD83C\uDF28\uFE0F',
    77: '\uD83C\uDF28\uFE0F', 80: '\uD83C\uDF27\uFE0F', 81: '\uD83C\uDF27\uFE0F',
    82: '\uD83C\uDF27\uFE0F', 85: '\uD83C\uDF28\uFE0F', 86: '\uD83C\uDF28\uFE0F',
    95: '\u26C8\uFE0F', 96: '\u26C8\uFE0F', 99: '\u26C8\uFE0F'
  };

  var WMO_LABELS = {
    0: 'Ciel d\u00E9gag\u00E9', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert',
    45: 'Brouillard', 48: 'Brouillard givrant',
    51: 'Bruine l\u00E9g\u00E8re', 53: 'Bruine', 55: 'Bruine forte',
    61: 'Pluie l\u00E9g\u00E8re', 63: 'Pluie', 65: 'Pluie forte',
    71: 'Neige l\u00E9g\u00E8re', 73: 'Neige', 75: 'Neige forte',
    77: 'Grains de neige', 80: 'Averses l\u00E9g\u00E8res', 81: 'Averses', 82: 'Averses fortes',
    85: 'Averses neige l\u00E9g\u00E8res', 86: 'Averses neige fortes',
    95: 'Orage', 96: 'Orage gr\u00EAle', 99: 'Orage forte gr\u00EAle'
  };

  // ── Private variables ──────────────────────────────────────
  var _deferredInstall = null;
  var _carouselTimer = null;

  // ── Helper: get active deployments (used by renderPickoffSelect, renderActivePickOnBanner) ──
  function _getActiveDeployments() {
    var h = V6Data.getHistory();
    var closed = {};
    var i, tx, key;
    for (i = 0; i < h.length; i++) {
      tx = h[i];
      if (tx.statut === 'ANNUL\u00C9' || tx.statut === 'RETOURN\u00C9') {
        key = (tx.original_timestamp || tx.timestamp) + tx.sauveteur_id;
        closed[key] = true;
      }
    }
    var result = [];
    for (i = 0; i < h.length; i++) {
      tx = h[i];
      if (tx.statut === 'ACTIF' && tx.mode === 'PICK-ON' && !closed[tx.timestamp + tx.sauveteur_id]) {
        result.push(tx);
      }
    }
    return result;
  }

  function _getMyActivePickOns() {
    var state = V6Engine.getState();
    var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
    if (!user) return [];
    var active = _getActiveDeployments();
    return active.filter(function(tx) { return tx.sauveteur_nom === user.name || tx.sauveteur_id === user.id; });
  }

  function _getSetupPhotos() {
    try { return JSON.parse(localStorage.getItem('volo_setup_photos') || '[]'); } catch(e) { return []; }
  }

  // ── Public API ─────────────────────────────────────────────
  window.V6UI = {

    /** Version constant */
    VOLO_VERSION: VOLO_VERSION,

    /**
     * Show toast notification
     * @param {string} msg - Message to display
     * @param {string} type - 'ok' | 'err' | 'off' | 'info'
     */
    showToast: function(msg, type) {
      var t = document.getElementById('toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.className = 'toast show ' + (type || '');
      clearTimeout(t._timer);
      t._timer = setTimeout(function() { t.className = 'toast'; }, 3000);
    },

    /**
     * Render version footer text at bottom of home screen
     */
    renderVersionFooter: function() {
      return '<div class="version-footer">VOLO SST ' + VOLO_VERSION + ' \u2014 Golden Eagles</div>';
    },

    /**
     * Render weather widget HTML from weather data
     * @param {Object} w - Weather data object { temp, code, wind, icon, label }
     * @returns {string} HTML string for weather widget
     */
    renderWeatherWidget: function(w) {
      if (!w) return '';
      return '<div class="weather-widget"><span class="wi">' + w.icon + '</span><span class="wt">' + w.temp + '\u00B0C</span><span class="wl">' + w.label + '</span><span class="wl">\uD83D\uDCA8' + w.wind + 'km/h</span></div>';
    },

    /**
     * Human-readable time ago string
     * @param {string} timestamp - ISO timestamp
     * @returns {string} e.g. "il y a 2h"
     */
    timeAgo: function(timestamp) {
      var diff = Date.now() - new Date(timestamp).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 60) return mins + 'min';
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h' + String(mins % 60).padStart(2, '0');
      var days = Math.floor(hrs / 24);
      return days + 'j ' + (hrs % 24) + 'h';
    },

    /**
     * CSS class based on time elapsed (for visual aging)
     * @param {string} timestamp - ISO timestamp
     * @returns {string} CSS class name
     */
    timeClass: function(timestamp) {
      var diff = Date.now() - new Date(timestamp).getTime();
      if (diff > 86400000) return 'time-alert';
      if (diff > 28800000) return 'time-warn';
      return 'time-ok';
    },

    /**
     * Play eagle cry sound effect
     */
    playEagleCry: function() {
      try {
        var a = document.getElementById('eaglecry');
        a.currentTime = 0;
        a.volume = 1;
        a.play();
      } catch(e) {}
    },

    /**
     * Render the dashboard view (step 9)
     */
    renderDashboard: function() {
      var active = V6Data.getActiveItems();
      var overdueCount = active.filter(function(i) { return Date.now() - new Date(i.timestamp).getTime() > 86400000; }).length;
      var missions = {};
      var i, item, missionKey;
      for (i = 0; i < active.length; i++) {
        item = active[i];
        missionKey = (item.destination || 'Inconnu') + '|' + (item.num_projet || 'sans-projet');
        if (!missions[missionKey]) {
          missions[missionKey] = { destination: item.destination || 'Inconnu', num_projet: item.num_projet || '', personne_ressource: item.personne_ressource || '', sauveteurs: {}, sauvArr: [], items: [], chefEquipe: null };
        }
        if (!missions[missionKey].sauveteurs[item.sauveteur || 'Inconnu']) {
          missions[missionKey].sauveteurs[item.sauveteur || 'Inconnu'] = true;
          missions[missionKey].sauvArr.push(item.sauveteur || 'Inconnu');
        }
        missions[missionKey].items.push(item);
        if (item.personne_ressource && !missions[missionKey].personne_ressource) missions[missionKey].personne_ressource = item.personne_ressource;
      }
      var CHEFS = PERSONNEL.filter(function(p) { return p.role && p.role.indexOf('CHEF') !== -1; }).map(function(p) { return p.name; });
      var mKeys = Object.keys(missions);
      for (i = 0; i < mKeys.length; i++) {
        var m = missions[mKeys[i]];
        var sauvArr = m.sauvArr;
        m.chefEquipe = null;
        for (var s = 0; s < sauvArr.length; s++) {
          var found = false;
          for (var c = 0; c < CHEFS.length; c++) {
            if (sauvArr[s].indexOf(CHEFS[c]) !== -1) { found = true; break; }
          }
          if (found) { m.chefEquipe = sauvArr[s]; break; }
        }
        if (!m.chefEquipe) m.chefEquipe = sauvArr[0] || 'Inconnu';
      }

      var html = '<button class="top-back" onclick="V6Engine.setState({step:0})">\u25C0 RETOUR</button>';
      html += '<style>';
      html += '.db-header{text-align:center;margin-bottom:18px}';
      html += '.db-logo-line{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:2px}';
      html += '.db-wings{font-size:1rem;opacity:.45;color:var(--rescue)}';
      html += '.db-title{font-family:"Oswald",sans-serif;font-size:1rem;font-weight:700;letter-spacing:4px;color:var(--rescue)}';
      html += '.db-sub{font-size:.6rem;letter-spacing:3px;color:var(--muted);font-family:"Oswald",sans-serif}';
      html += '.db-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}';
      html += '.db-kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 8px;text-align:center;position:relative;overflow:hidden}';
      html += '.db-kpi::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.025) 0%,transparent 60%)}';
      html += '.db-kpi-num{font-family:"Oswald",sans-serif;font-size:1.7rem;font-weight:700;line-height:1;margin-bottom:2px}';
      html += '.db-kpi-label{font-size:.55rem;letter-spacing:2px;color:var(--muted);font-family:"Oswald",sans-serif}';
      html += '.db-alert-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:14px;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.3);animation:db-pulse 2s ease infinite}';
      html += '@keyframes db-pulse{0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,0)}50%{box-shadow:0 0 12px 2px rgba(192,57,43,.12)}}';
      html += '.db-alert-ico{font-size:1.2rem;flex-shrink:0}';
      html += '.db-alert-title{font-family:"Oswald",sans-serif;font-size:.75rem;letter-spacing:1.5px;color:#E74C3C;font-weight:700}';
      html += '.db-alert-sub{font-size:.65rem;color:var(--muted);margin-top:1px}';
      html += '.db-mission{background:var(--card);border:1px solid var(--border);border-radius:14px;margin-bottom:10px;overflow:hidden}';
      html += '.db-mission-head{padding:12px 14px;border-bottom:1px solid rgba(58,36,40,.5);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(230,81,0,.06),transparent)}';
      html += '.db-mission-dest{font-family:"Oswald",sans-serif;font-size:.85rem;letter-spacing:1px;color:var(--gold)}';
      html += '.db-mission-badge{font-family:"Oswald",sans-serif;font-size:.58rem;letter-spacing:1px;padding:3px 8px;border-radius:6px;background:rgba(212,160,23,.15);border:1px solid rgba(212,160,23,.3);color:var(--gold)}';
      html += '.db-mission-meta{padding:8px 14px;border-bottom:1px solid rgba(58,36,40,.3)}';
      html += '.db-equipe{display:flex;flex-wrap:wrap;gap:5px;padding:8px 14px;border-bottom:1px solid rgba(58,36,40,.3)}';
      html += '.db-sauv-tag{font-size:.62rem;padding:3px 8px;border-radius:6px;font-family:"Oswald",sans-serif;letter-spacing:.5px}';
      html += '.db-sauv-chef{background:rgba(230,81,0,.15);border:1px solid rgba(230,81,0,.3);color:var(--rescue)}';
      html += '.db-sauv-member{background:rgba(58,36,40,.4);border:1px solid rgba(58,36,40,.6);color:var(--muted)}';
      html += '.db-items-list{padding:6px 14px 10px}';
      html += '.db-item-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(58,36,40,.25)}';
      html += '.db-item-row:last-child{border:none}';
      html += '.db-item-name{font-size:.78rem;font-weight:600}';
      html += '.db-item-id{font-family:"JetBrains Mono",monospace;font-size:.58rem;color:var(--gold);margin-top:1px}';
      html += '</style>';

      // HEADER
      html += '<div class="db-header">';
      html += '<div class="db-logo-line">';
      html += '<span class="db-wings">\u2014\u2014\u26A1</span>';
      html += '<span class="db-title">DASHBOARD SAUVETEUR</span>';
      html += '<span class="db-wings">\u26A1\u2014\u2014</span>';
      html += '</div>';
      html += '<div class="db-sub">OP\u00C9RATIONS EN COURS</div>';
      html += '</div>';

      // KPIs
      html += '<div class="db-kpi-grid">';
      html += '<div class="db-kpi"><div class="db-kpi-num" style="color:var(--gold)">' + active.length + '</div><div class="db-kpi-label">SORTIS</div></div>';
      html += '<div class="db-kpi"><div class="db-kpi-num" style="color:' + (overdueCount ? '#E74C3C' : 'var(--green)') + '">' + overdueCount + '</div><div class="db-kpi-label">+24H</div></div>';
      html += '<div class="db-kpi"><div class="db-kpi-num" style="color:var(--blue)">' + mKeys.length + '</div><div class="db-kpi-label">MISSIONS</div></div>';
      html += '</div>';

      // ALERT
      if (overdueCount) {
        html += '<div class="db-alert-banner">';
        html += '<div class="db-alert-ico">\uD83D\uDEA8</div>';
        html += '<div>';
        html += '<div class="db-alert-title">' + overdueCount + ' ITEM' + (overdueCount > 1 ? 'S' : '') + ' D\u00C9PASS\u00C9' + (overdueCount > 1 ? 'S' : '') + ' +24H</div>';
        html += '<div class="db-alert-sub">V\u00E9rifiez les retours manquants</div>';
        html += '</div></div>';
      }

      // EMPTY
      if (mKeys.length === 0) {
        html += '<div style="text-align:center;padding:44px 20px;background:var(--card);border:1px solid var(--border);border-radius:14px">';
        html += '<div style="font-size:2.5rem;margin-bottom:10px">\u2705</div>';
        html += '<div style="font-family:\'Oswald\',sans-serif;color:var(--green);letter-spacing:2px;font-size:.85rem">TOUT AU D\u00C9P\u00D4T</div>';
        html += '<div style="font-size:.72rem;color:var(--muted);margin-top:5px">Aucun item actuellement sorti</div>';
        html += '</div>';
      }

      // MISSIONS
      for (i = 0; i < mKeys.length; i++) {
        var mi = missions[mKeys[i]];
        var sauvs = mi.sauvArr;
        html += '<div class="db-mission">';
        html += '<div class="db-mission-head">';
        html += '<div>';
        html += '<div class="db-mission-dest">\uD83D\uDCCD ' + mi.destination + '</div>';
        if (mi.num_projet) {
          html += '<div style="font-size:.62rem;color:var(--muted);margin-top:2px">\uD83D\uDCCB #' + mi.num_projet + (mi.personne_ressource ? ' \u00B7 \uD83D\uDC64 ' + mi.personne_ressource : '') + '</div>';
        }
        html += '</div>';
        html += '<div class="db-mission-badge">' + mi.items.length + ' item' + (mi.items.length > 1 ? 's' : '') + '</div>';
        html += '</div>';
        html += '<div class="db-equipe">';
        for (var si = 0; si < sauvs.length; si++) {
          var isCh = sauvs[si] === mi.chefEquipe;
          html += '<span class="db-sauv-tag ' + (isCh ? 'db-sauv-chef' : 'db-sauv-member') + '">' + (isCh ? '\u2B50 ' : '') + sauvs[si] + '</span>';
        }
        html += '</div>';
        html += '<div class="db-items-list">';
        for (var ii = 0; ii < mi.items.length; ii++) {
          var itm = mi.items[ii];
          html += '<div class="db-item-row"><div><div class="db-item-name">' + itm.name + '</div><div class="db-item-id">' + itm.id + '</div></div>';
          html += '<span class="time-ago ' + V6UI.timeClass(itm.timestamp) + '" style="font-size:.65rem">' + V6UI.timeAgo(itm.timestamp) + '</span></div>';
        }
        html += '</div></div>';
      }

      html += V6UI.renderDashboardPhotos();
      return html;
    },

    /**
     * Render photos section within dashboard
     */
    renderDashboardPhotos: function() {
      var saved = _getSetupPhotos();
      if (saved.length === 0) return '';
      var grouped = {};
      var i, p, k;
      for (i = 0; i < saved.length; i++) {
        p = saved[i];
        k = p.contrat + '|' + p.lieu + '|' + p.timestamp;
        if (!grouped[k]) grouped[k] = { photos: [], lieu: p.lieu, contrat: p.contrat, sauveteur: p.sauveteur, timestamp: p.timestamp, indices: [] };
        grouped[k].photos.push(p);
        grouped[k].indices.push(i);
      }
      var groups = [];
      for (k in grouped) { if (grouped.hasOwnProperty(k)) groups.push(grouped[k]); }

      var html = '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">';
      html += '<h3 style="margin-bottom:12px">\uD83D\uDCF7 PHOTOS SETUP TERRAIN (' + saved.length + ')</h3>';
      for (i = 0; i < groups.length; i++) {
        var g = groups[i];
        html += '<div class="card" style="padding:12px;margin-bottom:10px;border-color:rgba(230,81,0,.25)">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<div><span style="font-weight:700;font-size:15px;color:var(--rescue)">\uD83D\uDCCD ' + g.lieu + '</span>';
        html += '<span class="badge badge-gold" style="margin-left:8px;font-size:11px">#' + g.contrat + '</span></div>';
        html += '<span style="font-size:12px;color:var(--muted)">' + g.photos.length + ' \uD83D\uDCF7</span></div>';
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">\uD83D\uDC77 ' + g.sauveteur + ' \u2022 ' + g.timestamp + '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">';
        for (var pi = 0; pi < g.photos.length; pi++) {
          html += '<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border)"><img src="' + g.photos[pi].data + '" style="width:100%;height:100%;object-fit:cover"></div>';
        }
        html += '</div></div>';
      }
      html += '</div>';
      return html;
    },

    /**
     * Render transaction history view (step 10)
     */
    renderHistory: function() {
      var h = V6Data.getHistory();
      var escapeHtml = V6Data.escapeHtml;
      var modeColor = {
        'PICK-ON': 'var(--green)',
        'PICK-OFF': 'var(--gold)',
        'RETOURN\u00C9': 'var(--gold)',
        'ANNUL\u00C9': 'var(--red,#C0392B)'
      };
      var modeBg = {
        'PICK-ON': 'rgba(39,174,96,.12)',
        'PICK-OFF': 'rgba(212,160,23,.12)',
        'RETOURN\u00C9': 'rgba(212,160,23,.12)',
        'ANNUL\u00C9': 'rgba(192,57,43,.12)'
      };

      var html = '<button class="top-back" onclick="V6Engine.setState({step:0})">\u25C0 RETOUR</button>';
      html += '<style>';
      html += '.hist-header{text-align:center;margin-bottom:18px}';
      html += '.hist-count-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-family:"JetBrains Mono",monospace;font-size:.7rem;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:var(--blue);margin-top:6px}';
      html += '.hist-tx{background:var(--card);border:1px solid var(--border);border-radius:13px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden}';
      html += '.hist-tx::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px}';
      html += '.hist-tx-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}';
      html += '.hist-mode-badge{font-family:"Oswald",sans-serif;font-size:.6rem;letter-spacing:1.5px;padding:3px 9px;border-radius:6px;font-weight:700}';
      html += '.hist-ts{font-family:"JetBrains Mono",monospace;font-size:.6rem;color:var(--muted)}';
      html += '.hist-name{font-size:.85rem;font-weight:700;margin-bottom:3px}';
      html += '.hist-detail{font-size:.68rem;color:var(--muted)}';
      html += '.hist-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}';
      html += '.hist-tag{font-size:.6rem;padding:2px 7px;border-radius:5px;font-family:"Oswald",sans-serif;letter-spacing:.5px}';
      html += '</style>';

      // HEADER
      html += '<div class="hist-header">';
      html += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:2px">';
      html += '<span style="font-size:.9rem;opacity:.4;color:var(--blue)">\u2014\u2014\uD83D\uDCDC</span>';
      html += '<span style="font-family:\'Oswald\',sans-serif;font-size:1rem;font-weight:700;letter-spacing:4px;color:var(--blue)">HISTORIQUE</span>';
      html += '<span style="font-size:.9rem;opacity:.4;color:var(--blue)">\uD83D\uDCDC\u2014\u2014</span>';
      html += '</div>';
      html += '<div style="font-size:.6rem;letter-spacing:3px;color:var(--muted);font-family:\'Oswald\',sans-serif">JOURNAL DES TRANSACTIONS</div>';
      html += '<div class="hist-count-badge">' + h.length + ' transaction' + (h.length !== 1 ? 's' : '') + '</div>';
      html += '</div>';

      if (h.length === 0) {
        html += '<div style="text-align:center;padding:44px 20px;background:var(--card);border:1px solid var(--border);border-radius:14px">';
        html += '<div style="font-size:2.5rem;margin-bottom:10px">\uD83D\uDCCB</div>';
        html += '<div style="font-family:\'Oswald\',sans-serif;color:var(--muted);letter-spacing:2px;font-size:.85rem">AUCUNE TRANSACTION</div>';
        html += '</div>';
      }

      html += '<div style="max-height:70vh;overflow-y:auto;-webkit-overflow-scrolling:touch">';
      var limit = Math.min(h.length, 50);
      for (var i = 0; i < limit; i++) {
        var tx = h[i];
        var mode = tx.statut === 'ANNUL\u00C9' ? 'ANNUL\u00C9' : tx.statut === 'RETOURN\u00C9' ? 'RETOURN\u00C9' : tx.mode || 'PICK-ON';
        var col = modeColor[mode] || 'var(--muted)';
        var bg = modeBg[mode] || 'rgba(58,36,40,.2)';
        var itemCount = 0;
        try { itemCount = JSON.parse(tx.items || '[]').length; } catch(e) { itemCount = tx.nb_items || 0; }
        html += '<div class="hist-tx" style="animation-delay:' + (i * 30) + 'ms">';
        html += '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px;background:' + col + '"></div>';
        html += '<div class="hist-tx-top">';
        html += '<span class="hist-mode-badge" style="background:' + bg + ';color:' + col + ';border:1px solid ' + col + '40">' + mode + '</span>';
        html += '<span class="hist-ts">' + (tx.timestamp || '\u2014') + '</span>';
        html += '</div>';
        html += '<div class="hist-name">' + (tx.sauveteur_nom || '\u2014') + '</div>';
        html += '<div class="hist-detail">' + itemCount + ' item' + (itemCount > 1 ? 's' : '') + ' \u2192 ' + (tx.destination || '\u2014') + '</div>';
        html += '<div class="hist-tags">';
        if (tx.num_projet) html += '<span class="hist-tag" style="background:rgba(230,81,0,.1);border:1px solid rgba(230,81,0,.25);color:var(--rescue)">\uD83D\uDCCB #' + tx.num_projet + '</span>';
        if (tx.personne_ressource) html += '<span class="hist-tag" style="background:rgba(58,36,40,.4);border:1px solid rgba(58,36,40,.6);color:var(--muted)">\uD83D\uDC64 ' + tx.personne_ressource + '</span>';
        if (tx.remorque && tx.remorque !== 'Aucune') html += '<span class="hist-tag" style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:var(--blue)">\uD83D\uDE9B ' + tx.remorque + '</span>';
        html += '</div></div>';
      }
      html += '</div>';

      if (h.length > 0) {
        html += '<button class="btn btn-outline btn-sm" style="margin-top:10px;border-color:var(--red);color:var(--red)" onclick="confirmClear(\'volo_history\',\'Effacer tout l\\\'historique des transactions?\',function(){V6Engine.setState({step:10})})">\uD83D\uDDD1 EFFACER L\'HISTORIQUE</button>';
      }
      return html;
    },

    /**
     * Render active pick-on banner on home screen
     * @returns {string} HTML string
     */
    renderActivePickOnBanner: function() {
      var state = V6Engine.getState();
      if (!state.loggedIn || state.step === 1 || state.step === 8) return '';
      var isSurv = (localStorage.getItem('volo_last_role') || '').toUpperCase() === 'SURVEILLANT';
      if (isSurv) return '';
      try {
        var myPO = _getMyActivePickOns();
        if (myPO.length === 0) return '';
        var totalItems = 0;
        for (var i = 0; i < myPO.length; i++) {
          try { totalItems += JSON.parse(myPO[i].items || '[]').length; } catch(e) {}
        }
        var firstTx = myPO[myPO.length - 1];
        var since = firstTx ? new Date(firstTx.timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '';
        var html = '<div onclick="startPickOff()" style="position:sticky;top:0;z-index:999;padding:10px 16px;background:linear-gradient(135deg,rgba(230,81,0,.95),rgba(192,57,43,.9));color:#fff;display:flex;align-items:center;gap:10px;cursor:pointer;animation:pulse-border 2s infinite;border-bottom:2px solid var(--rescue)">';
        html += '<span style="font-size:20px">\u26A0\uFE0F</span>';
        html += '<div style="flex:1">';
        html += '<div style="font-weight:800;font-size:13px;letter-spacing:1px;font-family:Oswald,sans-serif">PICK ON ACTIF \u2014 ' + totalItems + ' item' + (totalItems > 1 ? 's' : '') + ' sorti' + (totalItems > 1 ? 's' : '') + '</div>';
        html += '<div style="font-size:10px;opacity:.85;margin-top:1px">' + (since ? 'Depuis ' + since + ' \u00B7 ' : '') + 'Toucher pour PICK-OFF</div>';
        html += '</div>';
        html += '<span style="font-size:16px">\u2192</span>';
        html += '</div>';
        return html;
      } catch(e) { return ''; }
    },

    /**
     * Render pick-off deployment selector
     * @returns {string} HTML string
     */
    renderPickoffSelect: function() {
      var deployments = _getActiveDeployments();
      var escapeHtml = V6Data.escapeHtml;
      if (deployments.length === 0) {
        return '<button class="top-back" onclick="resetAll()">\u25C0 RETOUR</button>' +
          '<h2 style="color:var(--orange)">PICK-OFF</h2>' +
          '<div style="text-align:center;padding:40px 20px">' +
          '<div style="font-size:48px;margin-bottom:16px">\u2705</div>' +
          '<div style="color:var(--muted);font-size:16px;font-weight:600">Aucun d\u00E9ploiement actif</div>' +
          '<div style="color:var(--muted);font-size:13px;margin-top:8px">Tous les items sont au d\u00E9p\u00F4t.<br>Faites un PICK-ON d\'abord.</div>' +
          '</div>';
      }
      var html = '<button class="top-back" onclick="resetAll()">\u25C0 RETOUR</button>';
      html += '<h2 style="color:var(--orange)">PICK-OFF</h2>';
      html += '<p style="font-size:14px;color:var(--muted);text-align:center;margin-bottom:16px">S\u00E9lectionnez le d\u00E9ploiement qui revient</p>';
      html += '<div style="max-height:70vh;overflow-y:auto;-webkit-overflow-scrolling:touch">';
      for (var idx = 0; idx < deployments.length; idx++) {
        var tx = deployments[idx];
        var items = [];
        try { items = JSON.parse(tx.items || '[]'); } catch(e) {}
        var isOverdue = Date.now() - new Date(tx.timestamp).getTime() > 86400000;
        html += '<div class="card" onclick="selectPickoffDeployment(' + idx + ')" style="cursor:pointer;border-color:' + (isOverdue ? 'var(--red)' : 'var(--orange)') + ';margin-bottom:10px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
        html += '<div style="font-weight:700;font-size:15px;color:var(--txt)">' + escapeHtml(tx.sauveteur_nom || 'Inconnu') + '</div>';
        html += '<span class="badge badge-orange">' + items.length + ' item' + (items.length > 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '<div style="font-size:13px;color:var(--gold);font-weight:600;margin-bottom:4px">\u2192 ' + (tx.destination || 'N/A') + '</div>';
        if (tx.num_projet) {
          html += '<div style="font-size:11px;color:var(--rescue);margin-bottom:4px">\uD83D\uDCCB #' + tx.num_projet + (tx.personne_ressource ? ' \u2022 \uD83D\uDC64 ' + tx.personne_ressource : '') + '</div>';
        }
        if (tx.remorque && tx.remorque !== 'Aucun') {
          html += '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">\uD83D\uDE9B ' + tx.remorque + '</div>';
        }
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">';
        html += '<div style="font-size:11px;color:var(--muted)">Sorti: ' + (tx.timestamp || '\u2014') + '</div>';
        html += '<span class="time-ago ' + (isOverdue ? 'overdue' : '') + '" style="font-size:12px;' + (isOverdue ? 'color:var(--red);font-weight:700' : 'color:var(--muted)') + '">' + V6UI.timeAgo(tx.timestamp) + (isOverdue ? ' \u26A0\uFE0F' : '') + '</span>';
        html += '</div>';
        // Item tags
        html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">';
        var g = {};
        for (var ii = 0; ii < items.length; ii++) {
          var n = items[ii].name || items[ii].id;
          g[n] = (g[n] || 0) + 1;
        }
        var gKeys = Object.keys(g);
        var tagLimit = Math.min(gKeys.length, 8);
        for (var gi = 0; gi < tagLimit; gi++) {
          html += '<span style="font-size:10px;background:var(--card2);color:var(--muted);padding:2px 6px;border-radius:4px">' + gKeys[gi] + (g[gKeys[gi]] > 1 ? ' <b>\u00D7' + g[gKeys[gi]] + '</b>' : '') + '</span>';
        }
        if (gKeys.length > 8) html += '<span style="font-size:10px;color:var(--muted)">+' + (gKeys.length - 8) + ' types</span>';
        html += '</div></div>';
      }
      html += '</div>';
      return html;
    },

    /**
     * Select a deployment for pick-off, expanding caisse items
     * @param {number} idx - Index in active deployments list
     */
    selectPickoffDeployment: function(idx) {
      var deployments = _getActiveDeployments();
      var tx = deployments[idx];
      if (!tx) return;
      var items = [];
      try { items = JSON.parse(tx.items || '[]'); } catch(e) {}
      // V10.1 — Expand sacs/caisses
      if (typeof CAISSES !== 'undefined') {
        var seenIds = {};
        var i;
        for (i = 0; i < items.length; i++) { seenIds[items[i].id || items[i]] = true; }
        var caisseIds = {};
        for (i = 0; i < items.length; i++) { if (items[i].fromGroup) caisseIds[items[i].fromGroup] = true; }
        try { var cu = JSON.parse(tx.caisses_utilisees || '[]'); for (i = 0; i < cu.length; i++) caisseIds[cu[i]] = true; } catch(e) {}
        var cids = Object.keys(caisseIds);
        for (i = 0; i < cids.length; i++) {
          var caisse = CAISSES.find(function(c) { return c.id === cids[i]; });
          if (!caisse) continue;
          var contenus = caisse.items_contenus || caisse.items || [];
          for (var j = 0; j < contenus.length; j++) {
            var itemId = contenus[j];
            if (seenIds[itemId]) continue;
            seenIds[itemId] = true;
            var def = ITEMS.find(function(it) { return it.id === itemId; });
            items.push(def ? { id: def.id, name: def.name, fromGroup: cids[i] } : { id: itemId, name: itemId, fromGroup: cids[i] });
          }
        }
      }
      var depotMatch = DEPOTS.find(function(d) { return d.name === tx.depot; });
      var destMatch = DESTINATIONS.find(function(d) { return d.name === tx.destination; });
      var remIds = [];
      if (tx.remorque && tx.remorque !== 'Aucun') {
        var parts = tx.remorque.split(' + ');
        for (var ri = 0; ri < parts.length; ri++) {
          var r = REMORQUES.find(function(x) { return x.name === parts[ri]; });
          if (r) remIds.push(r.id);
        }
      }
      var sauvMatch = SAUVETEURS.find(function(s) { return s.name === tx.sauveteur_nom; });
      window._pickoffExpected = items;
      window._pickoffOriginalTx = tx;
      V6Engine.setState({
        depot: depotMatch ? depotMatch.id : null,
        dest: destMatch ? destMatch.id : null,
        remorques: remIds,
        sauvs: sauvMatch ? [sauvMatch.id] : (tx.sauveteur_id ? [tx.sauveteur_id] : []),
        numProjet: tx.num_projet || '',
        personneRessource: tx.personne_ressource || '',
        detailsJob: tx.details_job || '',
        scanned: [],
        sceaux: {},
        step: 6
      });
      V6UI.showToast('\uD83D\uDCE6 Scannez les ' + items.length + ' items retourn\u00E9s', 'ok');
    },

    /**
     * Check for overdue items (deployed > 24h)
     */
    checkOverdueItems: function() {
      var active = V6Data.getActiveItems();
      var now = Date.now();
      var overdueCount = 0;
      for (var i = 0; i < active.length; i++) {
        var ts = new Date(active[i].timestamp).getTime();
        if (now - ts > 86400000) overdueCount++;
      }
      if (overdueCount > 0) {
        V6UI.showToast('\u26A0\uFE0F ' + overdueCount + ' item(s) sorti(s) depuis +24h!', 'info');
      }
    },

    /**
     * Get equipment alerts (expiry, inspection needed)
     * @returns {Array} Alert objects
     */
    getEquipmentAlerts: function() {
      var alerts = [];
      var now = new Date();
      var in30d = new Date(now.getTime() + 30 * 86400000);
      var in90d = new Date(now.getTime() + 90 * 86400000);
      for (var i = 0; i < ITEMS.length; i++) {
        var item = ITEMS[i];
        // Check expiration
        if (item.expiry && item.expiry !== 'N/A') {
          var exp = V6Data.parseFlexDate(item.expiry);
          if (exp) {
            if (exp < now) alerts.push({ type: 'expired', severity: 'critical', item: item, date: exp, msg: item.name + ' \u2014 EXPIR\u00C9' });
            else if (exp < in30d) alerts.push({ type: 'expiring', severity: 'urgent', item: item, date: exp, msg: item.name + ' \u2014 expire dans <30j' });
            else if (exp < in90d) alerts.push({ type: 'expiring', severity: 'warning', item: item, date: exp, msg: item.name + ' \u2014 expire dans <90j' });
          }
        }
        // Check inspection overdue (>12 months since last)
        if (item.inspDate) {
          var insp = V6Data.parseFlexDate(item.inspDate);
          if (insp) {
            var overdue = new Date(insp.getTime() + 365 * 86400000);
            if (overdue < now) alerts.push({ type: 'inspection', severity: 'warning', item: item, date: insp, msg: item.name + ' \u2014 inspection >12 mois' });
          }
        }
        // Check bad condition
        if (item.etat && item.etat !== 'Bon' && item.etat !== 'bon') {
          var sev = item.etat.toLowerCase().indexOf('h.s') !== -1 || item.etat.toLowerCase().indexOf('hors') !== -1 ? 'critical' : 'info';
          alerts.push({ type: 'condition', severity: sev, item: item, msg: item.name + ' \u2014 ' + item.etat });
        }
      }
      var order = { critical: 0, urgent: 1, warning: 2, info: 3 };
      alerts.sort(function(a, b) { return (order[a.severity] || 9) - (order[b.severity] || 9); });
      return alerts;
    },

    /**
     * Check item expirations within 90 days
     * @returns {Array} Expiring item alerts
     */
    checkExpirations: function() {
      var results = [];
      var now = new Date();
      for (var i = 0; i < ITEMS.length; i++) {
        var item = ITEMS[i];
        if (!item.expiry || item.expiry === 'N/A') continue;
        var exp = V6Data.parseFlexDate(item.expiry);
        if (!exp) continue;
        var diffMs = exp.getTime() - now.getTime();
        var daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft > 90) continue;
        var niveau = daysLeft <= 30 ? 'CRITIQUE' : 'ATTENTION';
        results.push({ item: item, daysLeft: daysLeft, expiry: exp, niveau: niveau });
      }
      results.sort(function(a, b) { return a.daysLeft - b.daysLeft; });
      return results;
    },

    /**
     * Render chef (team leader) dashboard with KPIs
     */
    renderChefDashboard: function() {
      var today = new Date().toISOString().slice(0, 10);
      var sauvDispo;
      try {
        var avails = JSON.parse(localStorage.getItem('volo_agenda_avail') || '{}');
        var count = 0;
        var sauvPers = PERSONNEL.filter(function(p) { return p.type === 'SAUVETEUR'; });
        for (var si = 0; si < sauvPers.length; si++) {
          var k = sauvPers[si].id + '_' + today;
          var v = avails[k];
          if (v && (v === 'JOUR' || v === 'NUIT' || v === 'DISPO')) count++;
        }
        sauvDispo = count;
      } catch(e) { sauvDispo = '\u2014'; }

      var survConfirmes;
      try {
        var contrats = JSON.parse(localStorage.getItem('volo_agenda_contrats') || '[]');
        var active = contrats.filter(function(c) { return c.dateDebut <= today && c.dateFin >= today; });
        var survIds = {};
        for (var ci = 0; ci < active.length; ci++) {
          var equipe = active[ci].equipe || [];
          for (var ei = 0; ei < equipe.length; ei++) {
            if (equipe[ei].type === 'SURVEILLANT') survIds[equipe[ei].id] = true;
          }
        }
        survConfirmes = Object.keys(survIds).length;
      } catch(e) { survConfirmes = '\u2014'; }

      var caissesCritique = 0;
      try {
        var invData = JSON.parse(localStorage.getItem('volo_inventaire_data') || '{}');
        if (typeof CAISSES !== 'undefined') {
          for (var cc = 0; cc < CAISSES.length; cc++) {
            var inv = invData[CAISSES[cc].id];
            if (inv && inv.items) {
              var vals = Object.keys(inv.items);
              for (var vi = 0; vi < vals.length; vi++) {
                if (inv.items[vals[vi]].etat === 'MANQUANT' || inv.items[vals[vi]].etat === 'DEFECTUEUX') { caissesCritique++; break; }
              }
            }
          }
        }
      } catch(e) {}

      var chatUnread = 0;
      try {
        var lastRead = parseInt(localStorage.getItem('volo_chat_last_read') || '0');
        var msgs = JSON.parse(localStorage.getItem('volo_chat_messages') || '[]');
        chatUnread = msgs.filter(function(m) { return m.timestamp > lastRead; }).length;
      } catch(e) {}

      // Week bar chart
      var weekBars = [];
      try {
        var avails2 = JSON.parse(localStorage.getItem('volo_agenda_avail') || '{}');
        var sauvCount = PERSONNEL.filter(function(p) { return p.type === 'SAUVETEUR'; }).length;
        for (var di = 0; di < 7; di++) {
          var d = new Date();
          d.setDate(d.getDate() + di);
          var ds = d.toISOString().slice(0, 10);
          var dayLabel = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][d.getDay()];
          var cnt = 0;
          var sauvP = PERSONNEL.filter(function(p) { return p.type === 'SAUVETEUR'; });
          for (var sp = 0; sp < sauvP.length; sp++) {
            var kk = sauvP[sp].id + '_' + ds;
            var vv = avails2[kk];
            if (vv && (vv === 'JOUR' || vv === 'NUIT' || vv === 'DISPO')) cnt++;
          }
          var pct = sauvCount > 0 ? Math.round(cnt / sauvCount * 100) : 0;
          weekBars.push({ day: dayLabel, count: cnt, pct: pct, isToday: di === 0 });
        }
      } catch(e) {}

      // Alerts
      var alerts = [];
      if (caissesCritique > 0) alerts.push({ icon: '\uD83D\uDD34', text: caissesCritique + ' caisse' + (caissesCritique > 1 ? 's' : '') + ' CRITIQUE', color: 'var(--red)', link: '../caisses-stock.html?view=caisses' });
      try {
        var invData2 = JSON.parse(localStorage.getItem('volo_inventaire_data') || '{}');
        var retard = 0;
        if (typeof CAISSES !== 'undefined') {
          for (var ri = 0; ri < CAISSES.length; ri++) {
            var inv2 = invData2[CAISSES[ri].id];
            if (inv2 && inv2.prochainInspection) {
              var dd = new Date(inv2.prochainInspection);
              if (dd < new Date()) retard++;
            }
          }
        }
        if (retard > 0) alerts.push({ icon: '\uD83D\uDFE1', text: retard + ' inspection' + (retard > 1 ? 's' : '') + ' en retard', color: 'var(--orange)', link: '../caisses-stock.html?view=caisses' });
      } catch(e) {}

      // Activity feed
      var feed = [];
      try {
        var history = JSON.parse(localStorage.getItem('volo_history') || '[]');
        var feedItems = history.slice(-10).reverse();
        for (var fi = 0; fi < feedItems.length; fi++) {
          var fh = feedItems[fi];
          var time = fh.timestamp ? new Date(fh.timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '';
          var who = fh.sauveteur || '';
          var action = fh.mode === 'PICK-ON' ? 'a sorti du mat\u00E9riel' : fh.mode === 'PICK-OFF' ? 'a retourn\u00E9 du mat\u00E9riel' : fh.type || 'action';
          feed.push({ time: time, text: who + ' ' + action + (fh.destination ? ' \u2192 ' + fh.destination : '') });
        }
      } catch(e) {}

      var maxBar = 1;
      for (var mb = 0; mb < weekBars.length; mb++) { if (weekBars[mb].count > maxBar) maxBar = weekBars[mb].count; }

      var html = '<div class="chef-dash">';
      html += '<div class="chef-dash-title">\u2B50 TABLEAU DE BORD CHEF</div>';

      html += '<div class="chef-dash-row">';
      html += '<div class="chef-dash-card"><div class="cdn" style="color:var(--rescue)">' + sauvDispo + '</div><div class="cdl">SAUV DISPO</div></div>';
      html += '<div class="chef-dash-card"><div class="cdn" style="color:var(--blue)">' + survConfirmes + '</div><div class="cdl">SURV CONF.</div></div>';
      html += '<div class="chef-dash-card" onclick="window.location=\'../caisses-stock.html?view=caisses\'"><div class="cdn" style="color:' + (caissesCritique > 0 ? 'var(--red)' : 'var(--green)') + '">' + caissesCritique + '</div><div class="cdl">CRITIQUE</div></div>';
      html += '<div class="chef-dash-card"><div class="cdn" style="color:' + (chatUnread > 0 ? 'var(--rescue)' : 'var(--muted)') + '">' + chatUnread + '</div><div class="cdl">NON LUS</div></div>';
      html += '</div>';

      // Week bars
      html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">';
      html += '<div style="font-family:\'Oswald\',sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--muted);margin-bottom:8px">DISPONIBILIT\u00C9S 7 JOURS</div>';
      html += '<div style="display:flex;gap:4px;align-items:flex-end;height:60px">';
      for (var bi = 0; bi < weekBars.length; bi++) {
        var b = weekBars[bi];
        var barH = Math.max(4, b.count / maxBar * 45);
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
        html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.5rem;color:var(--muted)">' + b.count + '</div>';
        html += '<div style="width:100%;background:' + (b.isToday ? 'var(--rescue)' : 'rgba(230,81,0,.3)') + ';border-radius:3px;height:' + barH + 'px;transition:height .3s"></div>';
        html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.45rem;color:' + (b.isToday ? 'var(--rescue)' : 'var(--muted)') + ';font-weight:' + (b.isToday ? '700' : '400') + '">' + b.day + '</div>';
        html += '</div>';
      }
      html += '</div></div>';

      // Alerts
      if (alerts.length) {
        html += '<div class="chef-alerts">';
        html += '<div style="font-family:\'Oswald\',sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--red);margin-bottom:8px">ALERTES</div>';
        for (var ai = 0; ai < alerts.length; ai++) {
          var a = alerts[ai];
          html += '<div class="chef-alert-item" onclick="' + (a.link ? 'window.location=&quot;' + a.link + '&quot;' : '') + '">';
          html += '<span>' + a.icon + '</span>';
          html += '<span style="flex:1;color:' + a.color + '">' + a.text + '</span>';
          html += '<span style="color:var(--muted);font-size:.7rem">\u2192</span>';
          html += '</div>';
        }
        html += '</div>';
      }

      // Feed
      if (feed.length) {
        html += '<div class="chef-feed">';
        html += '<div style="font-family:\'Oswald\',sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--muted);margin-bottom:8px">ACTIVIT\u00C9 R\u00C9CENTE</div>';
        var feedLimit = Math.min(feed.length, 5);
        for (var fdi = 0; fdi < feedLimit; fdi++) {
          html += '<div class="chef-feed-item"><span class="cfi-time">' + feed[fdi].time + '</span><span>' + feed[fdi].text + '</span></div>';
        }
        html += '</div>';
      }

      // Cert alerts
      var ca = V6Certs.getCertAlerts();
      if (ca.length) {
        html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">';
        html += '<div style="font-family:Oswald,sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--orange);margin-bottom:8px">CERTIFICATIONS</div>';
        var caLimit = Math.min(ca.length, 8);
        for (var cai = 0; cai < caLimit; cai++) {
          var cert = ca[cai];
          html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:.7rem"><span>' + cert.icon + '</span><span style="flex:1;color:var(--txt)">' + cert.name + ' \u2014 ' + cert.cert + '</span><span class="cert-badge ' + (cert.status === 'expired' ? 'exp' : 'warn') + '">' + cert.label + '</span></div>';
        }
        html += '</div>';
      }

      html += '</div>';
      return html;
    },

    /**
     * Toggle between light and dark theme
     */
    toggleThemeMain: function() {
      var isLight = document.body.classList.toggle('light');
      var btn = document.getElementById('btn-theme-main');
      if (btn) btn.textContent = isLight ? '\u2600\uFE0F' : '\uD83C\uDF19';
      localStorage.setItem('volo_theme_main', isLight ? 'light' : 'dark');
    },

    /**
     * Trigger PWA install prompt
     */
    pwaInstall: function() {
      if (_deferredInstall) {
        _deferredInstall.prompt();
        _deferredInstall.userChoice.then(function() {
          _deferredInstall = null;
          var b = document.getElementById('pwa-banner');
          if (b) b.remove();
        });
      }
    },

    /**
     * Open member profile modal
     * @param {string} userId - user ID of the member
     */
    openProfile: function(userId) {
      var u = PERSONNEL.find(function(p) { return p.id === userId; });
      if (!u) return;
      var isChef = u.role === "CHEF D'EQUIPE";
      var isSurv = u.type === 'SURVEILLANT';
      var roleColor = isChef ? '#D4A017' : isSurv ? '#3B82F6' : '#E65100';
      var roleLabel = isChef ? "CHEF D'\u00C9QUIPE" : isSurv ? 'SURVEILLANT' : 'SAUVETEUR';
      var nameParts = u.name.split(' ');
      var initials = '';
      for (var ni = 0; ni < nameParts.length && ni < 2; ni++) {
        if (nameParts[ni][0]) initials += nameParts[ni][0];
      }
      initials = initials.toUpperCase();
      var avatar = localStorage.getItem('volo_avatar_' + u.id);
      var bio = localStorage.getItem('volo_bio_' + u.id) || '';
      var missions = parseInt(localStorage.getItem('volo_missions_' + u.id) || '0');
      var history = V6Data.getHistory().filter(function(h) { return h.user_name === u.name || h.pin === (u.volo ? u.volo.replace('V', '') : ''); });
      var lastSortie = history.length ? history[0].timestamp : 'Aucune';

      var overlay = document.createElement('div');
      overlay.id = 'profile-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s ease';
      var inner = '<div style="width:100%;max-width:420px;max-height:90vh;overflow-y:auto;background:var(--card,#141824);border:1px solid ' + roleColor + '33;border-radius:18px;padding:24px">';
      inner += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
      inner += '<div style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:2px;color:' + roleColor + '">PROFIL</div>';
      inner += '<button onclick="document.getElementById(\'profile-overlay\').remove()" style="background:none;border:none;color:var(--muted,#888);font-size:20px;cursor:pointer">&times;</button>';
      inner += '</div>';
      inner += '<div style="text-align:center;margin-bottom:20px">';
      inner += '<div id="prof-avatar" style="width:80px;height:80px;border-radius:50%;border:3px solid ' + roleColor + ';margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-size:28px;color:' + roleColor + ';overflow:hidden;cursor:pointer;background:' + roleColor + '15" onclick="document.getElementById(\'prof-file-input\').click()">';
      inner += avatar ? '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover">' : initials;
      inner += '</div>';
      inner += '<input type="file" id="prof-file-input" accept="image/*" style="display:none" onchange="handleProfilePhoto(this,\'' + u.id + '\')">';
      inner += '<div style="font-family:Oswald,sans-serif;font-size:20px;color:var(--txt,#eee);letter-spacing:1px">' + u.name.toUpperCase() + '</div>';
      inner += '<div style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;margin-top:6px;background:' + roleColor + '22;color:' + roleColor + ';border:1px solid ' + roleColor + '44">' + roleLabel + '</div>';
      inner += '</div>';
      inner += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">';
      inner += '<div style="background:var(--bg2,#0d1117);border-radius:10px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:' + roleColor + '">' + missions + '</div><div style="font-size:10px;color:var(--muted,#888);letter-spacing:1px;margin-top:2px">MISSIONS</div></div>';
      inner += '<div style="background:var(--bg2,#0d1117);border-radius:10px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:' + roleColor + '">' + history.length + '</div><div style="font-size:10px;color:var(--muted,#888);letter-spacing:1px;margin-top:2px">TRANSACTIONS</div></div>';
      inner += '</div>';
      inner += '<div style="margin-bottom:12px"><div style="font-size:10px;color:var(--muted,#888);letter-spacing:1px;margin-bottom:4px">D\u00C9TAILS</div>';
      inner += '<div style="background:var(--bg2,#0d1117);border-radius:10px;padding:12px;font-size:12px;color:var(--txt,#eee)">';
      inner += '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--muted,#888)">ID</span><span>' + u.id + '</span></div>';
      inner += '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--muted,#888)">VOLO</span><span>' + u.volo + '</span></div>';
      inner += '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--muted,#888)">R\u00E9gion</span><span>' + (u.region || '\u2014') + '</span></div>';
      inner += '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--muted,#888)">Ville</span><span>' + (u.ville || '\u2014') + '</span></div>';
      var lastSortieStr = typeof lastSortie === 'string' && lastSortie !== 'Aucune' ? new Date(lastSortie).toLocaleDateString('fr-CA') : lastSortie;
      inner += '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted,#888)">Derni\u00E8re sortie</span><span style="font-size:11px">' + lastSortieStr + '</span></div>';
      inner += '</div></div>';
      inner += V6Certs.renderCertSection(u.volo);
      inner += V6Certs.renderMemberTimeline(u.volo);
      inner += '<div style="margin-bottom:12px"><div style="font-size:10px;color:var(--muted,#888);letter-spacing:1px;margin-bottom:4px">BIO</div>';
      inner += '<textarea id="prof-bio" rows="2" style="width:100%;background:var(--bg2,#0d1117);border:1px solid var(--border,#333);border-radius:10px;padding:10px;color:var(--txt,#eee);font-family:Inter,sans-serif;font-size:12px;resize:none" placeholder="Courte description...">' + bio + '</textarea></div>';
      inner += '<button onclick="saveProfile(\'' + u.id + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,' + roleColor + ',' + roleColor + '99);border:none;border-radius:10px;color:#fff;font-family:Oswald,sans-serif;font-size:13px;letter-spacing:2px;cursor:pointer">SAUVEGARDER</button>';
      inner += '</div>';
      overlay.innerHTML = inner;
      document.body.appendChild(overlay);
    },

    /**
     * Handle profile photo upload
     * @param {HTMLInputElement} input - File input element
     * @param {string} userId - VOLO ID
     */
    handleProfilePhoto: function(input, userId) {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var data = e.target.result;
        try { localStorage.setItem('volo_avatar_' + userId, data); } catch(err) { V6UI.showToast('Photo trop volumineuse', 'err'); return; }
        var av = document.getElementById('prof-avatar');
        if (av) av.innerHTML = '<img src="' + data + '" style="width:100%;height:100%;object-fit:cover">';
        V6Engine.render();
      };
      reader.readAsDataURL(file);
    },

    /**
     * Save profile bio and hire date
     * @param {string} userId - VOLO ID
     */
    saveProfile: function(userId) {
      var bio = document.getElementById('prof-bio');
      if (bio) localStorage.setItem('volo_bio_' + userId, bio.value);
      var overlay = document.getElementById('profile-overlay');
      if (overlay) overlay.remove();
      V6UI.showToast('Profil sauvegard\u00E9', 'ok');
      V6Engine.render();
    },

    /**
     * Render announcement banner on home screen
     */
    renderAnnouncementBanner: function() {
      var el = document.getElementById('announceBanner');
      var ann = V6Urgences.getAnnouncement();
      if (el) {
        if (ann && ann.text) { el.outerHTML = V6UI.getAnnouncementBannerHtml(); }
        else { el.remove(); }
      } else if (ann && ann.text && V6Engine.getState().step === 0) { V6Engine.render(); }
    },

    /**
     * Render urgency alert banner on home screen
     */
    renderUrgencyBanner: function() {
      var el = document.getElementById('urgencyBanner');
      var urg = V6Urgences.getUrgencyAlert();
      if (el) {
        if (urg && urg.active) { el.outerHTML = V6UI.getUrgencyBannerHtml(); }
        else { el.remove(); }
      } else if (urg && urg.active && V6Engine.getState().step === 0) { V6Engine.render(); }
    },

    /**
     * Generate announcement banner HTML
     * @returns {string} HTML string
     */
    getAnnouncementBannerHtml: function() {
      var ann = V6Urgences.getAnnouncement();
      if (!ann || !ann.text) return '';
      var escapeHtml = V6Data.escapeHtml;
      var d = ann.timestamp ? new Date(ann.timestamp).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return '<div id="announceBanner" style="margin-bottom:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(212,160,23,.18),rgba(212,160,23,.06));border:2px solid var(--gold);border-radius:14px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<span style="font-size:22px">\uD83D\uDCE2</span>' +
          '<span style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:2px;color:var(--gold);flex:1">ANNONCE</span>' +
          '<span style="font-size:10px;color:var(--muted)">' + d + '</span>' +
        '</div>' +
        '<div style="font-size:14px;color:var(--txt);line-height:1.5;white-space:pre-wrap">' + escapeHtml(ann.text) + '</div>' +
        '<div style="font-size:11px;color:var(--gold);margin-top:6px;text-align:right">\u2014 ' + escapeHtml(ann.author || '') + '</div>' +
      '</div>';
    },

    /**
     * Generate urgency banner HTML
     * @returns {string} HTML string
     */
    getUrgencyBannerHtml: function() {
      var urg = V6Urgences.getUrgencyAlert();
      if (!urg || !urg.active) return '';
      var d = urg.timestamp ? new Date(urg.timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '';
      var chef = V6Auth.isUserChef();
      return '<div id="urgencyBanner" style="margin-bottom:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(192,57,43,.25),rgba(192,57,43,.08));border:2px solid var(--red);border-radius:14px;animation:pulse-border 1.5s infinite">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:26px">\uD83D\uDEA8</span>' +
          '<div style="flex:1">' +
            '<div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--red);font-weight:700">ALERTE URGENCE</div>' +
            '<div style="font-size:13px;color:var(--txt);margin-top:3px">Contactez votre chef imm\u00E9diatement \u2014 ' + d + '</div>' +
          '</div>' +
        '</div>' +
        (chef ? '<button onclick="liftUrgencyAlert()" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--green);background:rgba(39,174,96,.1);color:var(--green);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:2px;cursor:pointer">\u2705 LEVER L\'ALERTE</button>' : '') +
      '</div>';
    },

    /**
     * Generate full audit QA PDF
     */
    generateAuditPDF: function() {
      V6UI.showToast('\uD83D\uDCC4 G\u00E9n\u00E9ration du rapport d\'audit...', 'ok');
      // This is a massive function (~400 lines). Delegating to the monolith's
      // generateAuditPDF if present, or providing minimal stub.
      if (typeof window.generateAuditPDF === 'function' && window.generateAuditPDF !== V6UI.generateAuditPDF) {
        window.generateAuditPDF();
        return;
      }
      V6UI.showToast('\u26A0\uFE0F G\u00E9n\u00E9ration PDF non disponible en mode V6', 'err');
    },

    /**
     * Fetch weather data from Open-Meteo API (cached 1h)
     * @returns {Promise<Object|null>} Weather data or null on failure
     */
    fetchWeather: function() {
      var cached = V6Data.safeGetLS(WEATHER_CACHE_KEY, null);
      if (cached && (Date.now() - cached.ts < WEATHER_CACHE_TTL)) {
        return Promise.resolve(cached);
      }
      return fetch('https://api.open-meteo.com/v1/forecast?latitude=45.4042&longitude=-71.8929&current=temperature_2m,weather_code,wind_speed_10m&timezone=America/Toronto')
        .then(function(r) { return r.json(); })
        .then(function(j) {
          var c = j.current;
          var w = {
            temp: Math.round(c.temperature_2m),
            code: c.weather_code,
            wind: Math.round(c.wind_speed_10m),
            icon: WMO_ICONS[c.weather_code] || '\uD83C\uDF21',
            label: WMO_LABELS[c.weather_code] || '',
            ts: Date.now()
          };
          V6Data.safeSetLS(WEATHER_CACHE_KEY, w);
          return w;
        })
        .catch(function() { return cached || null; });
    },

    /**
     * Trigger photo file input click
     */
    triggerPhoto: function() {
      var el = document.getElementById('photoInput');
      if (el) el.click();
    },

    /**
     * Handle photo capture, resize, convert to base64
     * @param {HTMLInputElement} input - File input element
     */
    handlePhoto: function(input) {
      if (!input.files || !input.files[0]) return;
      var state = V6Engine.getState();
      if (state.setupPhotos.length >= 10) { V6UI.showToast('\u26A0\uFE0F Maximum 10 photos', 'err'); return; }
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var MAX = 600;
          var w = img.width, h = img.height;
          if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
          else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var compressed = canvas.toDataURL('image/jpeg', 0.35);
          var photos = state.setupPhotos.slice();
          photos.push({ data: compressed, ts: Date.now() });
          V6Engine.setState({ setupPhotos: photos });
          V6UI.showToast('\uD83D\uDCF7 Photo ajout\u00E9e (' + photos.length + '/10)', 'ok');
          if (navigator.vibrate) navigator.vibrate(50);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      input.value = '';
    },

    /**
     * Initialize team photo carousel on home screen
     */
    initTeamCarousel: function() {
      clearInterval(_carouselTimer);
      var el = document.getElementById('teamCarousel');
      if (!el) return;
      var slides = el.querySelectorAll('.team-carousel-slide');
      var dots = el.querySelectorAll('.team-carousel-dot');
      var counter = el.querySelector('.team-carousel-counter');
      if (slides.length < 2) return;
      var idx = 0;
      function syncVideos(i) {
        for (var j = 0; j < slides.length; j++) {
          var v = slides[j].querySelector('video');
          if (v) {
            if (j === i) { v.currentTime = 0; v.play().catch(function() {}); }
            else { v.pause(); }
          }
        }
      }
      syncVideos(0);
      _carouselTimer = setInterval(function() {
        slides[idx].classList.remove('active');
        if (dots[idx]) dots[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
        if (dots[idx]) dots[idx].classList.add('active');
        if (counter) counter.textContent = (idx + 1) + ' / ' + slides.length;
        syncVideos(idx);
      }, 4500);
    },

    /**
     * Render the chat floating action button
     * @returns {string} HTML string
     */
    renderChatFab: function() {
      var state = V6Engine.getState();
      if (state.step === 17 || !state.loggedIn) return '';
      // Check if chat system is available
      var chatMessages = window.chatMessages;
      if (!chatMessages) return '';
      var cu = typeof chatGetCurrentUser === 'function' ? chatGetCurrentUser() : null;
      if (!cu) return '';
      var unread = window.chatUnreadCount || 0;
      var lastMsg = chatMessages.length ? chatMessages[chatMessages.length - 1] : null;
      var chatLastNotifiedId = window.chatLastNotifiedId || '';
      var showToastPreview = lastMsg && lastMsg.id !== chatLastNotifiedId && lastMsg.authorId !== cu.id && unread > 0;

      var html = '<div class="chat-fab" onclick="window._chatPrevStep=V6Engine.getState().step;V6Engine.setState({step:17})">';
      html += '<button class="chat-fab-btn">\uD83D\uDCAC</button>';
      if (unread > 0) html += '<div class="chat-fab-badge">' + unread + '</div>';
      if (showToastPreview) {
        html += '<div class="chat-fab-toast" id="chatFabToast">';
        html += '<div class="chat-fab-toast-name">' + lastMsg.authorName.split(' ')[0] + '</div>';
        html += '<div class="chat-fab-toast-text">' + lastMsg.text.substring(0, 60) + (lastMsg.text.length > 60 ? '\u2026' : '') + '</div>';
        html += '<div class="chat-fab-toast-time">' + (typeof chatTimeAgo === 'function' ? chatTimeAgo(lastMsg.timestamp) : '') + '</div>';
        html += '</div>';
        window.chatLastNotifiedId = lastMsg.id;
        clearTimeout(window.chatFabToastTimer);
        window.chatFabToastTimer = setTimeout(function() {
          var t = document.getElementById('chatFabToast');
          if (t) t.style.display = 'none';
        }, 4000);
      }
      html += '</div>';
      return html;
    },

    /**
     * Update chat FAB badge with unread count
     */
    updateChatFab: function() {
      var existing = document.getElementById('chatFabWrap');
      if (existing) existing.innerHTML = V6UI.renderChatFab();
    },

    /**
     * Store deferred PWA install event
     * @param {Event} e - beforeinstallprompt event
     */
    setDeferredInstall: function(e) {
      _deferredInstall = e;
    }
  };

  // ── Expose globals for onclick handlers ──
  window.showToast = function(msg, type) { V6UI.showToast(msg, type); };
  window.playEagleCry = function() { V6UI.playEagleCry(); };
  window.timeAgo = function(ts) { return V6UI.timeAgo(ts); };
  window.timeClass = function(ts) { return V6UI.timeClass(ts); };
  window.triggerPhoto = function() { V6UI.triggerPhoto(); };
  window.handlePhoto = function(input) { V6UI.handlePhoto(input); };
  window.openProfile = function(userId) { V6UI.openProfile(userId); };
  window.handleProfilePhoto = function(input, userId) { V6UI.handleProfilePhoto(input, userId); };
  window.saveProfile = function(userId) { V6UI.saveProfile(userId); };
  window.selectPickoffDeployment = function(idx) { V6UI.selectPickoffDeployment(idx); };
  window.toggleThemeMain = function() { V6UI.toggleThemeMain(); };
  window.pwaInstall = function() { V6UI.pwaInstall(); };
  window.generateAuditPDF = function() { V6UI.generateAuditPDF(); };
  window.renderVersionFooter = function() { return V6UI.renderVersionFooter(); };
  window.renderWeatherWidget = function(w) { return V6UI.renderWeatherWidget(w); };
  window.fetchWeather = function() { return V6UI.fetchWeather(); };
  window.initTeamCarousel = function() { V6UI.initTeamCarousel(); };
  window.getEquipmentAlerts = function() { return V6UI.getEquipmentAlerts(); };
  window.checkExpirations = function() { return V6UI.checkExpirations(); };
  window.checkOverdueItems = function() { V6UI.checkOverdueItems(); };
  window.renderAnnouncementBanner = function() { V6UI.renderAnnouncementBanner(); };
  window.renderUrgencyBanner = function() { V6UI.renderUrgencyBanner(); };

})(window);
