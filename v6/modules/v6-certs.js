/**
 * @module v6-certs.js
 * @description Certifications management, formation views, member history and stats
 * @version 6.0.0
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS)
 * @depends v6-engine.js (state)
 * @depends data.js (PERSONNEL)
 */
(function(window) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var CERTS_DEFS = [
    { id: 'RCR', name: 'RCR/DEA', dur: 24, icon: '\u2764\uFE0F' },
    { id: 'PDSB', name: 'PDSB', dur: 36, icon: '\uD83C\uDFE5' },
    { id: 'SIMDUT', name: 'SIMDUT', dur: 24, icon: '\u26A0\uFE0F' },
    { id: 'NACELLE', name: 'Nacelle', dur: 36, icon: '\uD83C\uDFD7' },
    { id: 'CHARIOT', name: 'Chariot \u00E9l\u00E9vateur', dur: 36, icon: '\uD83D\uDE9C' },
    { id: 'ESPACE', name: 'Espace clos', dur: 24, icon: '\uD83D\uDD73' },
    { id: 'TRAVHAUT', name: 'Travail en hauteur', dur: 36, icon: '\u2B06\uFE0F' },
    { id: 'SAUV', name: 'Sauvetage technique', dur: 12, icon: '\uD83E\uDD85' },
    { id: 'ELECTR', name: '\u00C9lectricit\u00E9', dur: 36, icon: '\u26A1' },
    { id: 'SECOUR', name: 'Premiers secours', dur: 36, icon: '\uD83E\uDE79' }
  ];

  // Private state
  var formView = 'main';
  var formTeamTab = 'SAUVETEUR';
  var formTeamSearch = '';

  // ── Public API ─────────────────────────────────────────────
  window.V6Certs = {

    /** Expose cert definitions */
    CERTS_DEFS: CERTS_DEFS,

    /**
     * Get certifications for a member
     * @param {string} voloId - VOLO ID
     * @returns {Object} Map of certId -> date string
     */
    getCerts: function(voloId) {
      return V6Data.safeGetLS('volo_certs_' + voloId, {});
    },

    /**
     * Set certification date for a member + send webhook
     * @param {string} voloId - VOLO ID
     * @param {string} certId - Certification ID
     * @param {string} dateStr - Date string
     */
    setCert: function(voloId, certId, dateStr) {
      var c = V6Certs.getCerts(voloId);
      c[certId] = dateStr;
      V6Data.safeSetLS('volo_certs_' + voloId, c);
      // Webhook
      try {
        fetch('/api/webhook-main', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CERT_UPDATE', volo: voloId, cert: certId, date: dateStr, ts: new Date().toISOString() }) });
      } catch(e) {}
      // Dual-write Firestore
      try { if (typeof VoloData !== 'undefined' && VoloData.setCert) { var un = localStorage.getItem('volo_last_user') || ''; VoloData.setCert(voloId, certId, dateStr, un); } } catch(e) {}
    },

    /**
     * Calculate certification status from date and duration
     * @param {string} dateStr - Certification date string
     * @param {number} durMonths - Duration in months before expiry
     * @returns {Object} { status, label, cls }
     */
    getCertStatus: function(dateStr, durMonths) {
      if (!dateStr) return { status: 'missing', label: 'Non renseign\u00E9', cls: 'exp' };
      var exp = new Date(dateStr);
      exp.setMonth(exp.getMonth() + durMonths);
      var now = new Date();
      var diff = exp - now;
      var days = Math.ceil(diff / 86400000);
      if (days < 0) return { status: 'expired', label: 'Expir\u00E9 depuis ' + Math.abs(days) + 'j', cls: 'exp' };
      if (days <= 30) return { status: 'warning', label: 'Expire dans ' + days + 'j', cls: 'warn' };
      return { status: 'ok', label: 'Valide \u2014 expire le ' + exp.toLocaleDateString('fr-CA'), cls: 'ok' };
    },

    /**
     * Render certification badges for a member
     * @param {string} voloId - VOLO ID
     * @returns {string} HTML string with cert badges
     */
    renderCertSection: function(voloId) {
      var certs = V6Certs.getCerts(voloId);
      var chef = V6Auth.isUserChef();
      var h = '<div style="margin-top:18px"><div style="font-family:Oswald,sans-serif;font-size:.85rem;color:var(--gold);margin-bottom:10px;letter-spacing:1px">CERTIFICATIONS</div>';
      CERTS_DEFS.forEach(function(cd) {
        var st = V6Certs.getCertStatus(certs[cd.id], cd.dur);
        h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">';
        h += '<span style="font-size:1.1rem">' + cd.icon + '</span>';
        h += '<div style="flex:1"><div style="font-size:.78rem;font-weight:600">' + cd.name + '</div>';
        h += '<div><span class="cert-badge ' + st.cls + '">' + st.label + '</span></div></div>';
        if (chef) {
          h += '<input type="date" value="' + (certs[cd.id] || '') + '" style="background:var(--card);border:1px solid var(--border);color:var(--txt);border-radius:6px;padding:2px 6px;font-size:.65rem" onchange="V6Certs.setCert(\'' + voloId + '\',\'' + cd.id + '\',this.value)">';
        }
        h += '</div>';
      });
      h += '</div>';
      return h;
    },

    /**
     * Get all certification alerts (expired + warning) across team
     * @returns {Array} Alert objects
     */
    getCertAlerts: function() {
      var alerts = [];
      if (typeof PERSONNEL === 'undefined') return alerts;
      PERSONNEL.forEach(function(p) {
        var certs = V6Certs.getCerts(p.volo);
        CERTS_DEFS.forEach(function(cd) {
          var st = V6Certs.getCertStatus(certs[cd.id], cd.dur);
          if (st.status === 'expired' || st.status === 'warning') {
            alerts.push({ volo: p.volo, name: p.name, cert: cd.name, icon: cd.icon, status: st.status, label: st.label });
          }
        });
      });
      return alerts;
    },

    /**
     * Get transaction history for a specific member
     * @param {string} voloId - VOLO ID
     * @returns {Array} Transaction entries
     */
    getMemberHistory: function(voloId) {
      var hist = V6Data.safeGetLS('volo_history', []);
      return hist.filter(function(h) { return h.pin === voloId || h.user === voloId || (h.sauveteurs && h.sauveteurs.indexOf(voloId) !== -1); }).sort(function(a, b) { return new Date(b.ts || b.date) - new Date(a.ts || a.date); });
    },

    /**
     * Get pointage history for a specific member
     * @param {string} voloId - VOLO ID
     * @returns {Array} Pointage entries
     */
    getMemberPointage: function(voloId) {
      var pts = V6Data.safeGetLS('volo_pointage_log', []);
      return pts.filter(function(p) { return p.volo === voloId || p.pin === voloId; }).sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
    },

    /**
     * Calculate member stats over N days
     * @param {string} voloId - VOLO ID
     * @param {number} days - Number of days to analyze
     * @returns {Object} Stats { missions, pointages, period }
     */
    getMemberStats: function(voloId, days) {
      var since = Date.now() - days * 86400000;
      var hist = V6Certs.getMemberHistory(voloId).filter(function(h) { return new Date(h.ts || h.date) >= since; });
      var pts = V6Certs.getMemberPointage(voloId).filter(function(p) { return new Date(p.ts) >= since; });
      return { missions: hist.length, pointages: pts.length, period: days + 'j' };
    },

    /**
     * Render mission timeline for a member (last 20 missions)
     * @param {string} voloId - VOLO ID
     * @returns {string} HTML string
     */
    renderMemberTimeline: function(voloId) {
      var items = V6Certs.getMemberHistory(voloId).slice(0, 20);
      if (!items.length) return '<div style="color:var(--muted);font-size:.75rem;padding:12px 0">Aucun historique</div>';
      var h = '<div style="margin-top:18px"><div style="font-family:Oswald,sans-serif;font-size:.85rem;color:var(--gold);margin-bottom:10px;letter-spacing:1px">HISTORIQUE MISSIONS</div>';
      var s30 = V6Certs.getMemberStats(voloId, 30), s60 = V6Certs.getMemberStats(voloId, 60), s90 = V6Certs.getMemberStats(voloId, 90);
      h += '<div style="display:flex;gap:8px;margin-bottom:12px">';
      [s30, s60, s90].forEach(function(s) {
        h += '<div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px;text-align:center">';
        h += '<div style="font-size:1.1rem;font-weight:700;color:var(--rescue)">' + s.missions + '</div>';
        h += '<div style="font-size:.55rem;color:var(--muted)">missions ' + s.period + '</div></div>';
      });
      h += '</div>';
      h += '<div class="hist-timeline">';
      items.forEach(function(it) {
        var d = new Date(it.ts || it.date);
        var mode = it.mode || 'PICK-ON';
        var color = mode === 'PICK-OFF' ? 'var(--blue)' : 'var(--rescue)';
        h += '<div class="hist-item" style="border-left-color:' + color + '">';
        h += '<div style="font-size:.6rem;color:var(--muted)">' + d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) + '</div>';
        h += '<div style="font-size:.78rem;font-weight:600;color:' + color + '">' + mode + '</div>';
        if (it.depot) h += '<div style="font-size:.65rem;color:var(--muted)">D\u00E9p\u00F4t: ' + it.depot + '</div>';
        if (it.destination) h += '<div style="font-size:.65rem;color:var(--muted)">Dest: ' + it.destination + '</div>';
        h += '</div>';
      });
      h += '</div></div>';
      return h;
    },

    /**
     * Get certification status for display (wrapper)
     * @param {string} certId - Certification ID
     * @param {string} userId - User VOLO ID
     * @returns {Object} { status, label, color, exp }
     */
    certStatus: function(certId, userId) {
      var data = V6Certs.getCerts(userId);
      var cert = CERTS_DEFS.find(function(c) { return c.id === certId; });
      if (!cert) return { status: 'missing', label: '\u2014', color: 'var(--muted)' };
      var d = data[certId];
      if (!d) return { status: 'missing', label: 'NON ENREGISTR\u00C9', color: 'var(--muted)' };
      var exp = new Date(d);
      var origDay = exp.getDate();
      exp.setMonth(exp.getMonth() + cert.dur);
      if (exp.getDate() !== origDay) exp.setDate(0);
      var now = new Date();
      var days = Math.ceil((exp - now) / 86400000);
      if (days < 0) return { status: 'expired', label: 'EXPIR\u00C9 (' + Math.abs(days) + 'j)', color: 'var(--red)', exp: exp.toISOString().slice(0, 10) };
      if (days < 60) return { status: 'warning', label: days + 'j restants', color: 'var(--gold)', exp: exp.toISOString().slice(0, 10) };
      return { status: 'valid', label: 'OK \u2192 ' + exp.toISOString().slice(0, 10), color: 'var(--green)', exp: exp.toISOString().slice(0, 10) };
    },

    /**
     * Render formation view (step 13)
     */
    renderFormation: function() {
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      var surv = V6Auth.isUserSurv();
      if (formView === 'certs') return V6Certs.renderMyCerts(user);
      if (formView === 'team' && !surv) return V6Certs.renderTeamCerts();

      var userId = user ? user.id : 'unknown';
      var stats = CERTS_DEFS.map(function(c) { return V6Certs.certStatus(c.id, userId); });
      var expired = stats.filter(function(s) { return s.status === 'expired'; }).length;
      var warning = stats.filter(function(s) { return s.status === 'warning'; }).length;
      var valid = stats.filter(function(s) { return s.status === 'valid'; }).length;
      var missing = stats.filter(function(s) { return s.status === 'missing'; }).length;
      var badgeColor = expired > 0 ? 'var(--red)' : warning > 0 ? 'var(--gold)' : valid > 0 ? 'var(--green)' : 'var(--muted)';
      var badgeIcon = expired > 0 ? '\uD83D\uDEA8' : warning > 0 ? '\u26A0\uFE0F' : valid > 0 ? '\u2705' : '\uD83D\uDCCB';
      var badgeText = expired > 0 ? expired + ' expir\u00E9e' + (expired > 1 ? 's' : '') : warning > 0 ? warning + ' bient\u00F4t' : missing === CERTS_DEFS.length ? 'Aucune enregistr\u00E9e' : valid + '/' + CERTS_DEFS.length + ' \u00E0 jour';

      var DOCS = surv ? [] : [
        { title: 'Formation Sauvetage Technique', desc: 'Ancrages, n\u0153uds, CIAIAI, empaquetages, Terradaptor, Skate Block, Twin Tension', icon: '\uD83C\uDF93', type: 'PDF', url: 'https://drive.google.com/file/d/1GqMlfK6K_uFAJZHcaPNerI9i3D9KzWUt/view' }
      ];

      return '<div style="padding-top:10px">' +
        '<button class="top-back" onclick="V6Engine.setState({step:0})">\u25C0 RETOUR</button>' +
        '<h2 style="text-align:center;margin:0;font-size:22px;letter-spacing:2px">\uD83D\uDCDA FORMATION & DOCS</h2>' +
        '<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px">' + (user ? user.name : '\u2014') + '</div>' +
        '<div onclick="V6Certs._setFormView(\'certs\')" style="margin-top:16px;padding:14px 16px;background:var(--card);border:2px solid ' + badgeColor + ';border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:14px">' +
          '<span style="font-size:28px">' + badgeIcon + '</span>' +
          '<div style="flex:1;text-align:left"><div style="font-weight:700;font-size:15px;color:' + badgeColor + '">MES CERTIFICATIONS</div><div style="font-size:11px;color:var(--muted);margin-top:2px">' + badgeText + '</div></div>' +
          '<span style="font-size:18px;color:var(--muted)">\u2192</span>' +
        '</div>' +
        (surv ? '' : '<div onclick="V6Certs._setFormView(\'team\')" style="margin-top:10px;padding:14px 16px;background:var(--card);border:1px solid rgba(59,130,246,.3);border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:14px"><span style="font-size:28px">\uD83D\uDC65</span><div style="flex:1;text-align:left"><div style="font-weight:700;font-size:15px;color:var(--blue)">TRACKER \u00C9QUIPE</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Sauveteurs \u2022 Surveillants \u2022 Vue compl\u00E8te</div></div><span style="font-size:18px;color:var(--muted)">\u2192</span></div>') +
        (DOCS.length ? '<div style="margin-top:20px;font-size:11px;color:var(--gold);letter-spacing:2px;font-family:Oswald,sans-serif;margin-bottom:8px">DOCUMENTS DE FORMATION</div>' +
          DOCS.map(function(d) { return '<div onclick="window.open(\'' + d.url + '\',\'_blank\')" style="padding:14px;margin-bottom:10px;background:linear-gradient(135deg,var(--card),rgba(251,191,36,.04));border:1px solid rgba(251,191,36,.2);border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:14px"><div style="font-size:30px">' + d.icon + '</div><div style="flex:1;text-align:left"><div style="font-weight:700;font-size:13px">' + d.title + '</div><div style="font-size:10px;color:var(--muted);margin-top:3px">' + d.desc + '</div><span style="font-size:9px;padding:2px 8px;background:rgba(251,191,36,.15);color:var(--gold);border-radius:6px;font-weight:600;margin-top:4px;display:inline-block">' + d.type + '</span></div><span style="font-size:18px;color:var(--gold)">\u2197</span></div>'; }).join('') : '') +
      '</div>';
    },

    /**
     * Render user's own certifications
     * @param {Object} user - User profile object
     * @returns {string} HTML string
     */
    renderMyCerts: function(user) {
      var userId = user ? user.id : 'unknown';
      var data = V6Certs.getCerts(userId);
      return '<div style="padding-top:10px">' +
        '<button class="top-back" onclick="V6Certs._setFormView(\'main\')">\u25C0 RETOUR</button>' +
        '<h2 style="text-align:center;margin:0;font-size:20px">\uD83D\uDCCB MES CERTIFICATIONS</h2>' +
        '<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px;margin-bottom:16px">' + (user ? user.name : '\u2014') + ' \u2022 Entre ta date d\'obtention</div>' +
        CERTS_DEFS.map(function(c) {
          var s = V6Certs.certStatus(c.id, userId);
          var bg = s.status === 'expired' ? 'rgba(192,57,43,.08)' : s.status === 'warning' ? 'rgba(212,160,23,.08)' : s.status === 'valid' ? 'rgba(39,174,96,.06)' : 'var(--card)';
          var border = s.status === 'expired' ? 'rgba(192,57,43,.4)' : s.status === 'warning' ? 'rgba(212,160,23,.4)' : s.status === 'valid' ? 'rgba(39,174,96,.3)' : 'var(--border)';
          return '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:' + bg + ';border:1px solid ' + border + ';border-radius:12px;margin-bottom:6px">' +
            '<div style="font-size:20px;min-width:28px;text-align:center">' + c.icon + '</div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + c.name + '</div><div style="font-size:10px;color:' + s.color + ';font-weight:600;margin-top:1px">' + s.label + '</div><div style="font-size:9px;color:var(--muted)">Dur\u00E9e: ' + c.dur + ' mois</div></div>' +
            '<input type="date" value="' + (data[c.id] || '') + '" onchange="V6Certs.saveMyCert(\'' + userId + '\',\'' + c.id + '\',this.value)" style="padding:6px;border-radius:8px;border:1px solid ' + border + ';background:var(--card);color:var(--txt);font-size:11px;width:125px">' +
          '</div>';
        }).join('') +
      '</div>';
    },

    /**
     * Save a certification date
     * @param {string} userId - VOLO ID
     * @param {string} certId - Certification ID
     * @param {string} val - Date value
     */
    saveMyCert: function(userId, certId, val) {
      var data = V6Certs.getCerts(userId);
      if (val) data[certId] = val; else delete data[certId];
      V6Data.safeSetLS('volo_certs_' + userId, data);
      var user = PERSONNEL.find(function(p) { return p.id === userId; });
      var certDef = CERTS_DEFS.find(function(c) { return c.id === certId; });
      var payload = { type: 'CERT_UPDATE', sauveteur_id: userId, sauveteur_nom: user ? user.name : '', cert_id: certId, cert_name: certDef ? certDef.name : '', date_obtention: val, timestamp: V6Data.tsNow() };
      fetch('/api/webhook-main', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function() {
        try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(payload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {}
      });
      V6Engine.render();
    },

    /**
     * Render team certifications grid
     * @returns {string} HTML string
     */
    renderTeamCerts: function() {
      var people = PERSONNEL.filter(function(p) { return (p.type || 'SAUVETEUR') === formTeamTab; });
      var filtered = formTeamSearch ? people.filter(function(p) { return p.name.toLowerCase().indexOf(formTeamSearch.toLowerCase()) !== -1; }) : people;
      var sCount = PERSONNEL.filter(function(p) { return (p.type || 'SAUVETEUR') === 'SAUVETEUR'; }).length;
      var vCount = PERSONNEL.filter(function(p) { return p.type === 'SURVEILLANT'; }).length;

      return '<div style="padding-top:10px">' +
        '<button class="top-back" onclick="V6Certs._setFormView(\'main\')">\u25C0 RETOUR</button>' +
        '<h2 style="text-align:center;margin:0;font-size:20px">\uD83D\uDC65 TRACKER \u00C9QUIPE</h2>' +
        '<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px;margin-bottom:14px">Statut certifications de l\'\u00E9quipe</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px">' +
          '<button class="btn ' + (formTeamTab === 'SAUVETEUR' ? 'btn-green' : 'btn-outline') + '" onclick="V6Certs._setTeamTab(\'SAUVETEUR\')" style="flex:1;font-size:12px;padding:10px">\uD83E\uDD85 Sauveteurs (' + sCount + ')</button>' +
          '<button class="btn ' + (formTeamTab === 'SURVEILLANT' ? 'btn-gold' : 'btn-outline') + '" onclick="V6Certs._setTeamTab(\'SURVEILLANT\')" style="flex:1;font-size:12px;padding:10px">\uD83D\uDC77 Surveillants (' + vCount + ')</button>' +
        '</div>' +
        '<input placeholder="\uD83D\uDD0D Rechercher..." value="' + formTeamSearch + '" oninput="V6Certs._setTeamSearch(this.value)" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:13px;margin-bottom:12px">' +
        '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:10px;color:var(--muted);justify-content:center"><span>\uD83D\uDFE2 OK</span><span>\uD83D\uDFE1 &lt;60j</span><span>\uD83D\uDD34 Expir\u00E9</span><span>\u26AA Vide</span></div>' +
        (filtered.length > 0 ? filtered.map(function(p) {
          var statuses = CERTS_DEFS.map(function(c) { return V6Certs.certStatus(c.id, p.id); });
          var dots = statuses.map(function(s) { return s.status === 'valid' ? '\uD83D\uDFE2' : s.status === 'warning' ? '\uD83D\uDFE1' : s.status === 'expired' ? '\uD83D\uDD34' : '\u26AA'; }).join('');
          var expCount = statuses.filter(function(s) { return s.status === 'expired'; }).length;
          var warnCount = statuses.filter(function(s) { return s.status === 'warning'; }).length;
          var okCount = statuses.filter(function(s) { return s.status === 'valid'; }).length;
          var bg = expCount > 0 ? 'rgba(192,57,43,.06)' : warnCount > 0 ? 'rgba(212,160,23,.06)' : 'var(--card)';
          return '<div style="padding:10px 12px;background:' + bg + ';border:1px solid var(--border);border-radius:10px;margin-bottom:5px"><div style="display:flex;align-items:center;justify-content:space-between"><div><div style="font-size:13px;font-weight:600">' + p.name + '</div><div style="font-size:10px;color:var(--muted)">' + p.volo + ' \u2022 ' + (p.region || '\u2014') + '</div></div><div style="text-align:right"><div style="font-size:12px;letter-spacing:1px">' + dots + '</div><div style="font-size:9px;color:var(--muted);margin-top:2px">' + okCount + '\u2713 ' + warnCount + '\u26A0 ' + expCount + '\u2717</div></div></div></div>';
        }).join('') : '<div style="text-align:center;color:var(--muted);padding:20px">Aucun r\u00E9sultat</div>') +
      '</div>';
    },

    // Internal helpers for onclick
    _setFormView: function(v) { formView = v; V6Engine.render(); },
    _setTeamTab: function(t) { formTeamTab = t; V6Engine.render(); },
    _setTeamSearch: function(v) { formTeamSearch = v; V6Engine.debounceInput('teamSearch', function() { V6Engine.render(); }); }
  };

  // Expose globals for onclick handlers in HTML
  window.setCert = function(v, c, d) { V6Certs.setCert(v, c, d); };
  window.getCerts = function(v) { return V6Certs.getCerts(v); };
  window.getCertAlerts = function() { return V6Certs.getCertAlerts(); };
  window.certStatus = function(c, u) { return V6Certs.certStatus(c, u); };

})(window);
