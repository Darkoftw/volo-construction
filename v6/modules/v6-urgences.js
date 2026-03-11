/**
 * @module v6-urgences.js
 * @description Emergency alerts, announcements, Firebase real-time listeners
 * @version 6.0.0
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS, escapeHtml)
 * @depends v6-engine.js (state, setState)
 * @depends v6-auth.js (isUserChef)
 */
(function(window) {
  'use strict';

  // ── Private variables ──────────────────────────────────────
  var voloAnnouncement = null;
  var voloUrgencyAlert = null;
  var _announcementListener = null;
  var _urgencyListener = null;

  // ── Public API ─────────────────────────────────────────────
  window.V6Urgences = {

    /**
     * Get current announcement value
     * @returns {Object|null}
     */
    getAnnouncement: function() { return voloAnnouncement; },

    /**
     * Get current urgency alert value
     * @returns {Object|null}
     */
    getUrgencyAlert: function() { return voloUrgencyAlert; },

    /**
     * Send emergency alert via webhook
     */
    sendUrgence: function() {
      var state = V6Engine.getState();
      var btn = document.querySelector('.btn-red.btn-sm');
      if (btn) { btn.disabled = true; btn.textContent = 'ENVOI EN COURS...'; }
      var type = state.urgenceType || 'D\u00E9tecteur de gaz manquant';
      var details = state.urgenceNote || '';
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      var sauv = user || { name: 'Inconnu', id: 'N/A' };
      var payload = {
        type: type,
        details: details,
        sauveteur: sauv.name,
        sauveteur_id: sauv.id,
        timestamp: V6Data.tsNow()
      };
      fetch('/api/webhook-urgence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(function(r) { if (r.ok) V6UI.showToast('\uD83D\uDEA8 Urgence envoy\u00E9e', 'ok'); else V6UI.showToast('\u26A0\uFE0F Erreur envoi', 'err'); })
      .catch(function() {
        V6UI.showToast('\uD83D\uDCF4 Hors-ligne \u2014 urgence en queue', 'err');
        try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push({ url: '/api/webhook-urgence', payload: payload, ts: Date.now() }); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {}
      }).finally(function() {
        V6Engine.setState({ showModal: null, urgenceType: '', urgenceNote: '' });
      });
      // Dual-write Firestore
      try { if (typeof VoloData !== 'undefined' && window.firebaseFS) { window.firebaseFS.collection('urgences').add(Object.assign({}, payload, { org: window.VOLO_ORG || '', createdAt: new Date().toISOString() })); } } catch(e) {}
    },

    /**
     * Load announcement + urgency from Firebase/localStorage
     */
    loadAnnouncement: function() {
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB) {
        if (!_announcementListener) {
          _announcementListener = firebaseDB.ref('announcement').on('value', function(snap) {
            voloAnnouncement = snap.val() || null;
            V6UI.renderAnnouncementBanner();
          });
        }
        if (!_urgencyListener) {
          _urgencyListener = firebaseDB.ref('urgency_alert').on('value', function(snap) {
            voloUrgencyAlert = snap.val() || null;
            V6UI.renderUrgencyBanner();
          });
        }
      } else {
        try { voloAnnouncement = JSON.parse(localStorage.getItem('volo_announcement') || 'null'); } catch(e) { voloAnnouncement = null; }
        try { voloUrgencyAlert = JSON.parse(localStorage.getItem('volo_urgency_alert') || 'null'); } catch(e) { voloUrgencyAlert = null; }
      }
    },

    /**
     * Stop Firebase announcement/urgency listeners
     */
    stopAnnouncementListeners: function() {
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB && _announcementListener) { firebaseDB.ref('announcement').off('value', _announcementListener); _announcementListener = null; }
      if (firebaseDB && _urgencyListener) { firebaseDB.ref('urgency_alert').off('value', _urgencyListener); _urgencyListener = null; }
    },

    /**
     * Show announcement creation modal
     */
    showAnnouncementModal: function() {
      var existing = voloAnnouncement ? voloAnnouncement.text : '';
      V6Engine.setState({ showModal: 'announcement', _announceDraft: existing });
    },

    /**
     * Save announcement to Firebase + localStorage
     */
    saveAnnouncement: function() {
      var state = V6Engine.getState();
      var el = document.getElementById('announce-text');
      var text = el ? el.value.trim() : '';
      if (!text) { V6Urgences.deleteAnnouncement(); return; }
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      var data = { text: text, author: user ? user.name : 'Chef', timestamp: Date.now() };
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB) {
        firebaseDB.ref('announcement').set(data);
      } else {
        localStorage.setItem('volo_announcement', JSON.stringify(data));
        voloAnnouncement = data;
      }
      V6UI.showToast('\uD83D\uDCE2 Annonce publi\u00E9e', 'ok');
      V6Engine.setState({ showModal: null });
    },

    /**
     * Delete current announcement
     */
    deleteAnnouncement: function() {
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB) {
        firebaseDB.ref('announcement').remove();
      } else {
        localStorage.removeItem('volo_announcement');
        voloAnnouncement = null;
      }
      V6UI.showToast('Annonce supprim\u00E9e', 'ok');
      V6Engine.setState({ showModal: null });
    },

    /**
     * Trigger urgency alert to all users
     */
    triggerUrgencyAlert: function() {
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      var data = { active: true, author: user ? user.name : 'Chef', timestamp: Date.now() };
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB) {
        firebaseDB.ref('urgency_alert').set(data);
        firebaseDB.ref('urgency_log').push({ author: data.author, action: 'D\u00C9CLENCH\u00C9E', timestamp: data.timestamp });
      } else {
        localStorage.setItem('volo_urgency_alert', JSON.stringify(data));
        voloUrgencyAlert = data;
      }
      V6UI.showToast('\uD83D\uDEA8 Alerte urgence d\u00E9clench\u00E9e', 'err');
      V6Engine.setState({ showModal: null });
    },

    /**
     * Lift (clear) urgency alert
     */
    liftUrgencyAlert: function() {
      var state = V6Engine.getState();
      var firebaseDB = window._v6FirebaseDB || null;
      if (firebaseDB) {
        firebaseDB.ref('urgency_alert').remove();
        var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
        firebaseDB.ref('urgency_log').push({ author: user ? user.name : 'Chef', action: 'LEV\u00C9E', timestamp: Date.now() });
      } else {
        localStorage.removeItem('volo_urgency_alert');
        voloUrgencyAlert = null;
      }
      V6UI.showToast('Alerte lev\u00E9e', 'ok');
      V6Engine.render();
    },

    /**
     * Show urgency modal (select type + note)
     */
    showUrgence: function() {
      V6Engine.setState({ showModal: 'urgence' });
    },

    /**
     * Show generic confirmation modal for clearing data
     * @param {string} lsKey - localStorage key to clear
     * @param {string} msg - Confirmation message
     * @param {Function} cb - Callback after confirmation
     */
    confirmClear: function(lsKey, msg, cb) {
      window._confirmClearPending = { key: lsKey, msg: msg };
      window._confirmClearCb = cb;
      V6Engine.setState({ showModal: 'confirmClear' });
    }
  };

  // Expose globals for onclick handlers
  window.showUrgence = function() { V6Urgences.showUrgence(); };
  window.sendUrgence = function() { V6Urgences.sendUrgence(); };
  window.confirmClear = function(k, m, cb) { V6Urgences.confirmClear(k, m, cb); };
  window.loadAnnouncement = function() { V6Urgences.loadAnnouncement(); };
  window.stopAnnouncementListeners = function() { V6Urgences.stopAnnouncementListeners(); };
  window.liftUrgencyAlert = function() { V6Urgences.liftUrgencyAlert(); };
  window.showAnnouncementModal = function() { V6Urgences.showAnnouncementModal(); };
  window.saveAnnouncement = function() { V6Urgences.saveAnnouncement(); };
  window.deleteAnnouncement = function() { V6Urgences.deleteAnnouncement(); };
  window.triggerUrgencyAlert = function() { V6Urgences.triggerUrgencyAlert(); };

})(window);
