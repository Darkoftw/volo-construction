/**
 * @module v6-data-bridge.js
 * @description Data access layer, localStorage helpers, backup/restore, offline queue, history, sanitization
 * @version 6.0.0
 * @depends data.js (PERSONNEL, ITEMS, CAISSES)
 */
(function(window) {
  'use strict';

  var VOLO_VERSION = 'V10.5';

  // ── Public API ─────────────────────────────────────────────
  window.V6Data = {

    /**
     * Safe localStorage read with JSON parse and fallback
     * @param {string} key - localStorage key
     * @param {*} fallback - Default value if key missing or corrupt
     * @returns {*} Parsed value or fallback
     */
    safeGetLS: function(key, fallback) {
      try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch(e) { console.warn('localStorage corrupt:', key); return fallback; }
    },

    /**
     * Safe localStorage write with JSON stringify
     * @param {string} key - localStorage key
     * @param {*} val - Value to store
     */
    safeSetLS: function(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn('localStorage write fail:', key); }
    },

    /**
     * Export all volo_* localStorage keys as JSON file download
     */
    exportBackup: function() {
      var keys = Object.keys(localStorage).filter(function(k) { return k.startsWith('volo_'); });
      var data = {};
      keys.forEach(function(k) { try { data[k] = localStorage.getItem(k); } catch(e) {} });
      var blob = new Blob([JSON.stringify({ version: VOLO_VERSION, ts: new Date().toISOString(), data: data }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'volo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      if (window.V6UI) V6UI.showToast('Backup export\u00E9', 'ok');
    },

    /**
     * Import backup JSON file, restore all volo_* keys, reload app
     */
    importBackup: function() {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = function() {
        var f = inp.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function() {
          try {
            var d = JSON.parse(r.result);
            if (!d.data || typeof d.data !== 'object') throw new Error('Format invalide');
            Object.keys(d.data).forEach(function(k) {
              if (k.startsWith('volo_')) localStorage.setItem(k, d.data[k]);
            });
            if (window.V6UI) V6UI.showToast('Backup import\u00E9 \u2014 rechargement...', 'ok');
            setTimeout(function() { location.reload(); }, 1500);
          } catch(e) { if (window.V6UI) V6UI.showToast('Fichier invalide', 'err'); }
        };
        r.readAsText(f);
      };
      inp.click();
    },

    /**
     * Append entry to append-only audit log
     * @param {Object} payload - Audit log entry
     */
    appendAuditLog: function(payload) {
      try {
        var log = JSON.parse(localStorage.getItem('volo_audit_log') || '[]');
        var entry = {};
        for (var k in payload) { if (payload.hasOwnProperty(k)) entry[k] = payload[k]; }
        entry.audit_id = 'AUD-' + Date.now();
        entry.audit_ts = new Date().toISOString();
        log.push(entry);
        if (log.length > 500) log.splice(0, log.length - 500);
        localStorage.setItem('volo_audit_log', JSON.stringify(log));
      } catch(e) {}
    },

    /**
     * Read the full audit log
     * @returns {Array} Audit log entries
     */
    getAuditLog: function() {
      try { return JSON.parse(localStorage.getItem('volo_audit_log') || '[]'); } catch(e) { return []; }
    },

    /**
     * Parse flexible date strings (MM/YYYY, DD/MM/YYYY, ISO, etc.)
     * @param {string} str - Date string to parse
     * @returns {Date|null} Parsed date or null
     */
    parseFlexDate: function(str) {
      if (!str || str === 'N/A') return null;
      str = String(str).trim();
      // "2034" → Jan 1 2034
      if (/^\d{4}$/.test(str)) return new Date(parseInt(str), 0, 1);
      // "MM/YYYY" or "MM-YYYY"
      var my = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
      if (my) return new Date(parseInt(my[2]), parseInt(my[1]) - 1, 1);
      // "DD/MM/YYYY"
      var dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
      // "D Mois YYYY"
      var months = { jan: 0, fev: 1, 'f\u00E9v': 1, mar: 2, avr: 3, mai: 4, jun: 5, jui: 6, jul: 6, aou: 7, 'ao\u00FB': 7, sep: 8, oct: 9, nov: 10, dec: 11, 'd\u00E9c': 11 };
      var fm = str.match(/^(\d{1,2})\s+([A-Za-z\u00E9\u00FB\u00F4]+)\s+(\d{4})$/);
      if (fm) { var mo = fm[2].toLowerCase().slice(0, 3); if (months[mo] !== undefined) return new Date(parseInt(fm[3]), months[mo], parseInt(fm[1])); }
      return null;
    },

    /**
     * Get transaction history from localStorage
     * @returns {Array} Transaction history entries
     */
    getHistory: function() {
      try { return JSON.parse(localStorage.getItem('volo_history') || '[]'); } catch(e) { return []; }
    },

    /**
     * Save transaction to history + update caisse history
     * @param {Object} payload - Transaction payload
     */
    saveToHistory: function(payload) {
      var h = V6Data.getHistory();
      var txWithId = {};
      for (var k in payload) { if (payload.hasOwnProperty(k)) txWithId[k] = payload[k]; }
      txWithId.id = 'TX-' + Date.now();
      h.unshift(txWithId);
      if (h.length > 200) h.length = 200;
      V6Data.safeSetLS('volo_history', h);
      // Sync to Firebase
      try { V6Engine.syncTxToFirestore(txWithId); } catch(e) {}
      // Archive par caisse
      if (payload.caisses_utilisees) {
        try {
          var caisseHist = V6Data.safeGetLS('volo_caisse_history', {});
          var grpIds = JSON.parse(payload.caisses_utilisees || '[]');
          grpIds.forEach(function(gid) {
            if (!caisseHist[gid]) caisseHist[gid] = [];
            caisseHist[gid].unshift({ mode: payload.mode, dest: payload.destination, depot: payload.depot, user: payload.sauveteur_nom, ts: payload.timestamp });
            if (caisseHist[gid].length > 50) caisseHist[gid].length = 50;
          });
          V6Data.safeSetLS('volo_caisse_history', caisseHist);
        } catch(e) {}
      }
    },

    /**
     * Get currently deployed (active) items
     * @returns {Array} Active item objects
     */
    getActiveItems: function() {
      var h = V6Data.getHistory();
      var active = [];
      var closed = new Set();
      h.forEach(function(tx) {
        if (tx.statut === 'ANNUL\u00C9' || tx.statut === 'RETOURN\u00C9') {
          var key = (tx.original_timestamp || tx.timestamp) + tx.sauveteur_id;
          closed.add(key);
        }
      });
      h.forEach(function(tx) {
        if (tx.statut === 'ACTIF' && tx.mode === 'PICK-ON' && !closed.has(tx.timestamp + tx.sauveteur_id)) {
          try {
            var items = JSON.parse(tx.items || '[]');
            items.forEach(function(item) {
              var entry = {};
              for (var k in item) { if (item.hasOwnProperty(k)) entry[k] = item[k]; }
              entry.sauveteur = tx.sauveteur_nom;
              entry.destination = tx.destination;
              entry.num_projet = tx.num_projet || '';
              entry.personne_ressource = tx.personne_ressource || '';
              entry.timestamp = tx.timestamp;
              entry.txId = tx.id;
              active.push(entry);
            });
          } catch(e) {}
        }
      });
      return active;
    },

    /**
     * Get active PICK-ONs for the current user
     * @returns {Array} Active pick-on transactions
     */
    getMyActivePickOns: function() {
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (!user) return [];
      var active = V6Data.getActiveDeployments();
      return active.filter(function(tx) { return tx.sauveteur_nom === user.name || tx.sauveteur_id === user.id; });
    },

    /**
     * Get all unclosed deployments
     * @returns {Array} Active deployment records
     */
    getActiveDeployments: function() {
      var h = V6Data.getHistory();
      var closed = new Set();
      h.forEach(function(tx) {
        if (tx.statut === 'ANNUL\u00C9' || tx.statut === 'RETOURN\u00C9') {
          var key = (tx.original_timestamp || tx.timestamp) + tx.sauveteur_id;
          closed.add(key);
        }
      });
      return h.filter(function(tx) { return tx.statut === 'ACTIF' && tx.mode === 'PICK-ON' && !closed.has(tx.timestamp + tx.sauveteur_id); });
    },

    /**
     * Get saved terrain contacts from localStorage
     * @returns {Object} Terrain contacts map
     */
    getTerrainContacts: function() {
      try { return JSON.parse(localStorage.getItem('volo_terrain_contacts') || '{}'); } catch(e) { return {}; }
    },

    /**
     * Save a terrain contact for a destination
     * @param {string} destId - Destination ID
     * @param {Object} contact - Contact info
     */
    saveTerrainContact: function(destId, contact) {
      if (!destId) return;
      var contacts = V6Data.getTerrainContacts();
      if (contact && Object.keys(contact).length > 0) {
        contacts[destId] = contact;
        V6Data.safeSetLS('volo_terrain_contacts', contacts);
      }
    },

    /**
     * Load terrain contact for a specific destination
     * @param {string} destId - Destination ID
     * @returns {Object|null} Contact info or null
     */
    loadTerrainContact: function(destId) {
      var contacts = V6Data.getTerrainContacts();
      return contacts[destId] || null;
    },

    /**
     * Escape HTML entities to prevent XSS
     * @param {string} s - Raw string
     * @returns {string} Escaped string
     */
    escapeHtml: function(s) {
      if (!s) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /**
     * Sanitize string for CSV export (prevent formula injection)
     * @param {string} s - Raw string
     * @returns {string} Sanitized string
     */
    sanitizeCSV: function(s) {
      if (!s) return '';
      s = String(s);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return s;
    },

    /**
     * Get current ISO timestamp
     * @returns {string} ISO timestamp
     */
    tsNow: function() {
      return new Date().toISOString();
    },

    /**
     * Update online/offline network badge in DOM
     */
    updateNetBadge: function() {
      var el = document.getElementById('net-badge');
      if (!el) { el = document.createElement('div'); el.id = 'net-badge'; document.body.appendChild(el); }
      if (navigator.onLine) { el.className = 'net-badge net-on'; el.textContent = '\u25CF EN LIGNE'; }
      else { el.className = 'net-badge net-off'; el.textContent = '\u25CF HORS-LIGNE'; }
    },

    /**
     * Flush offline transaction queue (send pending items)
     */
    flushQueue: function() {
      var q;
      try { q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); } catch(e) { return; }
      if (!q.length) return;
      if (window.V6UI) V6UI.showToast('\uD83D\uDD04 Envoi de ' + q.length + ' transaction(s) en attente...', 'ok');
      var VOLO_WH_M = '/api/webhook-main';
      var send = function() {
        var remaining = [];
        var promises = q.map(function(p) {
          var url = p.url ? p.url : VOLO_WH_M;
          var body = p.url ? p.payload : p;
          return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function(r) { if (!r.ok) remaining.push(p); })
            .catch(function() { remaining.push(p); });
        });
        Promise.all(promises).then(function() {
          V6Data.safeSetLS('volo_queue', remaining);
          if (remaining.length === 0) { if (window.V6UI) V6UI.showToast('\u2705 Toutes les transactions envoy\u00E9es', 'ok'); }
          else { if (window.V6UI) V6UI.showToast('\u26A0\uFE0F ' + remaining.length + ' transaction(s) en \u00E9chec', 'err'); }
        });
      };
      send();
    }
  };

})(window);
