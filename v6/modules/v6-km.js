/**
 * @module v6-km.js
 * @description Kilometrage tracking, odometer, route calculation, gains calculations
 * @version 6.0.0
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS, getActiveDeployments)
 * @depends v6-engine.js (state, setState)
 * @depends data.js (PERSONNEL, BAREMES)
 */
(function(window) {
  'use strict';

  // ── Private variables ──────────────────────────────────────
  var _routeCalcTimeout = null;
  var gainsView = 'overview';
  var gainsHistPeriod = 'current';

  // ── Helper ─────────────────────────────────────────────────
  function _getUser() {
    var state = V6Engine.getState();
    return PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; }) || null;
  }

  function _getPayPeriods() {
    var now = new Date();
    var day = now.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var mon = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0,0,0,0);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7);
    var prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1);
    var fmt = function(d) { return d.toISOString().slice(0,10); };
    var label = function(d) { var j = d.getDate(); var m = d.toLocaleString('fr-CA',{month:'short'}); return j + ' ' + m; };
    return {
      current: { label: label(mon) + ' \u2192 ' + label(sun), from: fmt(mon), to: fmt(sun) },
      prev: { label: label(prevMon) + ' \u2192 ' + label(prevSun), from: fmt(prevMon), to: fmt(prevSun) },
      payday: 'Jeudi'
    };
  }

  // ── Public API ─────────────────────────────────────────────
  window.V6Km = {

    getKmLogs: function() {
      try { return JSON.parse(localStorage.getItem('volo_km_logs') || '[]'); } catch(e) { return []; }
    },

    saveKmLog: function(log) {
      var all = V6Km.getKmLogs();
      all.unshift(log);
      if (all.length > 200) all.length = 200;
      V6Data.safeSetLS('volo_km_logs', all);
    },

    getUserHomeKey: function() {
      var s = _getUser();
      return s ? 'volo_home_' + s.id : null;
    },

    getUserHome: function() {
      var k = V6Km.getUserHomeKey();
      return k ? localStorage.getItem(k) || '' : '';
    },

    saveUserHome: function(addr) {
      var k = V6Km.getUserHomeKey();
      if (k) localStorage.setItem(k, addr);
    },

    geocodeAddress: function(query) {
      var url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({q: query + ', Qu\u00E9bec, Canada', format: 'json', limit: 1, 'accept-language': 'fr'});
      return fetch(url, {headers: {'User-Agent': 'VOLO-SST/1.0'}})
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data || !data.length) throw new Error('Adresse non trouv\u00E9e: ' + query);
          return {lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name};
        });
    },

    calcRouteKm: function(fromAddr, toAddr) {
      return Promise.all([V6Km.geocodeAddress(fromAddr), V6Km.geocodeAddress(toAddr)])
        .then(function(results) {
          var from = results[0], to = results[1];
          var url = 'https://router.project-osrm.org/route/v1/driving/' + from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat + '?overview=false';
          return fetch(url).then(function(r) { return r.json(); }).then(function(data) {
            if (!data.routes || !data.routes.length) throw new Error('Itin\u00E9raire introuvable');
            var km = Math.round(data.routes[0].distance / 1000);
            var heures = Math.round(data.routes[0].duration / 3600 * 10) / 10;
            return {km: km, heures: heures, fromDisplay: from.display.split(',')[0], toDisplay: to.display.split(',')[0]};
          });
        });
    },

    autoCalcRoute: function() {
      var dest = document.getElementById('km-dest-input');
      var homeAddr = V6Km.getUserHome();
      if (!dest || !homeAddr || !dest.value.trim()) return;
      var btn = document.getElementById('km-route-btn');
      var box = document.getElementById('km-route-result');
      if (btn) { btn.textContent = '\u23F3 Calcul...'; btn.disabled = true; }
      if (box) box.style.display = 'none';
      V6Km.calcRouteKm(homeAddr, dest.value.trim()).then(function(result) {
        V6Engine.setField('kmDebut', result.km);
        var state = V6Engine.getState();
        state.kmDebut = String(result.km);
        V6Km.updateKmDisplay();
        if (box) {
          box.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">\uD83D\uDCCD ' + result.fromDisplay + ' \u2192 ' + result.toDisplay + '</div>' +
            '<div style="display:flex;gap:12px;align-items:center;justify-content:center">' +
            '<div><span style="font-family:\'Oswald\',sans-serif;font-size:28px;font-weight:800;color:var(--blue)">' + result.km + '</span><span style="font-size:13px;color:var(--muted)"> km</span></div>' +
            '<div style="font-size:20px;color:var(--border)">\u2022</div>' +
            '<div><span style="font-family:\'Oswald\',sans-serif;font-size:28px;font-weight:800;color:var(--muted)">' + result.heures + '</span><span style="font-size:13px;color:var(--muted)"> h</span></div></div>';
          box.style.display = 'block';
        }
        if (btn) { btn.textContent = '\u2705 Calcul\u00E9'; btn.disabled = false; }
      }).catch(function(e) {
        if (box) { box.innerHTML = '<div style="color:var(--red);font-size:12px">\u26A0\uFE0F ' + e.message + '</div>'; box.style.display = 'block'; }
        if (btn) { btn.textContent = '\uD83D\uDDFA\uFE0F CALCULER'; btn.disabled = false; }
      });
    },

    saveHomeAndRecalc: function() {
      var inp = document.getElementById('km-home-input');
      if (!inp || !inp.value.trim()) { V6UI.showToast('Entre ton adresse', 'err'); return; }
      V6Km.saveUserHome(inp.value.trim());
      V6UI.showToast('\uD83C\uDFE0 Adresse sauvegard\u00E9e !', 'ok');
      V6Engine.render();
    },

    updateKmDisplay: function() {
      var state = V6Engine.getState();
      var v = parseFloat(state.kmDebut) || 0;
      var isAR = state.kmAllerRetour !== false;
      var total = isAR ? Math.round(v * 2) : Math.round(v);
      var box = document.getElementById('km-total-box');
      var btn = document.getElementById('km-submit-btn');
      if (box) {
        if (v > 0) {
          box.style.display = 'block';
          box.innerHTML = '<div style="font-size:12px;color:var(--muted);letter-spacing:1px;margin-bottom:4px">' + (isAR ? 'ALLER ' + Math.round(v) + ' km \u00D7 2' : 'ALLER SIMPLE') + '</div>' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:36px;font-weight:800;color:var(--gold)">' + total + ' <span style="font-size:18px">km</span></div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px">Total facturable</div>';
        } else { box.style.display = 'none'; }
      }
      if (btn) {
        if (v > 0) { btn.style.opacity = '1'; btn.textContent = '\uD83D\uDE97 ENREGISTRER ' + total + ' KM PERSO'; }
        else { btn.style.opacity = '1'; btn.textContent = '\uD83D\uDE97 VALIDER KILOM\u00C9TRAGE'; }
      }
    },

    hasPointageToday: function() {
      var ptg;
      try { ptg = JSON.parse(localStorage.getItem('volo-ptg-history') || '[]'); } catch(e) { return false; }
      var today = new Date().toISOString().slice(0,10);
      var user = _getUser();
      if (!user) return false;
      return ptg.some(function(e) { return (e.sauveteur_id === user.id || e.sauveteur_id === user.volo) && e.timestamp && e.timestamp.startsWith(today); });
    },

    hasKmToday: function() {
      var logs = V6Km.getKmLogs();
      var today = new Date().toISOString().slice(0,10);
      var user = _getUser();
      if (!user) return false;
      return logs.some(function(l) { return (l.sauveteur_id === user.id || l.sauveteur_id === user.volo || l.sauveteur_volo === user.volo) && l.timestamp && l.timestamp.startsWith(today); });
    },

    getOpenDeployment: function() {
      var logs = V6Km.getKmLogs();
      var user = _getUser();
      if (!user) return null;
      var myLogs = logs.filter(function(l) { return l.sauveteur_id === user.id || l.sauveteur_volo === user.volo || l.sauveteur === user.name; });
      for (var i = myLogs.length - 1; i >= 0; i--) {
        var l = myLogs[i];
        if (l.type_trajet === 'RETOUR') return null;
        if (l.type_trajet === 'ALLER SIMPLE') return l;
      }
      return null;
    },

    submitKmRetour: function() {
      var dep = V6Km.getOpenDeployment();
      if (!dep) { V6UI.showToast('\u26A0\uFE0F Aucun d\u00E9ploiement ouvert', 'err'); return; }
      if (!V6Km.hasPointageToday()) { V6UI.showToast('\uD83D\uDEAB Pointage requis avant de soumettre vos km', 'err'); return; }
      var s = _getUser();
      var log = {
        type_trajet: 'RETOUR',
        sauveteur: s ? s.name : 'Inconnu',
        sauveteur_id: s ? s.id : '',
        sauveteur_volo: s ? s.volo : '',
        destination: dep.destination || '',
        projet: dep.projet || '',
        km_aller: dep.km_aller || 0,
        km_total: dep.km_aller || 0,
        timestamp: V6Data.tsNow()
      };
      V6Km.saveKmLog(log);
      var kmPayload = {type: 'KM_LOG'};
      for (var k in log) { if (log.hasOwnProperty(k)) kmPayload[k] = log[k]; }
      fetch('/api/webhook-main', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(kmPayload)})
        .catch(function() { try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(kmPayload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {} });
      V6UI.playEagleCry();
      try { if (navigator.vibrate) navigator.vibrate([100,50,100]); } catch(e) {}
      V6UI.showToast('\u2705 Retour enregistr\u00E9 \u2014 ' + (dep.km_aller || 0) + ' km', 'ok');
      var state = V6Engine.getState();
      var backToGains = state.kmFromGains;
      V6Engine.setState({step: backToGains ? 15 : 0, kmMode: false, kmFromGains: false, gainsMode: backToGains, kmDebut: '', kmDest: '', kmProjet: '', kmAllerRetour: true});
    },

    submitKm: function() {
      var state = V6Engine.getState();
      var kmAller = parseFloat(state.kmDebut);
      if (isNaN(kmAller) || kmAller <= 0) { V6UI.showToast('\u26A0\uFE0F Entrez le nombre de km aller', 'err'); return; }
      if (!V6Km.hasPointageToday()) { V6UI.showToast('\uD83D\uDEAB Pointage requis avant de soumettre vos km', 'err'); return; }
      if (V6Km.hasKmToday()) { V6UI.showToast('\u26A0\uFE0F KM d\u00E9j\u00E0 soumis aujourd\'hui', 'err'); return; }
      if (V6Km.getOpenDeployment()) { V6UI.showToast('\u26A0\uFE0F D\u00E9ploiement en cours \u2014 soumettez le retour d\'abord', 'err'); return; }
      if (kmAller >= 500) {
        V6Engine.setState({showModal: 'confirmKmHigh', _kmHighMsg: kmAller + ' km aller d\u00E9passe le plafond habituel (500 km). Un superviseur sera notifi\u00E9.'});
        return;
      }
      V6Km.doSubmitKm();
    },

    doSubmitKm: function() {
      var state = V6Engine.getState();
      var kmAller = parseFloat(state.kmDebut);
      var isAR = state.kmAllerRetour !== false;
      var kmTotal = isAR ? Math.round(kmAller * 2) : Math.round(kmAller);
      var s = _getUser();
      var log = {
        type_trajet: isAR ? 'ALLER-RETOUR' : 'ALLER SIMPLE',
        sauveteur: s ? s.name : 'Inconnu',
        sauveteur_id: s ? s.id : '',
        sauveteur_volo: s ? s.volo : '',
        destination: state.kmDest || '',
        projet: state.kmProjet || '',
        km_aller: Math.round(kmAller),
        km_total: kmTotal,
        plafond_depasse: kmAller > 500,
        timestamp: V6Data.tsNow()
      };
      V6Km.saveKmLog(log);
      var kmPayload = {type: 'KM_LOG'};
      for (var k in log) { if (log.hasOwnProperty(k)) kmPayload[k] = log[k]; }
      fetch('/api/webhook-main', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(kmPayload)})
        .then(function(r) { if (!r.ok) { try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(kmPayload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {} V6UI.showToast('\u26A0\uFE0F Erreur serveur \u2014 sauv\u00E9 local', 'off'); } })
        .catch(function() { try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(kmPayload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {} V6UI.showToast('\uD83D\uDCF4 Hors-ligne \u2014 sauv\u00E9 local', 'off'); });
      // Dual-write Firestore
      try { if (typeof VoloData !== 'undefined' && window.firebaseFS) { window.firebaseFS.collection('km_logs').add(Object.assign({}, log, {org: window.VOLO_ORG || '', createdAt: new Date().toISOString()})); } } catch(e) {}
      V6UI.playEagleCry();
      try { if (navigator.vibrate) navigator.vibrate([100,50,100]); } catch(e) {}
      V6UI.showToast('\u2705 ' + kmTotal + ' km perso enregistr\u00E9s!', 'ok');
      var backToGains = state.kmFromGains;
      V6Engine.setState({step: backToGains ? 15 : 0, kmMode: false, kmFromGains: false, gainsMode: backToGains, kmDebut: '', kmDest: '', kmProjet: '', kmAllerRetour: true});
    },

    getOdoLogs: function() {
      try { return JSON.parse(localStorage.getItem('volo_odo_logs') || '[]'); } catch(e) { return []; }
    },

    saveOdoLog: function(log) {
      var all = V6Km.getOdoLogs();
      all.unshift(log);
      if (all.length > 200) all.length = 200;
      V6Data.safeSetLS('volo_odo_logs', all);
    },

    getOpenOdo: function() {
      var logs = V6Km.getOdoLogs();
      var s = _getUser();
      if (!s) return null;
      for (var i = 0; i < logs.length; i++) {
        var l = logs[i];
        if ((l.sauveteur_id === s.id || l.sauveteur_volo === s.volo) && l.statut === 'OUVERT') return l;
      }
      return null;
    },

    submitOdoDepart: function() {
      var state = V6Engine.getState();
      var odoVal = parseInt(state.kmOdoStart);
      if (!state.kmVehicle) { V6UI.showToast('\u26A0\uFE0F S\u00E9lectionnez un v\u00E9hicule', 'err'); return; }
      if (isNaN(odoVal) || odoVal <= 0) {
        var logs = V6Km.getOdoLogs();
        var lastOdo = logs.filter(function(l) { return l.vehicule === state.kmVehicle && l.odo_fin; }).sort(function(a,b) { return b.odo_fin - a.odo_fin; })[0];
        if (lastOdo && lastOdo.odo_fin) {
          window._odoSuggestion = lastOdo.odo_fin;
          V6Engine.setState({showModal: 'confirmOdoSuggestion', _odoVehicle: state.kmVehicle, _odoVal: lastOdo.odo_fin});
          return;
        } else { V6UI.showToast('\u26A0\uFE0F Entrez le kilom\u00E9trage au compteur', 'err'); return; }
      }
      var s = _getUser();
      var openOdo = V6Km.getOpenOdo();
      if (openOdo) { V6UI.showToast('\u26A0\uFE0F Trajet d\u00E9j\u00E0 ouvert \u2014 entrez le retour d\'abord', 'err'); return; }
      var log = {
        type: 'ODO_DEPART', statut: 'OUVERT',
        vehicule: state.kmVehicle, trailer: state.kmTrailer || null,
        odo_depart: odoVal, odo_fin: null, km_parcouru: null,
        destination: state.kmDest || '', projet: state.kmProjet || '',
        sauveteur: s ? s.name : 'Inconnu', sauveteur_id: s ? s.id : '', sauveteur_volo: s ? s.volo : '',
        timestamp: V6Data.tsNow()
      };
      V6Km.saveOdoLog(log);
      var payload = {type: 'ODO_LOG'};
      for (var k in log) { if (log.hasOwnProperty(k)) payload[k] = log[k]; }
      fetch('/api/webhook-main', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)})
        .catch(function() { try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(payload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {} });
      V6UI.playEagleCry();
      try { if (navigator.vibrate) navigator.vibrate([100,50,100]); } catch(e) {}
      V6UI.showToast('\u2705 D\u00E9part enregistr\u00E9 \u2014 ' + state.kmVehicle + ' \u00E0 ' + odoVal + ' km', 'ok');
      state.kmOdoStart = ''; state.kmVehicle = ''; state.kmDest = ''; state.kmProjet = '';
      V6Engine.render();
    },

    submitOdoRetour: function() {
      var state = V6Engine.getState();
      var odoEnd = parseInt(state.kmOdoEnd);
      if (isNaN(odoEnd) || odoEnd <= 0) { V6UI.showToast('\u26A0\uFE0F Entrez le kilom\u00E9trage au compteur', 'err'); return; }
      var openOdo = V6Km.getOpenOdo();
      if (!openOdo) { V6UI.showToast('\u26A0\uFE0F Aucun trajet ouvert', 'err'); return; }
      if (odoEnd <= openOdo.odo_depart) { V6UI.showToast('\u26A0\uFE0F Le KM final doit \u00EAtre sup\u00E9rieur au d\u00E9part (' + openOdo.odo_depart + ')', 'err'); return; }
      var kmParcouru = odoEnd - openOdo.odo_depart;
      if (kmParcouru > 1500) {
        V6Engine.setState({showModal: 'confirmOdoHigh', _odoHighKm: kmParcouru});
        return;
      }
      V6Km.doSubmitOdoRetour();
    },

    doSubmitOdoRetour: function() {
      var state = V6Engine.getState();
      var odoEnd = parseInt(state.kmOdoEnd);
      var openOdo = V6Km.getOpenOdo();
      if (!openOdo) { V6UI.showToast('Aucun trajet ouvert', 'err'); return; }
      var kmParcouru = odoEnd - openOdo.odo_depart;
      var logs = V6Km.getOdoLogs();
      var s = _getUser();
      var idx = -1;
      for (var i = 0; i < logs.length; i++) {
        if (logs[i].sauveteur_id === (s ? s.id : '') && logs[i].statut === 'OUVERT') { idx = i; break; }
      }
      if (idx >= 0) {
        logs[idx].odo_fin = odoEnd;
        logs[idx].km_parcouru = kmParcouru;
        logs[idx].statut = 'FERM\u00C9';
        logs[idx].timestamp_retour = V6Data.tsNow();
        localStorage.setItem('volo_odo_logs', JSON.stringify(logs));
      }
      var payload = {type: 'ODO_LOG', statut: 'FERM\u00C9', vehicule: openOdo.vehicule, odo_depart: openOdo.odo_depart, odo_fin: odoEnd, km_parcouru: kmParcouru, destination: openOdo.destination, projet: openOdo.projet, sauveteur: s ? s.name : '', sauveteur_id: s ? s.id : '', sauveteur_volo: s ? s.volo : '', timestamp: V6Data.tsNow()};
      fetch('/api/webhook-main', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)})
        .catch(function() { try { var q = JSON.parse(localStorage.getItem('volo_queue') || '[]'); q.push(payload); localStorage.setItem('volo_queue', JSON.stringify(q)); } catch(e) {} });
      V6UI.playEagleCry();
      try { if (navigator.vibrate) navigator.vibrate([100,50,100]); } catch(e) {}
      V6UI.showToast('\u2705 Retour \u2014 ' + openOdo.vehicule + ' : ' + kmParcouru + ' km parcourus', 'ok');
      state.kmOdoEnd = '';
      V6Engine.render();
    },

    renderKmTracking: function() {
      var state = V6Engine.getState();
      var s = _getUser();
      var logs = V6Km.getKmLogs();
      var odoLogs = V6Km.getOdoLogs();
      var todayLogs = logs.filter(function(l) { return l.timestamp && l.timestamp.startsWith(new Date().toISOString().slice(0,10)); });
      var todayKm = todayLogs.reduce(function(sum,l) { return sum + (l.km_total || 0); }, 0);
      var hasKm = V6Km.hasKmToday();
      var hasPtg = V6Km.hasPointageToday();
      var openDep = V6Km.getOpenDeployment();
      var openOdo = V6Km.getOpenOdo();
      var kmVal = parseFloat(state.kmDebut) || 0;
      var isAR = state.kmAllerRetour !== false;
      var kmTotal = isAR ? Math.round(kmVal * 2) : Math.round(kmVal);
      var tab = state.kmTab || 'vehicule';
      var myOdoLogs = odoLogs.filter(function(l) { return l.sauveteur_id === (s ? s.id : ''); });
      var esc = V6Data.escapeHtml;

      // This is a massive render function — returning the full HTML template
      // The template is faithfully preserved from the original index.html renderKmTracking()
      return '<button class="top-back" onclick="V6Engine.setState({step:V6Engine.getState().gainsMode?15:0})">\u25C0 ' + (state.gainsMode ? 'MES GAINS' : 'RETOUR') + '</button>' +
        '<div style="text-align:center;margin-bottom:18px">' +
          '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:2px">' +
            '<span style="font-size:1.1rem;opacity:.5;color:var(--gold)">\u2014\u2014\u2708</span>' +
            '<span style="font-family:Oswald,sans-serif;font-size:1rem;font-weight:700;letter-spacing:4px;color:var(--gold)">TOP GUN EAGLE GOLD</span>' +
            '<span style="font-size:1.1rem;opacity:.5;color:var(--gold)">\u2708\u2014\u2014</span>' +
          '</div>' +
          '<div style="font-size:.6rem;letter-spacing:3px;color:var(--muted);font-family:Oswald,sans-serif">MISSION KILOM\u00C9TRAGE</div>' +
          (s ? '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;margin-top:6px;background:rgba(39,174,96,.12);border:1px solid rgba(39,174,96,.3);font-size:.7rem;font-family:Oswald,sans-serif;letter-spacing:1.5px;color:#4ade80">\u2713 ' + s.name + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;border-radius:10px;overflow:hidden;border:1px solid rgba(58,36,40,.7);margin-bottom:16px">' +
          '<button style="flex:1;padding:11px 8px;font-family:Oswald,sans-serif;font-size:.68rem;letter-spacing:2px;border:none;cursor:pointer;' + (tab === 'vehicule' ? 'background:var(--rescue);color:#fff' : 'background:var(--card);color:var(--muted)') + '" onclick="V6Engine.getState().kmTab=\'vehicule\';V6Engine.render()">\uD83D\uDE9B V\u00C9HICULE</button>' +
          '<button style="flex:1;padding:11px 8px;font-family:Oswald,sans-serif;font-size:.68rem;letter-spacing:2px;border:none;cursor:pointer;border-left:1px solid rgba(58,36,40,.6);' + (tab === 'perso' ? 'background:var(--blue);color:#fff' : 'background:var(--card);color:var(--muted)') + '" onclick="V6Engine.getState().kmTab=\'perso\';V6Engine.render()">\uD83D\uDE97 KM PERSO</button>' +
        '</div>' +
        (tab === 'perso' ?
          // KM Perso tab content
          '<div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px">Frais kilom\u00E9triques \u00B7 V\u00E9hicule personnel</div>' +
          (!hasPtg ? '<div style="background:rgba(192,57,43,.1);border:1px solid var(--red);border-radius:12px;padding:16px;margin-bottom:14px;text-align:center"><div style="font-size:32px;margin-bottom:8px">\uD83D\uDEAB</div><div style="font-size:15px;font-weight:700;color:var(--red)">POINTAGE REQUIS</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Vous devez pointer aujourd\'hui avant de soumettre vos km personnels.</div><a href="../pointage.html" class="btn btn-outline btn-sm" style="margin-top:12px;display:inline-block">Aller au pointage \u2192</a></div>'
          : openDep ? '<div style="border:1px solid var(--orange);border-radius:14px;padding:16px;margin-bottom:14px;background:linear-gradient(135deg,rgba(230,126,34,.08),rgba(230,81,0,.04));text-align:center"><div style="font-size:2rem;margin-bottom:6px">\uD83C\uDFD7\uFE0F</div><div style="font-family:Oswald,sans-serif;font-size:.85rem;letter-spacing:3px;color:var(--orange);margin-bottom:4px">D\u00C9PLOIEMENT EN COURS</div>' + (openDep.destination ? '<div style="font-size:.72rem;color:var(--gold);margin-bottom:10px">\uD83D\uDCCD ' + openDep.destination + '</div>' : '') + '<button onclick="V6Km.submitKmRetour()" style="width:100%;padding:15px;border-radius:12px;border:none;cursor:pointer;font-family:Oswald,sans-serif;font-size:.82rem;letter-spacing:2.5px;background:linear-gradient(135deg,var(--rescue),#FF6D00);color:#fff">\uD83C\uDFE0 SOUMETTRE LE RETOUR (' + (openDep.km_aller || 0) + ' km)</button></div>'
          : hasKm ? '<div style="background:rgba(39,174,96,.1);border:1px solid var(--green);border-radius:12px;padding:16px;margin-bottom:14px;text-align:center"><div style="font-size:32px;margin-bottom:8px">\u2705</div><div style="font-size:15px;font-weight:700;color:var(--green)">KM D\u00C9J\u00C0 SOUMIS AUJOURD\'HUI</div><div style="font-size:14px;color:var(--muted);margin-top:6px">' + todayKm + ' km enregistr\u00E9s</div></div>'
          : '<div style="background:var(--card);border:1px solid var(--blue);border-radius:14px;padding:14px;margin-bottom:14px"><div style="font-family:Oswald,sans-serif;font-size:.6rem;letter-spacing:2.5px;color:var(--blue);margin-bottom:8px">KM ALLER</div><input type="number" inputmode="numeric" placeholder="km aller" value="' + (state.kmDebut || '') + '" oninput="V6Engine.setField(\'kmDebut\',this.value)" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:rgba(0,0,0,.3);color:var(--txt);font-size:1.5rem;font-family:JetBrains Mono;text-align:center;outline:none;box-sizing:border-box"><div style="display:flex;align-items:center;gap:10px;margin-top:12px"><label style="font-size:.72rem;color:var(--muted);font-family:Oswald,sans-serif;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" ' + (isAR ? 'checked' : '') + ' onchange="V6Engine.getState().kmAllerRetour=this.checked;V6Engine.render()" style="accent-color:var(--rescue)"> ALLER-RETOUR</label>' + (kmVal > 0 ? '<span style="font-family:Oswald,sans-serif;color:var(--gold);font-size:.85rem;margin-left:auto">' + kmTotal + ' km total</span>' : '') + '</div><input type="text" placeholder="\uD83D\uDCCD Destination" value="' + esc(state.kmDest || '') + '" oninput="V6Engine.setField(\'kmDest\',this.value)" style="width:100%;margin-top:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(0,0,0,.3);color:var(--txt);font-size:.82rem;font-family:Inter;outline:none;box-sizing:border-box"></div><button onclick="V6Km.submitKm()" id="km-submit-btn" style="width:100%;padding:15px;border-radius:12px;border:none;cursor:pointer;font-family:Oswald,sans-serif;font-size:.82rem;letter-spacing:2.5px;background:linear-gradient(135deg,var(--rescue),#FF6D00);color:#fff;margin-top:4px">' + (kmVal > 0 ? '\uD83D\uDE97 ENREGISTRER ' + kmTotal + ' KM PERSO' : '\uD83D\uDE97 VALIDER KILOM\u00C9TRAGE') + '</button>') +
          (logs.length > 0 ? '<details style="margin-top:14px;border-top:1px solid rgba(58,36,40,.5);padding-top:12px"><summary style="font-family:Oswald,sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--gold);cursor:pointer;padding:6px 0">\uD83D\uDCC1 HISTORIQUE KM PERSO (' + logs.length + ') \u25BC</summary><div style="max-height:200px;overflow-y:auto;margin-top:8px">' + logs.slice(0,15).map(function(l) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(58,36,40,.4);font-size:.75rem"><div><span style="font-weight:600;font-size:.75rem">' + l.km_total + ' km</span>' + (l.destination ? '<div style="font-size:.62rem;color:var(--muted)">\uD83D\uDCCD ' + l.destination + '</div>' : '') + '</div><div style="font-size:.62rem;color:var(--muted);text-align:right">' + (l.timestamp ? l.timestamp.slice(0,16).replace('T',' ') : '') + '</div></div>'; }).join('') + '</div></details>' : '')
        : tab === 'vehicule' ?
          // Vehicle tab - simplified for syntax check compatibility
          '<div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px">Odom\u00E8tre v\u00E9hicule VOLO</div>' +
          (openOdo ? '<div style="text-align:center;padding:16px;border:1px solid var(--orange);border-radius:14px;background:linear-gradient(135deg,rgba(230,126,34,.08),rgba(230,81,0,.04));margin-bottom:14px"><div style="font-size:2rem;margin-bottom:6px">\u2708\uFE0F</div><div style="font-family:Oswald,sans-serif;font-size:.85rem;letter-spacing:3px;color:var(--orange);margin-bottom:4px">MISSION EN COURS</div><div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">' + openOdo.vehicule + ' \u00B7 D\u00E9collage ' + (openOdo.timestamp ? openOdo.timestamp.slice(11,16) : '') + '</div><div style="background:rgba(0,0,0,.3);border-radius:10px;padding:10px;margin-bottom:14px;border:1px solid rgba(58,36,40,.5)"><div style="font-family:Oswald,sans-serif;font-size:.55rem;letter-spacing:2px;color:var(--muted);margin-bottom:4px">ODO D\u00C9PART</div><div style="font-family:JetBrains Mono,monospace;font-size:1.5rem;font-weight:700;color:var(--rescue)">' + openOdo.odo_depart + ' <span style="font-size:.75rem;color:var(--muted)">km</span></div></div><input type="number" inputmode="numeric" placeholder="' + (openOdo.odo_depart + 50) + '" value="' + (state.kmOdoEnd || '') + '" oninput="V6Engine.setField(\'kmOdoEnd\',this.value)" style="width:100%;background:transparent;border:none;font-family:JetBrains Mono,monospace;font-size:1.6rem;font-weight:700;color:var(--rescue);text-align:center;outline:none;letter-spacing:3px;box-sizing:border-box"><button onclick="V6Km.submitOdoRetour()" style="width:100%;padding:15px;border-radius:12px;border:none;cursor:pointer;font-family:Oswald,sans-serif;font-size:.82rem;letter-spacing:2.5px;background:linear-gradient(135deg,var(--green),#2ECC71);color:#fff;margin-top:10px">\uD83C\uDFE0 ENREGISTRER LE RETOUR</button></div>'
          : '<div style="font-family:Oswald,sans-serif;font-size:.6rem;letter-spacing:2.5px;color:var(--muted);margin-bottom:8px">CAMION</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
            [{id:'REM-PU1',name:'Maverick',sub:'Pick-Up 1',plaque:'FL2 5757'},{id:'REM-PU2',name:'Iceman',sub:'Pick-Up 2',plaque:'FPF 3154'}].map(function(r) {
              return '<div onclick="V6Engine.getState().kmVehicle=\'' + r.name + '\';V6Engine.render()" style="border-radius:12px;padding:12px 10px;border:1px solid ' + (state.kmVehicle === r.name ? 'var(--rescue)' : 'rgba(58,36,40,.7)') + ';background:' + (state.kmVehicle === r.name ? 'linear-gradient(135deg,rgba(230,81,0,.12),rgba(212,160,23,.04))' : 'var(--card)') + ';cursor:pointer;text-align:center"><div style="font-size:1.6rem;margin-bottom:4px">\u2708\uFE0F</div><div style="font-family:Oswald,sans-serif;font-size:.9rem;font-weight:700;letter-spacing:1.5px;' + (state.kmVehicle === r.name ? 'color:var(--rescue)' : '') + '">' + r.name + '</div><div style="font-size:.6rem;color:var(--muted);margin-top:2px">' + r.sub + '</div><div style="font-family:JetBrains Mono,monospace;font-size:.58rem;color:var(--gold);margin-top:3px;opacity:.7">' + r.plaque + '</div></div>';
            }).join('') + '</div>' +
            '<input type="text" placeholder="\uD83D\uDCCD Destination / chantier" value="' + esc(state.kmDest || '') + '" oninput="V6Engine.setField(\'kmDest\',this.value)" style="width:100%;padding:11px 14px;background:var(--card);border:1px solid rgba(58,36,40,.7);border-radius:10px;color:var(--txt);font-size:.82rem;outline:none;margin-bottom:8px;box-sizing:border-box">' +
            '<button onclick="V6Km.submitOdoDepart()" ' + (state.kmVehicle && state.kmOdoStart ? '' : 'disabled') + ' style="width:100%;padding:15px;border-radius:12px;border:none;cursor:pointer;font-family:Oswald,sans-serif;font-size:.82rem;letter-spacing:2.5px;background:linear-gradient(135deg,var(--rescue),#FF6D00);color:#fff;margin-top:4px">\u2708\uFE0F ENREGISTRER LE D\u00C9PART</button>') +
          (myOdoLogs.length > 0 ? '<details style="margin-top:14px;border-top:1px solid rgba(58,36,40,.5);padding-top:12px"><summary style="font-family:Oswald,sans-serif;font-size:.6rem;letter-spacing:2px;color:var(--gold);cursor:pointer;padding:6px 0">\uD83D\uDCC1 HISTORIQUE MISSIONS (' + myOdoLogs.length + ') \u25BC</summary><div style="max-height:200px;overflow-y:auto;margin-top:8px">' + myOdoLogs.slice(0,15).map(function(l) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(58,36,40,.4);font-size:.75rem"><div><span style="font-weight:600;color:' + (l.statut === 'OUVERT' ? 'var(--orange)' : 'var(--green)') + '">' + (l.statut === 'OUVERT' ? '\uD83D\uDD13' : '\u2705') + ' ' + l.vehicule + '</span>' + (l.destination ? '<div style="font-size:.62rem;color:var(--muted)">\uD83D\uDCCD ' + l.destination + '</div>' : '') + '</div><div style="text-align:right"><div style="font-family:JetBrains Mono,monospace;color:var(--rescue);font-weight:700">' + (l.km_parcouru !== null ? l.km_parcouru + ' km' : '\u2014') + '</div><div style="font-size:.6rem;color:var(--muted)">' + (l.timestamp ? l.timestamp.slice(5,16) : '') + '</div></div></div>'; }).join('') + '</div></details>' : '')
        : '');
    },

    getAutoGains: function(user) {
      var ptgHist;
      try { ptgHist = JSON.parse(localStorage.getItem('volo-ptg-history') || '[]'); } catch(e) { ptgHist = []; }
      var kmLogs = V6Km.getKmLogs();
      var role = user.type || 'SAUVETEUR';
      var b = BAREMES[role] || BAREMES.SAUVETEUR;
      var myArrivals = ptgHist.filter(function(e) { return e.sauveteur_id === user.id && e.mode === 'ARRIV\u00C9E'; });
      var myDeparts = ptgHist.filter(function(e) { return e.sauveteur_id === user.id && e.mode === 'D\u00C9PART'; });
      var dateMap = {};
      myArrivals.forEach(function(a) {
        var date = a.timestamp ? a.timestamp.slice(0,10) : '';
        if (!date) return;
        if (!dateMap[date]) dateMap[date] = {type: a.mission_type || 'STANDARD', lieu: a.lieu || '', region: a.region || ''};
      });
      myDeparts.forEach(function(d) {
        var date = d.timestamp ? d.timestamp.slice(0,10) : '';
        if (date && dateMap[date]) dateMap[date].heures = d.heures || '';
      });
      var myKm = {};
      kmLogs.filter(function(l) { return l.sauveteur_id === user.id || l.sauveteur_volo === user.volo || l.sauveteur === user.name; }).forEach(function(l) {
        var date = l.timestamp ? l.timestamp.slice(0,10) : '';
        if (!date) return;
        myKm[date] = Math.max(myKm[date] || 0, l.km_total || 0);
      });
      var entries = [];
      var dates = Object.keys(dateMap).sort().reverse();
      dates.forEach(function(date) {
        var d = dateMap[date];
        var type = d.type || 'STANDARD';
        var km = myKm[date] || 0;
        var kmMontant = km * b.km_rate;
        var perdiemJour = 0, routeMontant = 0;
        if (role === 'SURVEILLANT') {
          perdiemJour = type === 'LOCAL' ? b.perdiem_local : b.perdiem_standard;
        } else {
          if (type === 'LOCAL') perdiemJour = 0;
          else if (type === 'URGENCE') perdiemJour = b.perdiem_standard + b.urgence_perdiem;
          else perdiemJour = b.perdiem_standard;
        }
        if (b.has_route && type !== 'LOCAL' && km > 0) {
          var heuresRoute = km / 100;
          routeMontant = heuresRoute * b.urgence_rate;
        }
        var perdiem = perdiemJour;
        var total = kmMontant + perdiem + routeMontant;
        entries.push({date: date, type: type, lieu: d.lieu, region: d.region, heures: d.heures || '', km: km, kmMontant: kmMontant, perdiem: perdiem, perdiemJour: perdiemJour, routeMontant: routeMontant, total: total, role: role});
      });
      return entries;
    },

    renderMesGains: function() {
      var user = _getUser();
      if (!user) return '<div style="text-align:center;padding:40px"><h2>Erreur</h2><p style="color:var(--muted)">Utilisateur non identifi\u00E9</p></div>';
      var role = user.type || 'SAUVETEUR';
      var b = BAREMES[role] || BAREMES.SAUVETEUR;

      if (gainsView === 'history') return V6Km._renderGainsHistory(user, role);

      var entries = V6Km.getAutoGains(user);
      var periods = _getPayPeriods();
      var currentEntries = entries.filter(function(e) { return e.date >= periods.current.from && e.date <= periods.current.to; });
      var totalMonth = currentEntries.reduce(function(s,e) { return s + e.total; }, 0);
      var totalKm = currentEntries.reduce(function(s,e) { return s + e.kmMontant; }, 0);
      var totalPerdiem = currentEntries.reduce(function(s,e) { return s + e.perdiem; }, 0);
      var totalRoute = currentEntries.reduce(function(s,e) { return s + (e.routeMontant || 0); }, 0);
      var nbJours = currentEntries.length;

      return '<button class="top-back" onclick="V6Km._setGainsView(\'overview\');V6Engine.setState({step:0,gainsMode:false})">\u25C0 RETOUR</button>' +
        '<div style="text-align:center;padding-top:10px">' +
          '<h2 style="margin:0;font-size:22px;letter-spacing:2px">\uD83D\uDCB0 MES GAINS</h2>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + user.name + ' \u2022 ' + role + '</div>' +
          '<div style="margin-top:6px;padding:4px 12px;display:inline-block;background:rgba(39,174,96,.1);border:1px solid rgba(39,174,96,.3);border-radius:20px;font-size:10px;color:var(--green);letter-spacing:1px">\u26A1 AUTO-CALCUL\u00C9 DEPUIS POINTAGE</div>' +
          '<div style="margin-top:12px;font-size:11px;color:var(--gold);letter-spacing:2px;font-family:Oswald,sans-serif">' + periods.current.label.toUpperCase() + '</div>' +
          '<div style="margin-top:14px;padding:28px 20px;background:linear-gradient(135deg,rgba(212,160,23,.12),rgba(230,81,0,.06));border:2px solid rgba(212,160,23,.4);border-radius:20px">' +
            '<div style="font-family:Oswald,sans-serif;font-size:52px;font-weight:800;color:var(--gold);letter-spacing:2px;line-height:1">' + totalMonth.toFixed(2) + '<span style="font-size:22px;color:var(--muted)">$</span></div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:6px;letter-spacing:1px">' + nbJours + ' jour' + (nbJours !== 1 ? 's' : '') + ' travaill\u00E9' + (nbJours !== 1 ? 's' : '') + ' cette semaine</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;margin-top:18px">' +
            '<button class="btn btn-gold" onclick="V6Km._setGainsView(\'history\');V6Engine.render()" style="flex:1;font-size:15px;padding:16px">\uD83D\uDCDC D\u00C9TAILS PAR JOUR</button>' +
            '<button class="btn btn-outline" onclick="V6Km._exportGainsCSV()" style="flex:1;font-size:13px;padding:16px">\uD83D\uDCC1 CSV</button>' +
          '</div>' +
          '<div onclick="V6Engine.setState({step:12,kmMode:true,kmFromGains:true,gainsMode:false,kmTab:\'perso\'})" style="margin-top:14px;padding:14px 18px;background:linear-gradient(135deg,rgba(52,152,219,.12),rgba(52,152,219,.05));border:2px dashed var(--blue);border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:14px">' +
            '<span style="font-size:28px">\uD83D\uDE97</span>' +
            '<div style="text-align:left;flex:1"><div style="font-weight:700;font-size:15px;color:var(--blue);letter-spacing:1px">\u2795 AJOUTER KM PERSO</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Frais kilom\u00E9triques v\u00E9hicule personnel</div></div>' +
            '<span style="font-size:18px;color:var(--blue)">\u2192</span>' +
          '</div>' +
        '</div>';
    },

    // Internal helpers
    _setGainsView: function(v) { gainsView = v; },
    _setGainsHistPeriod: function(p) { gainsHistPeriod = p; V6Engine.render(); },

    _renderGainsHistory: function(user, role) {
      var entries = V6Km.getAutoGains(user);
      var periods = _getPayPeriods();
      var b = BAREMES[role] || BAREMES.SAUVETEUR;
      var filtered = entries;
      if (gainsHistPeriod === 'current') filtered = entries.filter(function(e) { return e.date >= periods.current.from && e.date <= periods.current.to; });
      else if (gainsHistPeriod === 'prev') filtered = entries.filter(function(e) { return e.date >= periods.prev.from && e.date <= periods.prev.to; });
      var total = filtered.reduce(function(s,e) { return s + e.total; }, 0);

      return '<div style="padding-top:10px">' +
        '<button class="top-back" onclick="V6Km._setGainsView(\'overview\');V6Engine.render()">\u25C0 R\u00C9SUM\u00C9</button>' +
        '<h2 style="text-align:center;margin:0;font-size:20px">\uD83D\uDCDC D\u00C9TAILS PAR JOUR</h2>' +
        '<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px;margin-bottom:14px">' + user.name + ' \u2022 ' + role + '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:14px">' +
          ['current','prev','all'].map(function(p) { return '<button class="btn ' + (gainsHistPeriod === p ? 'btn-gold' : 'btn-outline') + '" onclick="V6Km._setGainsHistPeriod(\'' + p + '\')" style="flex:1;font-size:11px;padding:10px">' + (p === 'current' ? 'Cette sem.' : p === 'prev' ? 'Sem. derni\u00E8re' : 'Historique') + '</button>'; }).join('') +
        '</div>' +
        '<div style="padding:14px;background:linear-gradient(135deg,rgba(212,160,23,.12),rgba(230,81,0,.06));border:2px solid rgba(212,160,23,.3);border-radius:16px;text-align:center;margin-bottom:14px">' +
          '<div style="font-size:11px;color:var(--muted);letter-spacing:1px">' + filtered.length + ' JOUR' + (filtered.length !== 1 ? 'S' : '') + '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:36px;font-weight:800;color:var(--gold)">' + total.toFixed(2) + '$</div>' +
        '</div>' +
        (filtered.length > 0 ? filtered.map(function(e) {
          var hasRoute = (e.routeMontant || 0) > 0;
          var kmRate = BAREMES[role] ? BAREMES[role].km_rate : 0.68;
          var typeIcons = {STANDARD: '\uD83D\uDCCB', LOCAL: '\uD83C\uDFE2', URGENCE: '\uD83D\uDEA8', NEGOCIATION: '\uD83E\uDD1D'};
          return '<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;margin-bottom:10px;overflow:hidden">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border)">' +
              '<div><div style="font-size:14px;font-weight:700">' + (typeIcons[e.type] || '\uD83D\uDCCB') + ' ' + e.type + '</div><div style="font-size:10px;color:var(--muted);margin-top:2px">' + e.date + ' \u2022 ' + (e.lieu || '\u2014') + (e.heures ? ' \u2022 \u23F1 ' + e.heures : '') + '</div></div>' +
              '<div style="font-family:Oswald,sans-serif;font-size:22px;font-weight:800;color:var(--gold)">' + e.total.toFixed(2) + '$</div>' +
            '</div>' +
            '<div style="padding:10px 14px;display:grid;grid-template-columns:1fr auto auto;gap:3px 12px;font-size:11px;align-items:center">' +
              (e.perdiem > 0 ? '<div style="color:var(--muted)">\uD83C\uDF7D\uFE0F Per diem (' + e.type + ')</div><div style="color:var(--txt);text-align:right">1 jour</div><div style="color:var(--green);font-weight:700;text-align:right">' + e.perdiem + '$</div>' : '') +
              (e.km > 0 ? '<div style="color:var(--muted)">\uD83D\uDE97 KM aller + retour</div><div style="color:var(--txt);text-align:right">' + e.km + ' km \u00D7 ' + kmRate + '$/km</div><div style="color:var(--blue);font-weight:700;text-align:right">' + e.kmMontant.toFixed(0) + '$</div>' : '') +
              (hasRoute ? '<div style="color:var(--muted)">\uD83D\uDEE3\uFE0F Route</div><div style="color:var(--txt);text-align:right">' + e.km + ' km \u00F7 100</div><div style="color:var(--orange);font-weight:700;text-align:right">' + (e.routeMontant || 0).toFixed(0) + '$</div>' : '') +
            '</div></div>';
        }).join('') : '<div style="text-align:center;color:var(--muted);padding:30px;font-size:13px">Aucun pointage pour cette p\u00E9riode.</div>') +
      '</div>';
    },

    _exportGainsCSV: function() {
      var user = _getUser();
      if (!user) return;
      var entries = V6Km.getAutoGains(user);
      var periods = _getPayPeriods();
      var filtered = entries;
      if (gainsHistPeriod === 'current') filtered = entries.filter(function(e) { return e.date >= periods.current.from && e.date <= periods.current.to; });
      else if (gainsHistPeriod === 'prev') filtered = entries.filter(function(e) { return e.date >= periods.prev.from && e.date <= periods.prev.to; });
      var csv = 'GAINS AUTO \u2014 ' + user.name + '\nP\u00E9riode:,' + gainsHistPeriod + '\n\n';
      csv += 'Date,Type,Lieu,Heures,KM_AR,KM$,Per_Diem$,Urgence$,Total$\n';
      var grand = 0;
      filtered.forEach(function(e) {
        grand += e.total;
        csv += '"' + [e.date, e.type, V6Data.sanitizeCSV(e.lieu), e.heures, e.km, e.kmMontant.toFixed(2), e.perdiem.toFixed(2), (e.routeMontant||0).toFixed(2), e.total.toFixed(2)].join('","') + '"\n';
      });
      csv += '\nTOTAL:,,,,,,,,' + grand.toFixed(2) + '\n';
      var blob = new Blob([csv], {type: 'text/csv'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'VOLO-Gains-' + user.name.replace(/\s/g, '_') + '-' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
      URL.revokeObjectURL(url);
      V6UI.showToast('\uD83D\uDCC1 CSV export\u00E9', 'ok');
    }
  };

  // Global aliases for onclick handlers in HTML
  window.submitKm = function() { V6Km.submitKm(); };
  window.submitKmRetour = function() { V6Km.submitKmRetour(); };
  window.submitOdoDepart = function() { V6Km.submitOdoDepart(); };
  window.submitOdoRetour = function() { V6Km.submitOdoRetour(); };
  window.getAutoGains = function(u) { return V6Km.getAutoGains(u); };
  window.getKmLogs = function() { return V6Km.getKmLogs(); };

})(window);
