/**
 * @module v6-engine.js
 * @description Core wizard/state machine, Pick-On/Off flow, validation, transactions,
 *              caisse module, usage tracker, chat system
 * @version 6.0.0
 * @depends v6-auth.js (isUserChef, isUserSurv, resetLockTimer)
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS, getHistory, saveToHistory, appendAuditLog,
 *                              getActiveItems, getMyActivePickOns, getActiveDeployments, escapeHtml, tsNow, flushQueue)
 * @depends v6-scanner.js (startQrScanner, stopQrScanner)
 * @depends v6-ui.js (renderDashboard, renderHistory, renderWeatherWidget, renderChatFab, playEagleCry)
 * @depends v6-km.js (renderKmTracking, renderMesGains)
 * @depends v6-certs.js (renderFormation)
 * @depends v6-urgences.js (loadAnnouncement)
 * @depends data.js (ITEMS, PERSONNEL, CAISSES, DEPOTS, DESTINATIONS, REMORQUES, SAC_COLORS, COULEUR_HEX)
 */
(function(window) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var VOLO_WH_M = '/api/webhook-main';
  var VOLO_WH_U = '/api/webhook-urgence';
  var STOCK_WEBHOOK = '/api/webhook-stock';

  var STOCK_MANAGERS = ['maxime boisvert','cédric','cedric','danny alie','samuel','jonathan milone','yann-alexandre','yann alexandre','alex gendreau','alexandre gendreau'];

  var CHECKLIST_PICKON = [
    { id: 'etat',  label: 'Items v\u00E9rifi\u00E9s en bon \u00E9tat' },
    { id: 'epi',   label: 'EPI personnel v\u00E9rifi\u00E9s' }
  ];

  var CHECKLIST_PICKOFF = [
    { id: 'retour_etat',       label: '\u00C9tat du mat\u00E9riel v\u00E9rifi\u00E9 au retour' },
    { id: 'retour_complet',    label: 'Tous les items pr\u00E9sents' },
    { id: 'retour_propre',     label: 'Mat\u00E9riel nettoy\u00E9 / rang\u00E9' },
    { id: 'apria_o2',          label: '\uD83E\uDEC1 Bouteille O\u2082 APRIA v\u00E9rifi\u00E9e (pression + date)' },
    { id: 'apria_masque',      label: '\uD83D\uDE37 Masque APRIA fonctionnel + \u00E9tanche' },
    { id: 'anomalie',          label: '\u26A0\uFE0F Anomalie d\u00E9tect\u00E9e signal\u00E9e' },
    { id: 'pieces_manquantes', label: '\uD83D\uDD29 Pi\u00E8ces manquantes identifi\u00E9es' },
    { id: 'inspection_requise',label: '\uD83D\uDD0D Inspection requise not\u00E9e' }
  ];

  var USAGE_CONDITIONS = [
    { key: 'ok',        label: 'OK \u2014 Bon \u00E9tat',           icon: '\u2705', color: 'var(--green,#22C55E)' },
    { key: 'sale',      label: 'Sale \u2014 Nettoyage requis',      icon: '\uD83E\uDDF9', color: 'var(--orange)' },
    { key: 'use',       label: 'Usure visible',                     icon: '\u26A0\uFE0F', color: 'var(--gold)' },
    { key: 'endommage', label: 'Endommag\u00E9',                    icon: '\uD83D\uDD34', color: 'var(--red)' },
    { key: 'inspecter', label: '\u00C0 inspecter',                   icon: '\uD83D\uDD0D', color: 'var(--blue)' }
  ];

  // ── Private variables ──────────────────────────────────────

  /** @type {Object} Main application state */
  var state = {
    step: 0,
    pin: '',
    mode: null,           // 'PICK-ON' | 'PICK-OFF'
    depot: null,
    dest: null,
    remorques: [],
    camion: null,
    trailer: null,
    sauvs: [],
    scanned: [],
    checklist: {},
    projet: '',
    contact: '',
    showModal: null,
    urgenceType: '',
    urgenceNote: '',
    _expandedScannedGroups: {},
    _usageSelected: []
  };

  var _db = {};           // Debounce timers
  var lastPayload = null;
  var cancelTimer = null;
  var cancelSeconds = 300;

  // Chat variables
  var firebaseDB = null;
  var chatMessages = [];
  var chatListener = null;
  var chatMode = 'general';
  var chatDmTarget = null;
  var chatDmTargetName = '';
  var chatUnreadCount = 0;
  var chatMentionDropdown = false;
  var chatFabToastTimer = null;
  var chatLastNotifiedId = null;
  var CHAT_COLORS = ['#E65100','#D4A017','#3B82F6','#22C55E','#EF4444','#8B5CF6','#EC4899','#14B8A6'];
  var CHAT_MONTHS = ['jan','f\u00E9v','mar','avr','mai','jun','jul','ao\u00FB','sep','oct','nov','d\u00E9c'];

  // Formation view state
  var formView = 'myCerts';
  var formTeamTab = 'all';
  var formTeamSearch = '';

  // Items view mode
  var vueItemsMode = 'liste';

  // Chat local storage keys
  var CHAT_LS = 'volo_chat_';
  var CHAT_LS_READ = CHAT_LS + 'last_read';

  // Chat extra state
  var chatLastChannel = 'general';
  var chatDmTargetObj = null; // {id, name}
  var chatMentionFilter = '';
  var chatMentionIdx = 0;
  var chatNewMsgCount = 0;
  var chatIsAtBottom = true;
  var chatDmCache = {};

  // ── Private functions ──────────────────────────────────────

  /**
   * @private
   * Set a vehicle camion selection
   * @param {string} id - Vehicle ID
   */
  function _setVehicleCamion(id) {
    var cur = state.remorques.slice().filter(function(r){ return !r.startsWith('REM-PU'); });
    if(id) cur.unshift(id);
    V6Engine.setState({remorques: cur});
  }

  function _setVehicleTrailer(id) {
    var cur = state.remorques.slice().filter(function(r){ return !r.startsWith('REM-TR'); });
    if(id) cur.push(id);
    V6Engine.setState({remorques: cur});
  }

  function _scanGroupExecute(missingNote) {
    var sg = window._pendingScanGroup;
    var grp = sg.grp, grpItems = sg.grpItems, grpName = sg.grpName, newItems = sg.newItems;
    var sceaux = Object.assign({}, state.sceaux);
    var stamped = newItems.map(function(item){
      if(item.sceau) sceaux[item.id] = 'INTACT';
      return Object.assign({}, item, {scanTime: new Date(), fromGroup: grp.id, fromGroupName: grpName});
    });
    try{ navigator.vibrate && navigator.vibrate([100,50,100,50,100]); }catch(e){}
    V6Engine.updateCaisseStatut(grp.id, 'en_mission');
    if(missingNote){
      var caisseStock = V6Engine.getCaisseStock();
      var stockList = caisseStock[grp.id];
      var incidents = JSON.parse(localStorage.getItem('volo_incidents') || '[]');
      incidents.unshift({type:'MANQUANT_PICK_ON', caisse:grp.id, caisse_nom:grpName, items_manquants:stockList ? grpItems.filter(function(id){return !stockList.includes(id);}) : [], note:missingNote, user:state.pin, timestamp:V6Data.tsNow()});
      localStorage.setItem('volo_incidents', JSON.stringify(incidents));
    }
    V6UI.showToast('\uD83D\uDCE6 ' + grpName + ' \u2014 ' + newItems.length + ' items ajout\u00E9s', 'ok');
    window._pendingScanGroup = null;
    V6Engine.setState({scanned: state.scanned.concat(stamped), sceaux: sceaux, showModal: null});
  }

  function _finalizeScanItem(stamped, sceaux, isPickoff) {
    try{ navigator.vibrate && navigator.vibrate([50,30,50]); }catch(e){}
    try{
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(); var g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 880; g.gain.value = 0.15;
      o.start(); o.stop(ac.currentTime + 0.1);
    }catch(e){}
    V6UI.showToast((isPickoff ? '\uD83D\uDCE5 D\u00E9pos\u00E9: ' : '\u2713 Scann\u00E9: ') + stamped.name, 'ok');
    V6Engine.setState({scanned: state.scanned.concat([stamped]), sceaux: sceaux, showModal: null});
  }

  /** @private helper: set vue items mode */
  function setVueItems(mode) { vueItemsMode = mode; V6Engine.render(); }

  /** @private helper: _scanGroupCheckMissing */
  function _scanGroupCheckMissing() {
    var sg = window._pendingScanGroup;
    var grp = sg.grp, grpItems = sg.grpItems;
    var caisseStock = V6Engine.getCaisseStock();
    var stockList = caisseStock[grp.id];
    if(stockList){
      var missingFromStock = grpItems.filter(function(id){ return !stockList.includes(id); });
      if(missingFromStock.length > 0){
        window._pendingScanGroupMissing = missingFromStock;
        V6Engine.setState({showModal: 'scanGroupMissing'});
        return;
      }
    }
    _scanGroupExecute('');
  }

  /** @private Render caisse history entries */
  function _cmRenderHistory(grpId) {
    var hist = V6Engine.getStockHistory(grpId);
    var esc = V6Data.escapeHtml;
    if (!hist.length) return '<div style="color:#333;font-style:italic">Aucune transaction</div>';
    return hist.map(function(h) {
      return '<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #141414">' +
        '<span>' + (h.action === 'PRISE' ? '\uD83D\uDCE4' : '\uD83D\uDCE5') + '</span>' +
        '<div style="flex:1">' +
          '<div style="font-size:12px;color:#ccc">' + esc(h.action) + ' \u2014 ' + esc(h.sauveteur) + ' <span style="color:#444">(' + esc(h.volo) + ')</span></div>' +
          '<div style="font-size:10px;color:#555">' + h.items.map(function(i){ return esc(i.name); }).join(', ') + '</div>' +
          '<div style="font-size:10px;color:#333">' + new Date(h.ts).toLocaleString('fr-CA') + ' \u00B7 Restant: ' + h.restant + '</div>' +
        '</div>' +
        '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:' + (h.action === 'PRISE' ? 'rgba(230,81,0,.12)' : 'rgba(39,174,96,.12)') + ';color:' + (h.action === 'PRISE' ? '#E65100' : '#27AE60') + ';font-family:\'Oswald\',sans-serif;flex-shrink:0">' + h.items.length + 'x</span>' +
      '</div>';
    }).join('');
  }

  // ── Public API ─────────────────────────────────────────────
  window.V6Engine = {

    /** Expose state for read access by other modules */
    getState: function() { return state; },

    init: function() {
      // Restore saved PIN
      var savedPin = localStorage.getItem('volo_pin');
      if(savedPin) {
        state.pin = savedPin;
        state.loggedIn = true;
      }
      // Init defaults
      state.searchQ = state.searchQ || '';
      state.itemQ = state.itemQ || '';
      state.filterType = state.filterType || 'all';
      state.catFilter = state.catFilter || '';
      state.scanMode = state.scanMode || 'live';
      state.numProjet = state.numProjet || '';
      state.personneRessource = state.personneRessource || '';
      state.personneRessourceTel = state.personneRessourceTel || '';
      state.personneRessourceEmail = state.personneRessourceEmail || '';
      state.detailsJob = state.detailsJob || '';
      state.txNote = state.txNote || '';
      // Start usage timer if session active
      var activeSession = this.getActiveUsageSession();
      if(activeSession) setTimeout(function(){ V6Engine.startUsageTimer(); }, 500);
      // Start chat background listener
      try { this.chatStartBackgroundListener(); } catch(e){}
      // Render
      this.render(true);
    },

    // ──────────────────────────────────────────────────────────
    // CORE STATE MACHINE (42 functions)
    // ──────────────────────────────────────────────────────────

    debounceInput: function(key, fn, delay) {
      if(delay === undefined) delay = 280;
      clearTimeout(_db[key]);
      _db[key] = setTimeout(fn, delay);
    },

    setField: function(key, val) {
      state[key] = val;
    },

    updateItemResults: function(val) {
      state.itemQ = val;
      var el = document.getElementById('item-results');
      if(!el){ this.render(); return; }
      var q = val.toLowerCase();
      var scannedIds = state.scanned.map(function(s){ return s.id; });
      var available = ITEMS.filter(function(i){ return !scannedIds.includes(i.id); });
      if(q) available = available.filter(function(i){ return (i.name||'').toLowerCase().includes(q)||(i.id||'').toLowerCase().includes(q)||(i.cat||'').toLowerCase().includes(q)||(i.desc||'').toLowerCase().includes(q); });
      if(state.catFilter && state.catFilter !== 'all') available = available.filter(function(i){ return i.cat === state.catFilter; });
      // Build caisse lookup for items
      var caisseMap = {};
      if(typeof CAISSES !== 'undefined') {
        CAISSES.forEach(function(c) {
          (c.items_contenus || []).forEach(function(itemId) {
            caisseMap[itemId] = c.nom || c.name || c.id;
          });
        });
      }
      // Count by item name AND by sac/caisse for search summary
      var countByName = {};
      var countBySac = {};
      if(q) {
        available.forEach(function(item) {
          var nm = item.name || 'Inconnu';
          countByName[nm] = (countByName[nm] || 0) + 1;
          var sac = caisseMap[item.id] || 'Non assign\u00E9';
          var key = nm + '|' + sac;
          if(!countBySac[key]) countBySac[key] = {name: nm, sac: sac, count: 0};
          countBySac[key].count++;
        });
      }
      var totalCount = available.length;
      if(!q && available.length > 80) available = available.slice(0, 80);
      var escapeHtml = V6Data.escapeHtml;
      // Build count banner when searching
      var banner = '';
      if(q && totalCount > 0) {
        // Line 1: count by item name (ex: Spin L1 ×14 | Spin L2 ×14)
        var nameKeys = Object.keys(countByName);
        var nameSummary = nameKeys.map(function(nm) {
          return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:6px;background:rgba(201,168,76,.18);font-size:12px;font-weight:600;color:var(--gold)">' + escapeHtml(nm) + ' \u00D7' + countByName[nm] + '</span>';
        }).join('');
        // Line 2: breakdown by name+sac (ex: Spin L1 → Sac Premonter #1: 4)
        var sacKeys = Object.keys(countBySac).sort();
        var sacSummary = sacKeys.map(function(key) {
          var entry = countBySac[key];
          return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:6px;background:rgba(59,130,246,.1);font-size:11px;color:var(--blue)">' + escapeHtml(entry.sac) + ' <b>' + entry.count + '</b></span>';
        }).join('');
        banner = '<div style="padding:10px 14px;margin-bottom:8px;border-radius:10px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2)">' +
          '<div style="font-size:14px;font-weight:700;color:var(--gold);margin-bottom:6px">\uD83D\uDCE6 ' + totalCount + ' item' + (totalCount > 1 ? 's' : '') + ' au total</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px">' + nameSummary + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:2px">' + sacSummary + '</div>' +
        '</div>';
      }
      el.innerHTML = totalCount === 0
        ? '<div style="text-align:center;padding:20px;color:var(--muted)">Aucun r\u00E9sultat pour "' + escapeHtml(val) + '"</div>'
        : banner + available.map(function(item){
          var sacName = caisseMap[item.id] || '';
          var sacTag = sacName ? '<span style="margin-left:6px;font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,.12);color:var(--blue);font-weight:500">' + escapeHtml(sacName) + '</span>' : '';
          return '<div class="item-btn" onclick="V6Engine.scanItem(\'' + item.id + '\')">' +
            '<div><span class="cat">' + (item.icon||'\uD83D\uDD27') + '</span><span style="font-size:15px;font-weight:600">' + escapeHtml(item.name) + '</span>' + sacTag + (item.etat==='A surveiller'?'<span style="margin-left:6px;font-size:11px;padding:1px 6px;border-radius:4px;background:rgba(230,126,34,.15);color:var(--orange);font-weight:600">\u26A0\uFE0F A surveiller</span>':'') + '<div style="font-size:12px;color:var(--muted);font-family:\'JetBrains Mono\'">' + escapeHtml(item.id) + ' \u2022 ' + escapeHtml(item.cat) + '</div></div>' +
            '<span class="badge ' + (state.mode==='pickoff'?'badge-orange':'badge-gold') + '">' + (state.mode==='pickoff'?'D\u00C9POSER':'SCAN') + '</span>' +
          '</div>';
        }).join('');
    },

    updatePersonnelResults: function(val) {
      state.searchQ = val;
      var el = document.getElementById('personnel-results');
      if(!el){ this.render(); return; }
      var q = val.toLowerCase();
      var ft = state.filterType || 'all';
      var list = PERSONNEL;
      if(ft === 'sauv') list = list.filter(function(p){ return p.type === 'SAUVETEUR'; });
      if(ft === 'surv') list = list.filter(function(p){ return p.type === 'SURVEILLANT'; });
      if(q) list = list.filter(function(p){ return (p.name||'').toLowerCase().includes(q)||(p.volo||'').toLowerCase().includes(q)||(p.ville||'').toLowerCase().includes(q)||(p.region||'').toLowerCase().includes(q); });
      var shown = list.slice(0, 40);
      var more = list.length - shown.length;
      var escapeHtml = V6Data.escapeHtml;
      el.innerHTML = shown.map(function(s){
        return '<div class="card ' + (state.sauvs.includes(s.id)?'selected':'') + '" onclick="V6Engine.toggleSauv(\'' + s.id + '\')">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div><div class="name">' + escapeHtml(s.name) + '</div><div class="sub">' + escapeHtml(s.id) + ' \u2022 ' + escapeHtml(s.ville||s.region) + '</div></div>' +
            '<div style="text-align:right"><div class="role" style="color:' + (s.type==='SURVEILLANT'?'var(--blue)':'var(--orange)') + '">' + escapeHtml(s.role) + '</div>' + (state.sauvs.includes(s.id)?'<span class="check">\u2713</span>':'') + '</div>' +
          '</div>' +
        '</div>';
      }).join('')
      + (more > 0 ? '<div style="text-align:center;padding:12px;color:var(--muted);font-size:13px">+' + more + ' r\u00E9sultats \u2014 affinez votre recherche</div>' : '')
      + (list.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted)">Aucun r\u00E9sultat</div>' : '');
    },

    setState: function(updates) {
      V6Scanner.stopQrScanner();
      var stepChanged = updates.step !== undefined && updates.step !== state.step;
      Object.assign(state, updates);
      if(state.step >= 2 && state.step <= 8){
        V6Data.safeSetLS('volo_wizard_step', state.step);
        V6Data.safeSetLS('volo_wizard_mode', state.mode || 'pickon');
      } else if(state.step === 0){
        try{ localStorage.removeItem('volo_wizard_step'); localStorage.removeItem('volo_wizard_mode'); }catch(e){}
      }
      this.render(stepChanged);
      V6Auth.resetLockTimer();
      if(state.step === 6 && state.camMode !== false) setTimeout(function(){ V6Scanner.startQrScanner(); }, 400);
    },

    render: function(stepChanged) {
      if(state.step !== 8 && state.step !== 17 && cancelTimer){ clearInterval(cancelTimer); cancelTimer = null; }
      var app = document.getElementById('app');
      var savedScroll = window.scrollY;
      var active = document.activeElement;
      var savedId = active && active.id ? active.id : null;
      var savedName = active && active.name ? active.name : null;
      var savedClass = active && active.className ? active.className : null;
      var savedValue = active && 'value' in active ? active.value : null;
      var savedSelStart = active && active.selectionStart != null ? active.selectionStart : null;
      var savedSelEnd = active && active.selectionEnd != null ? active.selectionEnd : null;
      var savedTag = active ? active.tagName : null;

      var html = '<div class="gold-bar"></div>';
      html += '<div class="header"><img src="../eagle_crown.jpg" alt="Logo" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(201,168,76,.4);box-shadow:0 0 12px rgba(201,168,76,.25)"><span class="title">GOLDEN EAGLES</span><span class="step-label">' + this.getStepLabel() + '</span></div>';
      try{ html += renderActivePickOnBanner(); }catch(e){ console.error('pickOnBanner crash', e); }
      try{ html += '<div class="screen">' + this.renderStep() + '</div>'; }catch(e){ console.error('renderStep crash', e); html += '<div class="screen"><div style="padding:40px;text-align:center;color:#E65100">\u26A0\uFE0F Erreur d\'affichage \u2014 rafra\u00EEchir la page</div></div>'; }
      if(state.step < 7 || state.step === 11 || state.step === 12 || state.step === 16) html += '<button class="urgence-btn" onclick="showUrgence()">\uD83D\uDEA8</button>';
      try{ if(state.step !== 17 && state.loggedIn) html += '<div id="chatFabWrap">' + renderChatFab() + '</div>'; }catch(e){ console.error('renderChatFab crash', e); }
      try{ html += this.renderUsageIndicator(); }catch(e){ console.error('renderUsageIndicator crash', e); }
      try{ if(state.showModal) html += this.renderModal(); }catch(e){ console.error('renderModal crash', e); }
      app.innerHTML = html;

      if(state.step === 0){
        fetchWeather().then(function(w){ var s = document.getElementById('weatherSlot'); if(s) s.innerHTML = V6UI.renderWeatherWidget(w); }).catch(function(){});
      }
      if(typeof window._ptgInterval !== 'undefined') clearInterval(window._ptgInterval);
      if(state.step === 0){
        var _ptgClock = document.getElementById('pointageHeroClock');
        if(_ptgClock){
          window._ptgInterval = setInterval(function(){
            var now = new Date();
            var el = document.getElementById('pointageHeroClock');
            if(!el){ clearInterval(window._ptgInterval); return; }
            el.textContent = now.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
          }, 1000);
        }
      }
      initTeamCarousel();
      if(state.step === 17) setTimeout(function(){ V6Engine.initMainChatUI(); }, 50);

      if(savedTag === 'INPUT' || savedTag === 'TEXTAREA'){
        var el = null;
        if(savedId) el = document.getElementById(savedId);
        if(!el && savedName) el = document.querySelector('[name="' + savedName + '"]');
        if(!el && savedClass){
          var cls = savedClass.trim().split(/\s+/)[0];
          if(cls) el = document.querySelector('.' + cls);
        }
        if(el){
          el.focus();
          if(savedValue !== null && el.value === '' && savedValue !== '') el.value = savedValue;
          try{ if(savedSelStart !== null) el.setSelectionRange(savedSelStart, savedSelEnd || savedSelStart); }catch(e){}
        }
      }
      if(stepChanged){ window.scrollTo(0,0); }
      else {
        if(state.step === 5 || state.step === 6 || state.step === 7){ window.scrollTo({top:savedScroll, behavior:'instant'}); }
        else { window.scrollTo(0, savedScroll); }
      }
    },

    getStepLabel: function() {
      var labels = ["ACCUEIL","IDENTIFIANT","V\u00C9HICULE","D\u00C9P\u00D4T","DESTINATION","PERSONNEL","SCAN RAFALE","CONFIRMATION","VALIDATION","DASHBOARD","HISTORIQUE","PHOTOS SETUP","KILOM\u00C9TRAGE","FORMATION","","MES GAINS","UTILISATION","CHAT"];
      if(state.step === 2 && state.mode === 'pickoff') return "RETOUR MAT\u00C9RIEL";
      return labels[state.step] || "";
    },

    renderWizardProgress: function() {
      if(state.step < 2 || state.step > 7) return '';
      var steps = [
        {n:2,icon:'\uD83D\uDE9B',lbl:'V\u00C9H.'},
        {n:3,icon:'\uD83D\uDCCD',lbl:'D\u00C9P\u00D4T'},
        {n:4,icon:'\uD83C\uDFAF',lbl:'DEST.'},
        {n:5,icon:'\uD83D\uDC65',lbl:'\u00C9QUIPE'},
        {n:6,icon:'\uD83D\uDCF7',lbl:'SCAN'},
        {n:7,icon:'\u2713',lbl:'CONFIR.'}
      ];
      var html = '<div class="wiz-progress">';
      steps.forEach(function(s, i){
        var cls = state.step === s.n ? 'active' : state.step > s.n ? 'done' : '';
        html += '<div style="display:flex;flex-direction:column;align-items:center">';
        html += '<div class="wiz-dot ' + cls + '">' + (cls === 'done' ? '\u2713' : s.icon) + '</div>';
        html += '<div class="wiz-label ' + cls + '">' + s.lbl + '</div>';
        html += '</div>';
        if(i < steps.length - 1){
          html += '<div class="wiz-line ' + (state.step > s.n ? 'done' : '') + '"></div>';
        }
      });
      html += '</div>';
      return html;
    },

    renderStep: function() {
      switch(state.step){
        case 0: return this.renderAccueil();
        case 1: return this.renderPin();
        case 2: return state.mode === 'pickoff' ? renderPickoffSelect() : this.renderRemorque();
        case 3: return this.renderDepot();
        case 4: return this.renderDest();
        case 5: return this.renderSauvs();
        case 6: return this.renderScan();
        case 7: return this.renderConfirm();
        case 8: return this.renderValidation();
        case 9: return V6UI.renderDashboard();
        case 10: return V6UI.renderHistory();
        case 11: return renderPhotoSetup();
        case 12: return V6Km.renderKmTracking();
        case 13: return V6Certs.renderFormation();
        case 15: return V6Km.renderMesGains();
        case 16: return this.renderUsageTracker();
        case 17: return this.renderMainChat();
        default: return '';
      }
    },

    renderAccueil: function() {
      var activeItems = V6Data.getActiveItems();
      var overdueCount = activeItems.filter(function(i){ return Date.now() - new Date(i.timestamp).getTime() > 86400000; }).length;
      var hLen = V6Data.getHistory().length;
      var lastRole = localStorage.getItem('volo_last_role') || '';
      var lastUser = localStorage.getItem('volo_last_user') || '';
      var isSurv = lastRole === 'SURVEILLANT';
      var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
      var isChef = user && V6Auth.isUserChef();
      var userName = user ? user.name.toUpperCase() : (isSurv ? lastUser : 'UTILISATEUR');
      var initials = user ? (user.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2)).toUpperCase() : '??';
      var regionLabel = user && user.region ? user.region.toUpperCase() : 'R\u00C9GION';
      var roleColor = isChef ? '#D4A017' : isSurv ? '#3B82F6' : '#E65100';
      var ptgActive = isPointageActive();
      var kmLogs = V6Km.getKmLogs ? V6Km.getKmLogs() : [];
      var todayKm = kmLogs.filter(function(l){ return l.timestamp && l.timestamp.startsWith(new Date().toISOString().slice(0,10)); });
      var photosCount = typeof getSetupPhotos === 'function' ? getSetupPhotos().length : 0;
      var escapeHtml = V6Data.escapeHtml;
      var safeGetLS = V6Data.safeGetLS;
      var tsNow = V6Data.tsNow;

      var gainsLabel = 'Per diem, km';
      try{
        if(user){
          var g = getAutoGains(user);
          var periods = getPayPeriods();
          var wLogs = g.filter(function(e){ return e.date >= periods.current.from && e.date <= periods.current.to; });
          var total = wLogs.reduce(function(s,e){ return s + e.total; }, 0);
          if(total > 0) gainsLabel = total.toFixed(2) + '$ cette p\u00E9riode';
        }
      }catch(e){}

      var myPO = isSurv ? [] : V6Data.getMyActivePickOns();
      var _poTotalItems = myPO.reduce(function(n,tx){ try{ return n + JSON.parse(tx.items||'[]').length; }catch(e){ return n; } }, 0);
      var poAlert = myPO.length > 0 ? (function(){
        var totalItems = _poTotalItems;
        var firstTx = myPO[myPO.length-1];
        var since = firstTx ? new Date(firstTx.timestamp).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}) : '';
        var dest = firstTx ? firstTx.destination : '';
        return '<div onclick="V6Engine.startPickOff()" style="margin-bottom:12px;padding:14px 15px;background:linear-gradient(135deg,rgba(192,57,43,.2),rgba(192,57,43,.08));border:2px solid var(--red);border-radius:14px;cursor:pointer;animation:pulse-border 2s infinite;display:flex;align-items:center;gap:10px"><span style="font-size:26px">\u26A0\uFE0F</span><div style="flex:1"><div style="font-weight:800;font-size:14px;color:var(--red);letter-spacing:1px;font-family:Oswald,sans-serif">' + myPO.length + ' PICK-ON ACTIF' + (myPO.length>1?'S':'') + '</div><div style="font-size:11px;color:var(--txt);margin-top:2px">' + totalItems + ' items dehors' + (dest?' \u2014 '+dest:'') + (since?' depuis '+since:'') + '</div><div style="font-size:10px;color:var(--gold);margin-top:3px">\uD83D\uDC46 Toucher pour faire le PICK-OFF</div></div><span style="font-size:18px;color:var(--red)">\u2192</span></div>';
      })() : '';

      // Build simplified accueil — faithfully from index.html
      var result = '';
      result += '<!-- HERO --><div class="accueil-hero"><img class="accueil-hero-watermark" src="' + (typeof LOGO!=='undefined'?LOGO:'../eagle_tactic.png') + '" alt=""><div class="accueil-badge-wrap"><span class="accueil-badge"><img src="' + (typeof LOGO_TACTIC!=='undefined'?LOGO_TACTIC:'../eagle_tactic.png') + '" alt="Golden Eagles SST"></span></div><div class="accueil-title">GOLDEN <span>EAGLES</span></div><div class="accueil-sub">SAUVETAGE TECHNIQUE \u00B7 VOLO RESCUE</div><div class="accueil-divider"></div></div>';
      result += '<!-- STATUS --><div class="accueil-status"><div class="accueil-online" style="' + (navigator.onLine?'':'opacity:.5') + '"><div class="accueil-dot" style="' + (navigator.onLine?'':'background:var(--red)') + '"></div><span>' + (navigator.onLine?'EN LIGNE':'HORS-LIGNE') + '</span></div><div class="accueil-pills"><span class="accueil-pill accueil-pill-gold">' + regionLabel + '</span><span class="accueil-pill" style="background:rgba(' + (isSurv?'59,130,246':isChef?'212,160,23':'230,81,0') + ',.08);border:1px solid rgba(' + (isSurv?'59,130,246':isChef?'212,160,23':'230,81,0') + ',.22);color:' + roleColor + '">' + (isChef?"\u2B50 CHEF D'\u00C9QUIPE":isSurv?'SURVEILLANT':'SAUVETEUR') + '</span></div><div class="accueil-vid">' + (isSurv?lastUser.split(' ')[0]||'\u2014':'V'+state.pin) + '</div><div id="weatherSlot" style="margin-top:6px"></div></div>';
      result += '<div style="padding:14px 16px 100px" class="accueil-anim">';
      try{ result += getUrgencyBannerHtml(); }catch(e){}
      try{ result += getAnnouncementBannerHtml(); }catch(e){}

      // User banner
      result += '<div class="accueil-user" style="border-left-color:' + roleColor + ';cursor:pointer" onclick="openProfile(\'' + (user?user.id:'') + '\')"><div class="accueil-avatar" style="border-color:' + roleColor + ';color:' + roleColor + ';overflow:hidden">' + (function(){ var av = localStorage.getItem('volo_avatar_'+(user?user.id:'')); return av ? '<img src="'+av+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : initials; })() + '</div><div><div class="accueil-uname">' + userName + (isChef?'<span class="chef-badge">\u2B50 CHEF</span>':'') + '</div><div class="accueil-umeta">' + (isSurv?'SURVEILLANT':isChef?"CHEF D'\u00C9QUIPE \u00B7 "+regionLabel:'SAUV-'+state.pin+' \u00B7 '+regionLabel) + '</div></div><div class="accueil-utag">ACTIF</div></div>';
      result += poAlert;

      // Resume wizard banner
      result += (function(){
        var savedWizardStep = safeGetLS('volo_wizard_step', null);
        if(savedWizardStep && savedWizardStep >= 2 && savedWizardStep <= 7){
          var wizMode = safeGetLS('volo_wizard_mode', 'pickon');
          var modeLabel = wizMode === 'pickoff' ? 'PICK-OFF' : 'PICK-ON';
          var stepLabels = {2:'V\u00E9hicule',3:'D\u00E9p\u00F4t',4:'Destination',5:'Personnel',6:'Scan items',7:'Confirmation'};
          return '<div onclick="V6Engine.setState({step:'+savedWizardStep+',mode:\''+wizMode+'\'})" style="margin-bottom:12px;padding:14px 15px;background:linear-gradient(135deg,rgba(212,160,23,.15),rgba(212,160,23,.05));border:1px solid rgba(212,160,23,.4);border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:10px"><span style="font-size:22px">\uD83D\uDD04</span><div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--gold);letter-spacing:1px;font-family:Oswald,sans-serif">REPRENDRE '+modeLabel+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px">\u00C9tape: '+((stepLabels[savedWizardStep])||('Step '+savedWizardStep))+'</div></div><span style="font-size:14px;color:var(--gold)">\u2192</span><span onclick="event.stopPropagation();try{localStorage.removeItem(\'volo_wizard_step\');localStorage.removeItem(\'volo_wizard_mode\')}catch(e){};V6Engine.render()" style="font-size:12px;color:var(--muted);padding:4px 8px;cursor:pointer">\u2715</span></div>';
        }
        return '';
      })();

      // Pointage hero
      result += (function(){
        var lastPtg = '';
        try{
          var ptgLog = safeGetLS('volo_pointage_log', []) || [];
          var myPtg = ptgLog.filter(function(p){ return p.volo === (state.user?state.user.volo:(user?user.volo:'')); });
          if(myPtg.length){
            var last = myPtg[myPtg.length-1];
            lastPtg = (last.type==='ARRIVEE'?'Arriv\u00E9e':'D\u00E9part') + ' \u00E0 ' + new Date(last.timestamp).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
          }
        }catch(e){}
        var nextAction = lastPtg.indexOf('Arriv\u00E9e')>=0 ? 'd\u00E9part' : 'arriv\u00E9e';
        return '<div class="pointage-hero" onclick="window.location.href=\'../pointage.html?pin='+state.pin+'\'">' +
          '<div class="pointage-hero-icon">\u23F1</div>' +
          '<div class="pointage-hero-info">' +
          '<div class="pointage-hero-time" id="pointageHeroClock">' + new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}) + '</div>' +
          '<div class="pointage-hero-label">Pointer mon ' + nextAction + '</div>' +
          '<div class="pointage-hero-status">' + (lastPtg ? lastPtg : 'Aucun pointage aujourd\'hui') + '</div>' +
          '</div>' +
          '<div class="pointage-hero-arrow">\u203A</div></div>';
      })();

      if(isChef) try{ result += renderChefDashboard(); }catch(e){}

      // Chef buttons
      if(isChef){
        result += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px"><button onclick="showAnnouncementModal()" style="padding:12px;border-radius:12px;border:1px solid var(--gold);background:rgba(212,160,23,.08);color:var(--gold);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px">\uD83D\uDCE2 ANNONCE</button><button onclick="V6Engine.setState({showModal:\'urgency_confirm\'})" style="padding:12px;border-radius:12px;border:1px solid var(--red);background:rgba(192,57,43,.08);color:var(--red);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px">\uD83D\uDEA8 URGENCE</button><button onclick="exportBackup()" style="padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--muted);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px">\uD83D\uDCBE BACKUP</button><button onclick="importBackup()" style="padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--muted);font-family:Oswald,sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px">\uD83D\uDCE5 RESTAURER</button></div>';
      }

      // Stats row
      if(!isSurv){
        result += '<div class="accueil-stats"><div class="accueil-stat ast-rescue"><div class="snum snum-rescue">' + PERSONNEL.filter(function(p){return p.type==='SAUVETEUR'&&p.role!=="CHEF D\'EQUIPE";}).length + '</div><div class="slabel">SAUVETEURS</div></div><div class="accueil-stat ast-gold"><div class="snum snum-gold">' + PERSONNEL.filter(function(p){return p.role==="CHEF D\'EQUIPE";}).length + '</div><div class="slabel">CHEFS</div></div><div class="accueil-stat ast-blue"><div class="snum snum-blue">' + PERSONNEL.filter(function(p){return p.type==='SURVEILLANT';}).length + '</div><div class="slabel">SURVEILLANTS</div></div><div class="accueil-stat ast-green"><div class="snum snum-green">' + ITEMS.length + '</div><div class="slabel">ITEMS INV.</div></div></div>';

        // PICK ROW
        if(myPO.length > 0){
          result += '<div class="accueil-picks"><button class="accueil-pick accueil-pick-off" onclick="V6Engine.startPickOff()" style="animation:pick-on-glow 2s infinite,pulse-border 1.5s infinite;box-shadow:0 8px 36px rgba(230,81,0,.5),0 0 20px rgba(230,81,0,.3);border:3px solid var(--rescue);background:linear-gradient(135deg,rgba(230,81,0,.2),rgba(192,57,43,.15));position:relative;overflow:visible"><span class="pick2-icon" style="font-size:28px">\u25C0\u26A1</span><span class="pick2-lbl" style="font-size:20px;color:#fff">PICK-OFF</span><span style="position:absolute;top:-8px;right:-8px;background:var(--red);color:#fff;font-size:12px;font-weight:800;padding:3px 10px;border-radius:12px;font-family:JetBrains Mono,monospace;box-shadow:0 2px 8px rgba(192,57,43,.5)">' + _poTotalItems + ' item' + (_poTotalItems>1?'s':'') + '</span><span class="pick2-sub" style="color:var(--rescue);font-weight:700;font-size:11px">\u26A1 ' + _poTotalItems + ' items \u00E0 retourner</span></button><button class="accueil-pick" disabled style="background:var(--card);border:1px solid var(--border);color:var(--muted);opacity:.4;cursor:not-allowed;pointer-events:none"><span class="pick2-icon" style="opacity:.5">\u25B6</span><span class="pick2-lbl">PICK-ON</span><span class="pick2-sub" style="color:var(--muted);font-size:9px">Pick On d\u00E9j\u00E0 actif</span></button></div>';
        } else {
          result += '<div class="accueil-picks"><button class="accueil-pick accueil-pick-on" onclick="V6Engine.startPickOn()"><span class="pick2-icon">\u25B6</span><span class="pick2-lbl">PICK-ON</span><span class="pick2-sub">Sortie mat\u00E9riel</span></button><button class="accueil-pick accueil-pick-off" onclick="V6Engine.startPickOff()"><span class="pick2-icon">\u25C0</span><span class="pick2-lbl">PICK-OFF</span><span class="pick2-sub">Retour mat\u00E9riel</span></button></div>';
        }
      }

      // Quick access
      result += '<div class="accueil-section">ACC\u00C8S RAPIDE</div>';
      result += '<div class="accueil-pcard apc-gold" onclick="V6Engine.setState({step:15,gainsMode:true})"><div class="accueil-pcard-icon">\uD83D\uDCB0</div><div class="accueil-pcard-body"><div class="accueil-pcard-title">MES GAINS</div><div class="accueil-pcard-sub">' + gainsLabel + '</div></div><div style="font-size:14px;color:var(--muted)">\u2192</div></div>';

      // Resources
      result += '<div class="accueil-section">RESSOURCES</div>';
      var activeI = V6Data.getActiveItems();
      var transit = activeI.length;
      result += '<div class="accueil-fwcard" onclick="V6Engine.openCaisseModule()"><div class="accueil-fw-icon" style="background:rgba(39,174,96,.07);border-color:rgba(39,174,96,.2)">\uD83D\uDCE6</div><div style="flex:1"><div class="accueil-fw-title" style="color:var(--green)">CAISSES & STOCK</div><div class="accueil-fw-sub">' + (transit ? '<span style="color:var(--orange);font-weight:600">' + transit + ' en transit</span>' : 'Inventaire en temps r\u00E9el') + '</div></div>' + (transit ? '<div class="accueil-gbadge agb-orange">' + transit + '</div>' : '<div style="font-size:14px;color:var(--muted)">\u2192</div>') + '</div>';

      result += '<div class="accueil-fwcard" onclick="V6Certs._setFormView(\'main\');V6Engine.setState({step:13})"><div class="accueil-fw-icon" style="background:rgba(251,191,36,.07);border-color:rgba(251,191,36,.2)">\uD83C\uDF93</div><div><div class="accueil-fw-title" style="color:var(--gold)">' + (isSurv?'MES CERTIFICATIONS':'FORMATION & DOCS') + '</div><div class="accueil-fw-sub">' + (isSurv?'Suivi de mes certifications':'Certifications \u00B7 Tracker \u00E9quipe \u00B7 PDF') + '</div></div><div style="margin-left:auto;font-size:14px;color:var(--muted)">\u2192</div></div>';

      // Deconnexion
      result += '<div style="display:flex;gap:8px;margin-top:16px"><button onclick="doLogout()" style="flex:1;padding:11px;background:none;border:1px solid var(--border2);border-radius:10px;color:var(--muted);font-size:10px;cursor:pointer;letter-spacing:2px;font-family:\'Oswald\',sans-serif">\uD83D\uDD13 D\u00C9CONNEXION</button></div>';
      try{ result += renderVersionFooter(); }catch(e){}
      result += '</div>';
      return result;
    },

    renderPin: function() {
      var escapeHtml = V6Data.escapeHtml;
      var isInitialLogin = !state.loggedIn;
      var dots = '';
      for(var i=0;i<4;i++) dots += '<div class="pin-dot ' + (state.pin.length>i?'filled':'') + '">' + (state.pin[i]?'\u25CF':'') + '</div>';
      var identified = '';
      if(state.pin.length === 4){
        var s = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; }) || null;
        var btnLabel = isInitialLogin ? '\uD83E\uDD85 ACC\u00C9DER' : state.gainsMode ? '\uD83D\uDCB0 MES GAINS' : state.photoMode ? '\uD83D\uDCF7 PHOTOS SETUP' : state.kmMode ? '\uD83D\uDE9B KILOM\u00C9TRAGE' : 'CONTINUER';
        if(s){
          identified = '<div class="card selected" style="margin-top:12px;text-align:center;border-color:var(--green)"><div class="badge badge-green" style="margin-bottom:6px">\u2713 IDENTIFI\u00C9</div><div class="name">' + escapeHtml(s.name) + '</div><div class="sub">' + escapeHtml(s.id) + ' \u2022 ' + escapeHtml(s.volo) + ' \u2022 ' + escapeHtml(s.ville) + '</div><div style="margin-top:4px;font-size:12px;color:' + (s.type==='SURVEILLANT'?'var(--blue)':'var(--rescue)') + ';font-weight:600">' + escapeHtml(s.type) + '</div><div class="btn-nav" style="margin-top:10px"><button class="btn btn-green btn-sm" onclick="onPinContinue()">' + btnLabel + ' \u25B6</button></div></div>';
        } else {
          identified = '<div class="card" style="margin-top:12px;text-align:center;border-color:var(--red)"><div class="badge badge-red" style="margin-bottom:6px">\u2717 INCONNU</div><div class="name" style="color:var(--red)">Code ' + escapeHtml(state.pin) + ' non reconnu</div></div>';
        }
      }
      var nums = [1,2,3,4,5,6,7,8,9,'',0,'\u232B'].map(function(d){
        if(d === '') return '<button disabled style="visibility:hidden"></button>';
        if(d === '\u232B') return '<button onclick="V6Engine.setState({pin:V6Engine.getState().pin.slice(0,-1)})" aria-label="Effacer">\u232B</button>';
        return '<button onclick="V6Engine.handlePin(\'' + d + '\')">' + d + '</button>';
      }).join('');
      var title = isInitialLogin ? '\uD83D\uDEE1\uFE0F CONNEXION' : 'IDENTIFIANT SAUVETEUR';
      var sub = isInitialLogin ? 'Entrez votre code VOLO pour acc\u00E9der' : 'Entrez votre code PIN 4 chiffres';
      return (isInitialLogin ? '' : '<button class="top-back" onclick="V6Engine.setState({step:0,photoMode:false,kmMode:false,gainsMode:false})">\u25C0 RETOUR</button>') +
        '<h2>' + title + '</h2><p style="font-size:14px;color:var(--muted);margin-bottom:14px;text-align:center">' + sub + '</p><div class="pin-row">' + dots + '</div><div class="numpad">' + nums + '</div>' + identified;
    },

    toggleRemorque: function(id) {
      var cur = state.remorques.slice();
      var idx = cur.indexOf(id);
      if(idx >= 0) cur.splice(idx, 1); else cur.push(id);
      this.setState({remorques: cur});
    },

    renderRemorque: function() {
      var camions = REMORQUES.filter(function(r){ return r.id.startsWith('REM-PU'); });
      var trailers = REMORQUES.filter(function(r){ return r.id.startsWith('REM-TR'); });
      var selCamion = state.remorques.find(function(id){ return id.startsWith('REM-PU'); }) || '';
      var selTrailer = state.remorques.find(function(id){ return id.startsWith('REM-TR'); }) || '';
      return '<button class="top-back" onclick="V6Engine.setState({step:0})">\u25C0 RETOUR</button>' +
        this.renderWizardProgress() +
        '<h2>V\u00C9HICULE</h2><p style="font-size:13px;color:var(--muted);margin-bottom:16px;text-align:center">S\u00E9lectionne camion et/ou trailer</p>' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;letter-spacing:2px;color:var(--rescue);margin-bottom:8px">\uD83D\uDE9B CAMION</div>' +
        '<div class="vehicle-grid" style="margin-bottom:16px">' + camions.map(function(r){ return '<div class="veh-card ' + (selCamion===r.id?'selected':'') + '" onclick="_setVehicleCamion(\'' + (selCamion===r.id?'':r.id) + '\')"><div class="veh-card-icon">\uD83D\uDE9B</div><div class="veh-card-name">' + r.name + '</div><div class="veh-card-sub">' + (r.plaque||r.sub||'') + '</div>' + (selCamion===r.id?'<span class="check" style="position:absolute;top:8px;right:10px">\u2713</span>':'') + '</div>'; }).join('') + '</div>' +
        '<div style="font-family:\'Oswald\',sans-serif;font-size:11px;letter-spacing:2px;color:var(--gold);margin-bottom:8px">\uD83D\uDE9C TRAILER</div>' +
        '<div class="vehicle-grid" style="margin-bottom:16px">' + trailers.map(function(r){ return '<div class="veh-card ' + (selTrailer===r.id?'selected':'') + '" onclick="_setVehicleTrailer(\'' + (selTrailer===r.id?'':r.id) + '\')"><div class="veh-card-icon">\uD83D\uDE9C</div><div class="veh-card-name">' + r.name + '</div><div class="veh-card-sub">' + (r.sub||'') + '</div>' + (selTrailer===r.id?'<span class="check" style="position:absolute;top:8px;right:10px">\u2713</span>':'') + '</div>'; }).join('') + '</div>' +
        '<button class="btn btn-outline btn-sm" style="margin-bottom:12px" onclick="showAddModal(\'remorque\')">+ AJOUTER UN V\u00C9HICULE</button>' +
        '<div style="padding-bottom:70px"><button class="btn btn-sm" style="background:var(--card);border:1px solid var(--border);color:var(--muted)" onclick="V6Engine.setState({remorques:[],step:3})">SANS V\u00C9HICULE \u25B6</button></div>' +
        (state.remorques.length ? '<button class="wizard-continue-btn" onclick="V6Engine.setState({step:3})">CONTINUER \u25B6</button>' : '');
    },

    renderDepot: function() {
      return '<button class="top-back" onclick="V6Engine.setState({step:2,scanned:[],sceaux:{}})">\u25C0 RETOUR</button>' +
        this.renderWizardProgress() +
        '<h2>D\u00C9P\u00D4T D\'ORIGINE</h2>' +
        DEPOTS.map(function(d){ return '<div class="card ' + (state.depot===d.id?'selected':'') + '" onclick="V6Engine.setState({depot:\'' + d.id + '\'})"><div style="display:flex;align-items:center;justify-content:space-between"><div><div class="name">\uD83D\uDCCD ' + d.name + '</div><div class="sub">' + d.region + '</div></div>' + (state.depot===d.id?'<span class="check">\u2713</span>':'') + '</div></div>'; }).join('') +
        '<button class="btn btn-outline btn-sm" style="margin-bottom:12px" onclick="showAddModal(\'depot\')">+ AJOUTER UN D\u00C9P\u00D4T</button>' +
        (state.depot ? '<button class="wizard-continue-btn" onclick="V6Engine.setState({step:4})">CONTINUER \u25B6</button>' : '');
    },

    renderDest: function() {
      var escapeHtml = V6Data.escapeHtml;
      return '<button class="top-back" onclick="V6Engine.setState({step:3})">\u25C0 RETOUR</button>' +
        this.renderWizardProgress() +
        '<h2>DESTINATION</h2>' +
        DESTINATIONS.map(function(d){ return '<div class="card ' + (state.dest===d.id?'selected':'') + '" onclick="loadTerrainContact(\'' + d.id + '\');V6Engine.setState({dest:\'' + d.id + '\'})"><div style="display:flex;align-items:center;justify-content:space-between"><div><div class="name">\uD83C\uDFAF ' + d.name + '</div><div class="sub">' + d.region + '</div></div>' + (state.dest===d.id?'<span class="check">\u2713</span>':'') + '</div></div>'; }).join('') +
        '<button class="btn btn-outline btn-sm" style="margin-bottom:12px" onclick="showAddModal(\'destination\')">+ AJOUTER UNE DESTINATION</button>' +
        (state.dest ? '<div class="card" style="border-color:var(--rescue);padding:14px;margin-top:6px"><div style="font-family:\'Oswald\',sans-serif;font-size:12px;letter-spacing:2px;color:var(--rescue);margin-bottom:10px">\uD83D\uDCCB D\u00C9TAILS MISSION</div><input type="text" placeholder="\uD83D\uDCCB Num\u00E9ro de projet / contrat" value="' + escapeHtml(state.numProjet) + '" oninput="V6Engine.setField(\'numProjet\',this.value)" style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:\'Inter\',sans-serif;margin-bottom:8px;outline:none"><div style="font-family:\'Oswald\',sans-serif;font-size:11px;letter-spacing:2px;color:var(--gold);margin-bottom:8px;margin-top:6px">\uD83D\uDC64 CONTACT TERRAIN</div><input type="text" placeholder="\uD83D\uDC64 Nom et pr\u00E9nom" value="' + escapeHtml(state.personneRessource) + '" oninput="V6Engine.setField(\'personneRessource\',this.value)" style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:\'Inter\',sans-serif;margin-bottom:8px;outline:none"><input type="tel" placeholder="\uD83D\uDCDE Num\u00E9ro de t\u00E9l\u00E9phone" value="' + escapeHtml(state.personneRessourceTel||'') + '" oninput="V6Engine.setField(\'personneRessourceTel\',this.value)" style="width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:\'Inter\',sans-serif;margin-bottom:8px;outline:none"></div>' : '') +
        (state.dest ? '<button class="wizard-continue-btn" onclick="saveTerrainContact();V6Engine.setState({step:5})">CONTINUER \u25B6</button>' : '');
    },

    renderSauvs: function() {
      var escapeHtml = V6Data.escapeHtml;
      var q = (state.searchQ||'').toLowerCase();
      var ft = state.filterType;
      var list = PERSONNEL;
      if(ft === 'sauv') list = list.filter(function(s){ return s.type === 'SAUVETEUR'; });
      else if(ft === 'surv') list = list.filter(function(s){ return s.type === 'SURVEILLANT'; });
      if(q) list = list.filter(function(s){ return s.name.toLowerCase().includes(q)||s.id.toLowerCase().includes(q)||s.volo.toLowerCase().includes(q)||s.ville.toLowerCase().includes(q); });
      var shown = list.slice(0, 30);
      var more = list.length - shown.length;
      var sCount = PERSONNEL.filter(function(p){ return p.type === 'SAUVETEUR'; }).length;
      var vCount = PERSONNEL.filter(function(p){ return p.type === 'SURVEILLANT'; }).length;
      return '<button class="top-back" onclick="V6Engine.setState({step:4})">\u25C0 RETOUR</button><h2>PERSONNEL</h2>' +
        '<input id="personnel-search-input" type="text" placeholder="\uD83D\uDD0D Rechercher nom, ID, ville..." value="' + (state.searchQ||'') + '" oninput="V6Engine.updatePersonnelResults(this.value)" style="width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:15px;font-family:\'Inter\',sans-serif;margin-bottom:10px;outline:none">' +
        '<div style="display:flex;gap:6px;margin-bottom:14px"><button class="btn-filter ' + (ft==='all'?'active':'') + '" onclick="V6Engine.setState({filterType:\'all\'})">TOUS (' + PERSONNEL.length + ')</button><button class="btn-filter ' + (ft==='sauv'?'active':'') + '" onclick="V6Engine.setState({filterType:\'sauv\'})">\uD83D\uDFE0 SAUV (' + sCount + ')</button><button class="btn-filter ' + (ft==='surv'?'active':'') + '" onclick="V6Engine.setState({filterType:\'surv\'})">\uD83D\uDD35 SURV (' + vCount + ')</button></div>' +
        (state.sauvs.length ? '<div style="font-size:13px;color:var(--green);letter-spacing:1px;margin-bottom:8px;text-align:center">\u2713 ' + state.sauvs.length + ' S\u00C9LECTIONN\u00C9(S)</div>' : '') +
        '<div id="personnel-results" class="wizard-content-with-fixed-btn" style="max-height:52vh;overflow-y:auto;-webkit-overflow-scrolling:touch">' +
        shown.map(function(s){ return '<div class="card ' + (state.sauvs.includes(s.id)?'selected':'') + '" onclick="V6Engine.toggleSauv(\'' + s.id + '\')"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="name">' + escapeHtml(s.name) + '</div><div class="sub">' + escapeHtml(s.id) + ' \u2022 ' + escapeHtml(s.ville||s.region) + '</div></div><div style="text-align:right"><div class="role" style="color:' + (s.type==='SURVEILLANT'?'var(--blue)':'var(--orange)') + '">' + escapeHtml(s.role) + '</div>' + (state.sauvs.includes(s.id)?'<span class="check">\u2713</span>':'') + '</div></div></div>'; }).join('') +
        (more > 0 ? '<div style="text-align:center;padding:12px;color:var(--muted);font-size:13px">+' + more + ' r\u00E9sultats \u2014 affinez votre recherche</div>' : '') +
        (list.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted)">Aucun r\u00E9sultat</div>' : '') +
        '</div>' +
        (state.sauvs.length ? '<button class="wizard-continue-btn" onclick="V6Engine.setState({step:6})">CONTINUER (' + state.sauvs.length + ') \u25B6</button>' : '');
    },

    renderScan: function() {
      var escapeHtml = V6Data.escapeHtml;
      var scannedIds = state.scanned.map(function(s){ return s.id; });
      var camMode = state.camMode !== false;
      var q = (state.itemQ || '').toLowerCase();
      var available = ITEMS.filter(function(i){ return !scannedIds.includes(i.id); });
      if(q) available = available.filter(function(i){ return ((i.name||'').toLowerCase().indexOf(q)>=0) || ((i.id||'').toLowerCase().indexOf(q)>=0) || ((i.cat||'').toLowerCase().indexOf(q)>=0) || ((i.desc||'').toLowerCase().indexOf(q)>=0); });
      if(state.catFilter && state.catFilter !== 'all') available = available.filter(function(i){ return i.cat === state.catFilter; });
      var isPickoff = state.mode === 'pickoff';
      var expected = isPickoff && window._pickoffExpected ? window._pickoffExpected : [];
      var expectedIds = expected.map(function(e){ return e.id; });
      if(isPickoff && expectedIds.length && !state._showAllPickoff){
        available = available.filter(function(i){ return expectedIds.includes(i.id); });
      } else if(isPickoff && expectedIds.length){
        available.sort(function(a,b){ return (expectedIds.includes(a.id)?0:1) - (expectedIds.includes(b.id)?0:1); });
      }
      var expectedScanned = expected.filter(function(e){ return scannedIds.includes(e.id); }).length;
      var html = '<button class="top-back" onclick="leaveScan(' + (state.mode==='pickoff'?2:5) + ')">\u25C0 RETOUR</button>';
      html += '<h2>' + (isPickoff ? 'RETOUR ITEMS' : 'S\u00C9LECTION ITEMS') + '</h2>';
      // Expected items panel for pickoff
      if(isPickoff && expected.length){
        html += '<div style="background:rgba(230,126,34,.1);border:1px solid var(--orange);border-radius:12px;padding:12px;margin-bottom:14px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<span style="font-family:\'Oswald\',sans-serif;font-size:13px;letter-spacing:2px;color:var(--orange)">\uD83D\uDCE6 ITEMS ATTENDUS</span>';
        html += '<span style="font-family:\'JetBrains Mono\',monospace;font-size:14px;font-weight:700;color:' + (expectedScanned===expected.length?'var(--green)':'var(--orange)') + '">' + expectedScanned + '/' + expected.length + '</span>';
        html += '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto">';
        var _egrp = {}; expected.forEach(function(e){ var k = e.name || e.id; var done = scannedIds.includes(e.id); if(!_egrp[k]) _egrp[k] = {total:0,done:0}; _egrp[k].total++; if(done) _egrp[k].done++; });
        Object.keys(_egrp).forEach(function(name){ var g = _egrp[name]; var allDone = g.done===g.total; var partial = g.done>0 && !allDone;
          html += '<span style="font-size:11px;padding:3px 8px;border-radius:6px;white-space:nowrap;' + (allDone ? 'background:rgba(39,174,96,.2);color:var(--green)' : partial ? 'background:rgba(230,126,34,.15);color:var(--orange)' : 'background:var(--card2);color:var(--muted)') + '">' + (allDone ? '\u2713 ' : partial ? g.done+'/'+g.total+' ' : '') + name + (g.total>1 ? ' <b>\u00D7'+g.total+'</b>' : '') + '</span>';
        });
        html += '</div>';
        if(expectedScanned===expected.length) html += '<div style="text-align:center;margin-top:8px;color:var(--green);font-weight:700;font-size:14px">\u2705 TOUS LES ITEMS RETOURN\u00C9S</div>';
        else if(expectedScanned===0) html += '<button class="btn btn-orange" onclick="scanAllExpected()" style="width:100%;margin-top:10px;padding:14px;font-size:16px">\uD83D\uDCE6 TOUT RETOURNER (' + expected.length + ' items)</button>';
        else html += '<button class="btn btn-orange" onclick="scanAllExpected()" style="width:100%;margin-top:10px;padding:12px;font-size:14px">\uD83D\uDCE6 RETOURNER LES ' + (expected.length-expectedScanned) + ' RESTANTS</button>';
        html += '</div>';
      }
      // Scan mode tabs
      html += '<div style="display:flex;gap:10px;margin-bottom:14px">';
      html += '<button class="btn btn-sm ' + (state.scanMode==='live'?'btn-green':'') + '" style="flex:1;' + (state.scanMode==='live'?'':'background:var(--card);border:1px solid var(--border);color:var(--muted)') + '" onclick="setScanMode(\'live\')">\uD83D\uDCF7 LIVE</button>';
      html += '<button class="btn btn-sm ' + (state.scanMode==='manuel'?'btn-gold':'') + '" style="flex:1;' + (state.scanMode==='manuel'?'':'background:var(--card);border:1px solid var(--border);color:var(--muted)') + '" onclick="setScanMode(\'manuel\')">\u270B MANUEL</button>';
      html += '</div>';
      // Camera area or manual mode
      if(state.scanMode==='live' || (state.scanMode!=='photo' && state.scanMode!=='manuel' && camMode)){
        html += '<div id="qr-reader" style="border-radius:14px;overflow:hidden;border:2px solid var(--gold);margin-bottom:8px;position:relative"></div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
        html += '<p style="font-size:12px;color:var(--muted);margin:0;flex:1">\uD83D\uDCD0 Approche le QR code dans le cadre</p>';
        html += '<button onclick="swapCamera()" style="height:32px;padding:0 14px;border-radius:8px;border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.1);color:#3B82F6;font-size:18px;cursor:pointer;" title="Changer cam\u00E9ra">\uD83D\uDD04</button>';
        html += '</div>';
      } else {
        html += '<div class="scan-area" style="padding:16px;text-align:center"><div style="color:var(--gold);font-size:15px;margin-bottom:6px">\u270B MODE MANUEL</div><div style="color:var(--muted);font-size:13px">Touche un item dans la liste ci-dessous</div></div>';
      }
      // Scanned items display
      if(state.scanned.length){
        html += '<div style="background:var(--card);border:1px solid var(--green);border-radius:12px;padding:12px;margin-bottom:14px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<div style="font-family:\'Oswald\',sans-serif;font-size:13px;letter-spacing:2px;color:var(--green)">' + (isPickoff ? '\uD83D\uDCE5 ITEMS D\u00C9POS\u00C9S' : '\uD83D\uDCCB ITEMS SCANN\u00C9S') + '</div>';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--gold);font-weight:700">' + state.scanned.length + ' item' + (state.scanned.length>1?'s':'') + '</span>';
        html += '<button onclick="setVueItems(\'groupe\')" style="width:28px;height:28px;border-radius:6px;border:1px solid ' + (vueItemsMode==='groupe'?'var(--green)':'rgba(255,255,255,.15)') + ';background:' + (vueItemsMode==='groupe'?'rgba(39,174,96,.2)':'transparent') + ';color:' + (vueItemsMode==='groupe'?'var(--green)':'var(--muted)') + ';font-size:14px;cursor:pointer" title="Vue group\u00E9e">\u2B1B</button>';
        html += '<button onclick="setVueItems(\'liste\')" style="width:28px;height:28px;border-radius:6px;border:1px solid ' + (vueItemsMode==='liste'?'var(--green)':'rgba(255,255,255,.15)') + ';background:' + (vueItemsMode==='liste'?'rgba(39,174,96,.2)':'transparent') + ';color:' + (vueItemsMode==='liste'?'var(--green)':'var(--muted)') + ';font-size:14px;cursor:pointer" title="Vue liste">\u2630</button>';
        html += '</div></div>';
        html += '<div style="max-height:' + (vueItemsMode==='liste'?'400':'240') + 'px;overflow-y:auto">';
        if(vueItemsMode === 'liste'){
          state.scanned.forEach(function(item, idx){
            var _it = ITEMS.find(function(x){ return x.id===item.id; }) || {};
            var _serial = _it.serial || '';
            var _cat = _it.cat || '';
            var _caisse = typeof CAISSES !== 'undefined' ? CAISSES.find(function(c){ return (c.items_contenus||[]).includes(item.id); }) : null;
            var _caisseName = _caisse ? (_caisse.nom || _caisse.name) : '';
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;' + (idx<state.scanned.length-1?'border-bottom:1px solid rgba(39,174,96,.1)':'') + '">';
            html += '<span style="font-size:14px">' + (item.icon||'\uD83D\uDCE6') + '</span>';
            html += '<div style="flex:1;min-width:0">';
            html += '<div style="font-size:13px;color:var(--txt);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.name + '</div>';
            html += '<div style="font-size:11px;display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">';
            html += '<span style="color:var(--rescue);font-weight:600">' + item.id + '</span>';
            if(_serial) html += '<span style="color:var(--muted);font-family:JetBrains Mono,monospace;font-size:10px">S/N: ' + _serial + '</span>';
            if(_caisseName) html += '<span style="color:var(--gold);font-size:10px">\uD83D\uDCE6 ' + _caisseName + '</span>';
            if(_cat) html += '<span style="color:var(--muted);font-size:10px">' + _cat + '</span>';
            html += '</div></div>';
            html += '<button onclick="removeScannedItem(' + idx + ')" style="width:24px;height:24px;border-radius:50%;background:rgba(192,57,43,.2);border:1px solid rgba(192,57,43,.3);color:var(--red);font-size:12px;cursor:pointer;flex-shrink:0" aria-label="Retirer">\u2715</button>';
            html += '</div>';
          });
        } else {
          // Grouped view
          var _scanGroups = {}; var _scanOrder = [];
          state.scanned.forEach(function(item, idx){
            var k = item.name;
            if(!_scanGroups[k]){ _scanGroups[k] = {name:k, icon:item.icon||'\uD83D\uDCE6', count:0, items:[], couleur:item.couleur||'', cat:item.cat||'', hasNotes:false}; _scanOrder.push(k); }
            _scanGroups[k].count++;
            _scanGroups[k].items.push({idx:idx, id:item.id, serial:(ITEMS.find(function(x){return x.id===item.id;})||{}).serial||'', name:item.name, note:item.itemNote||''});
            if(item.itemNote) _scanGroups[k].hasNotes = true;
          });
          var esg = state._expandedScannedGroups || {};
          _scanOrder.forEach(function(k, gi){
            var g = _scanGroups[k];
            var _sc = typeof SAC_COLORS !== 'undefined' && g.cat ? SAC_COLORS[g.cat] : null;
            var _scBadge = _sc ? '<span style="display:inline-block;background:'+_sc.hex+';color:#000;font-weight:700;font-size:9px;padding:1px 5px;border-radius:6px;margin-left:4px;vertical-align:middle">'+_sc.name+'</span>' : '';
            var _scBdr = _sc ? 'border-left:3px solid '+_sc.hex+';padding-left:5px;' : '';
            var cdot = g.couleur && typeof COULEUR_HEX !== 'undefined' && COULEUR_HEX[g.couleur] ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+COULEUR_HEX[g.couleur]+';margin-right:4px;vertical-align:middle"></span>' : '';
            var isExp = !!esg[k];
            var safeK = k.replace(/'/g, "\\'");
            html += '<div style="' + _scBdr + (gi<_scanOrder.length-1?'border-bottom:1px solid rgba(39,174,96,.1)':'') + '">';
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer" onclick="toggleScannedGroup(\'' + safeK + '\')">';
            html += '<span style="font-size:14px">' + g.icon + '</span>';
            html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--green);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + cdot + g.name + (g.count>1 ? ' <b style="color:var(--gold)">\u00D7' + g.count + '</b>' : '') + _scBadge + '</div></div>';
            if(g.count>1) html += '<span style="font-size:10px;color:var(--muted);transition:transform .2s;transform:rotate(' + (isExp?'180':'0') + 'deg)">\u25BC</span>';
            html += '<button onclick="event.stopPropagation();removeScannedItem(' + g.items[g.items.length-1].idx + ')" style="width:24px;height:24px;border-radius:50%;background:rgba(192,57,43,.2);border:1px solid rgba(192,57,43,.3);color:var(--red);font-size:12px;cursor:pointer;flex-shrink:0" aria-label="Retirer">\u2715</button>';
            html += '</div>';
            if(isExp && g.count>1){
              html += '<div style="padding:0 0 6px 28px">';
              g.items.forEach(function(it){
                html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(39,174,96,.06);font-size:12px">';
                html += '<span style="color:var(--green)">\u2713</span>';
                html += '<div style="flex:1;min-width:0"><span style="color:var(--txt);font-weight:500">' + it.id + '</span>' + (it.serial ? ' <span style="color:var(--muted);font-family:JetBrains Mono,monospace;font-size:10px">S/N: ' + it.serial + '</span>' : '') + '</div>';
                html += '<button onclick="removeScannedItem(' + it.idx + ')" style="width:20px;height:20px;border-radius:50%;background:rgba(192,57,43,.15);border:1px solid rgba(192,57,43,.2);color:var(--red);font-size:10px;cursor:pointer;flex-shrink:0">\u2715</button>';
                html += '</div>';
              });
              html += '</div>';
            } else if(isExp && g.count===1){
              var it2 = g.items[0];
              html += '<div style="padding:0 0 6px 28px;font-size:12px;color:var(--muted)"><span style="font-family:JetBrains Mono,monospace">' + it2.id + (it2.serial ? ' \u00B7 S/N: ' + it2.serial : '') + '</span></div>';
            }
            html += '</div>';
          });
        }
        html += '</div></div>';
      }
      // Sacs / Groups section
      html += '<h3 style="margin-top:14px">' + (isPickoff && expectedIds.length ? '\uD83D\uDCE6 RETOUR PAR SAC' : '\uD83D\uDCE6 SACS / GROUPES') + '</h3>';
      // Search input
      html += '<input id="item-search-input" type="text" placeholder="\uD83D\uDD0D Rechercher caisse, item, ID..." value="' + escapeHtml(state.itemQ||'') + '" oninput="updateItemResults(this.value)" style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:\'Inter\',sans-serif;margin-bottom:10px;outline:none">';
      // Groups listing (for pick-on)
      if(!isPickoff){
        var groups = (typeof GROUPS !== 'undefined' ? GROUPS : []).filter(function(g){
          if(g.parent_groupe) return false;
          if(!q) return true;
          var grpName = (g.nom||g.name||'').toLowerCase();
          if(grpName.indexOf(q)>=0 || g.id.toLowerCase().indexOf(q)>=0) return true;
          var itemIds2 = g.items_contenus||g.items||[];
          return itemIds2.some(function(id){ var it = ITEMS.find(function(x){ return x.id===id; }); return it && ((it.name.toLowerCase().indexOf(q)>=0) || (it.id.toLowerCase().indexOf(q)>=0)); });
        }).sort(function(a,b){ return (b.items_contenus||b.items||[]).length - (a.items_contenus||a.items||[]).length; });
        html += '<div class="wizard-content-with-fixed-btn" style="max-height:50vh;overflow-y:auto;-webkit-overflow-scrolling:touch">';
        if(!groups.length){
          html += '<div style="text-align:center;padding:16px;color:var(--muted)">' + (q ? 'Aucun r\u00E9sultat' : 'Aucun sac/caisse') + '</div>';
        } else {
          groups.forEach(function(grp2){
            var grpItems2 = grp2.items_contenus || grp2.items || [];
            var grpScanned = grpItems2.filter(function(id){ return scannedIds.includes(id); }).length;
            var allDone = grpScanned === grpItems2.length;
            var pct = grpItems2.length ? Math.round(grpScanned/grpItems2.length*100) : 0;
            var grpName2 = grp2.nom || grp2.name || grp2.id;
            var isExpanded = state._expandedGroup === grp2.id;
            html += '<div style="border:1px solid ' + (allDone?'var(--green)':grpScanned>0?'var(--orange)':'var(--border)') + ';border-radius:12px;margin-bottom:8px;overflow:hidden;' + (allDone?'background:rgba(39,174,96,.06)':grpScanned>0?'background:rgba(230,126,34,.06)':'') + '">';
            html += '<div style="display:flex;align-items:center;padding:12px 14px;cursor:pointer;gap:8px" onclick="V6Engine.setState({_expandedGroup:' + (isExpanded ? 'null' : "'" + grp2.id + "'") + '})">';
            html += '<span style="font-size:22px">' + (grp2.icon||'\uD83D\uDCE6') + '</span>';
            html += '<div style="flex:1"><div style="font-size:15px;font-weight:700;color:' + (allDone?'var(--green)':'var(--gold)') + '">' + grpName2 + '<span class="tab-arrow' + (isExpanded?' open':'') + '">\u25BC</span></div>';
            html += '<div style="font-size:11px;color:var(--muted);font-family:JetBrains Mono">' + grp2.id + ' \u2022 ' + grpItems2.length + ' items</div>';
            if(grpScanned>0) html += '<div style="margin-top:4px;height:3px;background:var(--card2);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (allDone?'var(--green)':'var(--orange)') + ';border-radius:2px"></div></div>';
            html += '</div>';
            html += (allDone ? '<span class="badge badge-green">\u2705 FAIT</span>' : '<button class="badge badge-gold" style="cursor:pointer;border:none;font-size:12px;padding:6px 12px" onclick="event.stopPropagation();scanGroup(typeof GROUPS!==\'undefined\'&&GROUPS.find(function(g){return g.id===\'' + grp2.id + '\'}))">\u2795 AJOUTER</button>');
            html += '</div>';
            if(isExpanded){
              var itemsByName = {};
              grpItems2.forEach(function(id){ var it = ITEMS.find(function(x){ return x.id===id; }); if(it){ var k2 = it.name; if(!itemsByName[k2]) itemsByName[k2] = {icon:it.icon||'\uD83D\uDCE6',count:0,scanned:0}; itemsByName[k2].count++; if(scannedIds.includes(id)) itemsByName[k2].scanned++; } });
              html += '<div style="padding:0 12px 12px;border-top:1px solid var(--border)"><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">';
              Object.keys(itemsByName).forEach(function(name2){ var info = itemsByName[name2]; var done2 = info.scanned === info.count;
                html += '<span style="font-size:11px;padding:3px 8px;border-radius:6px;white-space:nowrap;' + (done2 ? 'background:rgba(39,174,96,.15);color:var(--green)' : 'background:var(--card2);color:var(--muted)') + '">' + info.icon + ' ' + name2 + (info.count>1 ? ' <b>\u00D7' + info.count + '</b>' : '') + '</span>';
              });
              html += '</div></div>';
            }
            html += '</div>';
          });
        }
        html += '</div>';
      }
      // Continue button
      if(state.scanned.length >= 1){
        html += '<button class="wizard-continue-btn" onclick="V6Scanner.stopQrScanner();V6Engine.setState({step:7,checklist:{}})">TERMINER (' + state.scanned.length + ') \u25B6</button>';
      }
      return html;
    },

    getChecklistItems: function(isPickoff) {
      return isPickoff ? CHECKLIST_PICKOFF : CHECKLIST_PICKON;
    },

    toggleChecklist: function(id) {
      var cl = Object.assign({}, state.checklist);
      cl[id] = !cl[id];
      this.setState({checklist: cl});
    },

    isChecklistComplete: function(isPickoff) {
      var items = this.getChecklistItems(isPickoff);
      return items.every(function(c){ return !!state.checklist[c.id]; });
    },

    renderPreChecklist: function(isPickoff) {
      var items = this.getChecklistItems(isPickoff);
      var done = items.filter(function(c){ return !!state.checklist[c.id]; }).length;
      var total = items.length;
      var allDone = done === total;
      var html = '<div class="checklist-wrap" style="border-color:' + (allDone?'var(--green)':'var(--border)') + '">';
      html += '<div class="checklist-title">' + (isPickoff?'\uD83D\uDCCB CHECKLIST RETOUR':'\uD83D\uDCCB CHECKLIST PR\u00C9-D\u00C9PART') + ' \u2014 ' + done + '/' + total + '</div>';
      items.forEach(function(c){
        var checked = !!state.checklist[c.id];
        html += '<div class="checklist-item' + (checked?' checked':'') + '" onclick="V6Engine.toggleChecklist(\'' + c.id + '\')">';
        html += '<div class="checklist-box">' + (checked?'\u2713':'') + '</div>';
        html += '<div class="checklist-label">' + c.label + '</div>';
        html += '</div>';
      });
      if(!allDone) html += '<div class="checklist-warn">\u26A0\uFE0F Compl\u00E9tez la checklist pour confirmer</div>';
      html += '</div>';
      return html;
    },

    renderConfirm: function() {
      var escapeHtml = V6Data.escapeHtml;
      var isPickoff = state.mode === 'pickoff';
      var depot = DEPOTS.find(function(d){ return d.id === state.depot; });
      var dest = DESTINATIONS.find(function(d){ return d.id === state.dest; });
      var remNames = state.remorques && state.remorques.length ? state.remorques.map(function(id){ var r = REMORQUES.find(function(x){return x.id===id;}); return r ? r.name : id; }).join(' + ') : 'Aucun';
      var sauvNames = state.sauvs.map(function(id){ var s = SAUVETEURS.find(function(x){return x.id===id;}); return s ? s.name : id; }).join(', ');
      var expected = isPickoff && window._pickoffExpected ? window._pickoffExpected : [];
      var expectedIds = expected.map(function(e){ return e.id; });
      var scannedIds = state.scanned.map(function(s){ return s.id; });
      var expectedScanned = expected.filter(function(e){ return scannedIds.includes(e.id); }).length;
      var html = '<button class="top-back" onclick="V6Engine.setState({step:6})">\u25C0 MODIFIER</button>';
      html += '<h2>' + (isPickoff ? 'CONFIRMATION RETOUR' : 'CONFIRMATION') + '</h2>';
      // Pick-off expected items banner
      if(isPickoff){
        html += '<div style="background:rgba(230,126,34,.1);border:1px solid var(--orange);border-radius:12px;padding:12px;margin-bottom:14px;text-align:center">';
        html += '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;letter-spacing:2px;color:var(--orange);margin-bottom:4px">\uD83D\uDCE6 RETOUR MAT\u00C9RIEL (PICK-OFF)</div>';
        html += '<div style="font-size:13px;color:var(--muted)">' + expectedScanned + '/' + expected.length + ' items attendus scann\u00E9s' + (expectedScanned<expected.length ? ' \u2014 <span style="color:var(--red)">\u26A0\uFE0F incomplet</span>' : ' \u2014 <span style="color:var(--green)">\u2705 complet</span>') + '</div>';
        html += '</div>';
        if(expectedScanned < expected.length){
          html += '<div style="background:rgba(192,57,43,.08);border:2px solid var(--red);border-radius:12px;padding:14px;margin-bottom:14px">';
          html += '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;letter-spacing:2px;color:var(--red);margin-bottom:8px;text-align:center">\u26A0\uFE0F ' + (expected.length-expectedScanned) + ' ITEM' + (expected.length-expectedScanned>1?'S':'') + ' MANQUANT' + (expected.length-expectedScanned>1?'S':'') + '</div>';
          html += '<div style="max-height:120px;overflow-y:auto">';
          expected.filter(function(e){ return !scannedIds.includes(e.id); }).forEach(function(e){
            var it = ITEMS.find(function(i){ return i.id===e.id; });
            html += '<div style="font-size:12px;color:var(--muted);padding:3px 0;border-bottom:1px solid rgba(192,57,43,.1)"><span style="font-weight:600;color:var(--red)">' + (it?it.name:e.name||e.id) + '</span><span style="font-family:JetBrains Mono,monospace;font-size:10px;margin-left:6px;color:var(--muted2)">' + e.id + (it&&it.serial?' \u2022 S/N: '+it.serial:'') + '</span></div>';
          });
          html += '</div>';
          html += '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">Une note sera demand\u00E9e \u00E0 la validation</div>';
          html += '</div>';
        }
      }
      // Confirm block
      html += '<div class="confirm-block">';
      html += '<div class="confirm-label">V\u00C9HICULE</div><div style="font-weight:600;font-size:16px">' + (remNames||'Aucun v\u00E9hicule') + '</div>';
      html += '<div class="confirm-label">D\u00C9P\u00D4T</div><div style="font-weight:600;font-size:16px">' + (depot?depot.name:'\u2014') + '</div>';
      html += '<div class="confirm-label">DESTINATION</div><div style="font-weight:600;font-size:16px">' + (dest?dest.name:'\u2014') + '</div>';
      if(state.numProjet) html += '<div class="confirm-label">N\u00B0 PROJET</div><div style="font-weight:600;font-size:15px;color:var(--rescue)">' + escapeHtml(state.numProjet) + '</div>';
      if(state.personneRessource) html += '<div class="confirm-label">CONTACT TERRAIN</div><div style="font-size:15px">' + escapeHtml(state.personneRessource) + (state.personneRessourceTel?' \u2022 \uD83D\uDCDE ' + escapeHtml(state.personneRessourceTel):'') + '</div>';
      if(state.detailsJob) html += '<div class="confirm-label">D\u00C9TAILS JOB</div><div style="font-size:14px;color:var(--muted);white-space:pre-wrap">' + escapeHtml(state.detailsJob) + '</div>';
      html += '<div class="confirm-label">SAUVETEUR(S)</div><div style="font-size:15px">' + escapeHtml(sauvNames) + '</div>';
      html += '<div class="confirm-label">ITEMS (' + state.scanned.length + ')</div>';
      html += '<div style="margin-top:12px"><div class="confirm-label">NOTE (optionnelle)</div>';
      html += '<textarea id="confirm-note" placeholder="Note pour cette transaction..." rows="2" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-family:Inter,sans-serif;font-size:14px;resize:vertical">' + (state.txNote||'') + '</textarea></div>';
      html += '</div>';
      html += this.renderPreChecklist(isPickoff);
      html += '<button class="btn ' + (isPickoff?'btn-orange':'btn-green') + '" onclick="V6Engine.doValidation()" id="btnConfirmTx" style="font-size:20px;padding:18px" ' + (this.isChecklistComplete(isPickoff)?'':'disabled') + '>\uD83E\uDD85 ' + (isPickoff?'CONFIRMER LE RETOUR':'ENREGISTRER') + '</button>';
      return html;
    },

    removeScannedItem: function(idx) {
      state.scanned.splice(idx, 1);
      if(state.scanned.length === 0){ this.setState({step:6}); V6UI.showToast('\u26A0\uFE0F Aucun item \u2014 retour au scan', 'err'); }
      else { this.render(); }
    },

    toggleScannedGroup: function(groupKey) {
      var esg = Object.assign({}, state._expandedScannedGroups || {});
      esg[groupKey] = !esg[groupKey];
      state._expandedScannedGroups = esg;
      this.render();
    },

    showTxDetail: function(txId) {
      window._txDetailId = txId;
      this.setState({showModal: 'txDetail'});
    },

    syncTxToFirestore: function(payload) {
      try{
        if(!firebaseDB) return;
        var userId = payload.sauveteur_id || 'unknown';
        var txRef = firebaseDB.ref('transactions/' + userId + '/' + payload.id);
        txRef.set(payload);
      }catch(e){ console.error('syncTxToFirestore', e); }
    },

    renderValidation: function() {
      var canCancel = cancelSeconds > 0 && lastPayload;
      var m = Math.floor(cancelSeconds/60); var s = cancelSeconds%60;
      return '<div style="padding-top:10px"><div style="text-align:center"><h2 style="font-size:24px;margin-bottom:4px">' + (state.mode==='pickon'?'PICK-ON':'PICK-OFF') + ' COMPL\u00C9T\u00C9!</h2><p style="color:var(--green);font-size:15px;margin-bottom:16px">Transaction enregistr\u00E9e avec succ\u00E8s</p></div>' +
        (canCancel ? '<button id="cancel-btn" class="btn btn-outline" style="border-color:var(--red);color:var(--red);font-size:15px" onclick="V6Engine.cancelTransaction()">ANNULER (' + m + ':' + String(s).padStart(2,'0') + ' restant)</button>' : '<div style="text-align:center;color:var(--muted);font-size:13px;margin-bottom:8px">\u23F1 D\u00E9lai d\'annulation expir\u00E9</div>') +
        '<button class="btn btn-gold" style="margin-top:10px;font-size:18px;padding:18px" onclick="resetAll()">NOUVELLE TRANSACTION</button></div>';
    },

    renderModal: function() {
      var escapeHtml = V6Data.escapeHtml;
      var content = '';
      if(state.showModal === 'urgence'){
        content = '<h3>\uD83D\uDEA8 SIGNALER UNE URGENCE</h3>' +
          '<p style="font-size:14px;color:var(--muted);margin-bottom:12px;text-align:center">Signaler un \u00E9quipement critique manquant</p>' +
          '<select onchange="V6Engine.getState().urgenceType=this.value"><option' + (state.urgenceType==='D\u00E9tecteur de gaz manquant'?' selected':'') + '>D\u00E9tecteur de gaz manquant</option><option' + (state.urgenceType==='Sac param\u00E9dic manquant'?' selected':'') + '>Sac param\u00E9dic manquant</option><option' + (state.urgenceType==='Harnais d\u00E9fectueux'?' selected':'') + '>Harnais d\u00E9fectueux</option><option' + (state.urgenceType==='Autre'?' selected':'') + '>Autre</option></select>' +
          '<textarea rows="3" placeholder="D\u00E9tails suppl\u00E9mentaires..." oninput="V6Engine.getState().urgenceNote=this.value">' + escapeHtml(state.urgenceNote||'') + '</textarea>' +
          '<button class="btn btn-red btn-sm" onclick="sendUrgence()">ENVOYER L\'ALERTE</button>';
      } else if(state.showModal === 'scanGroupConfirm' && window._pendingScanGroup){
        var sg = window._pendingScanGroup;
        content = '<h3 style="color:var(--goldL)">\uD83D\uDCE6 ' + escapeHtml(sg.grpName) + '</h3>' +
          '<div style="text-align:left;padding:10px 14px;background:var(--card2);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;font-size:13px;line-height:1.8">' +
            '<div><span style="color:var(--muted)">Items dans la caisse :</span> <strong>' + sg.grpItems.length + '</strong></div>' +
            '<div><span style="color:var(--muted)">\u00C0 ajouter :</span> <strong style="color:var(--green)">' + sg.newItems.length + '</strong></div>' +
            (sg.alreadyCount ? '<div><span style="color:var(--muted)">D\u00E9j\u00E0 scann\u00E9s :</span> <strong>' + sg.alreadyCount + '</strong></div>' : '') +
          '</div>';
        if(sg.problemes && sg.problemes.length > 0){
          var _probGroups = {};
          sg.problemes.forEach(function(p){ var k = p.name + '|||' + (p.etat||'?'); if(!_probGroups[k]) _probGroups[k] = {name:p.name, etat:p.etat||'?', count:0, couleur:p.couleur||''}; _probGroups[k].count++; });
          content += '<div style="padding:10px 14px;background:rgba(230,126,34,.08);border:1px solid rgba(230,126,34,.25);border-radius:10px;margin-bottom:12px;text-align:left">' +
            '<div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:6px">\u26A0\uFE0F ' + sg.problemes.length + ' item(s) \u00E0 surveiller</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:30vh;overflow-y:auto">';
          Object.keys(_probGroups).forEach(function(k2){ var g2 = _probGroups[k2]; var cdot = g2.couleur && typeof COULEUR_HEX!=='undefined' && COULEUR_HEX[g2.couleur] ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+COULEUR_HEX[g2.couleur]+';margin-right:3px;vertical-align:middle"></span>' : '';
            content += '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(230,126,34,.12);color:var(--txt);white-space:nowrap">' + cdot + escapeHtml(g2.name) + (g2.count>1 ? ' <b style="color:var(--orange)">\u00D7' + g2.count + '</b>' : '') + '</span>';
          });
          content += '</div></div>';
        }
        content += '<button class="btn btn-green btn-sm" onclick="_scanGroupCheckMissing()">AJOUTER TOUT</button>';
      } else if(state.showModal === 'scanGroupMissing' && window._pendingScanGroup){
        var sg2 = window._pendingScanGroup;
        var missing = window._pendingScanGroupMissing || [];
        var missingNames = missing.map(function(id){ var it = ITEMS.find(function(i){ return i.id===id; }); return it ? it.name + ' (' + id + ')' : id; });
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F Items manquants</h3>' +
          '<div style="text-align:left;padding:10px 14px;background:rgba(230,126,34,.08);border:1px solid rgba(230,126,34,.25);border-radius:10px;margin-bottom:12px;max-height:30vh;overflow-y:auto">' +
            '<div style="font-size:12px;font-weight:600;color:var(--orange);margin-bottom:6px">' + missing.length + ' item(s) manquant(s) dans ' + escapeHtml(sg2.grpName) + '</div>' +
            missingNames.map(function(n){ return '<div style="font-size:11px;color:var(--muted);margin-bottom:3px">\u2022 ' + escapeHtml(n) + '</div>'; }).join('') +
          '</div>' +
          '<textarea id="missing-note" rows="3" placeholder="Note obligatoire \u2014 raison des items manquants..." style="width:100%;margin-bottom:10px;background:var(--card2);color:var(--txt);border:1px solid var(--border);border-radius:10px;padding:10px;font-family:Inter,sans-serif;font-size:13px;resize:none"></textarea>' +
          '<button class="btn btn-gold btn-sm" onclick="(function(){var n=document.getElementById(\'missing-note\');if(!n||!n.value.trim()){showToast(\'\u274C Note obligatoire\',\'err\');return;}_scanGroupExecute(n.value.trim())})()">CONFIRMER</button>';
      } else if(state.showModal === 'scanUnexpected' && window._pendingScanItem){
        var si = window._pendingScanItem;
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F Item inattendu</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:12px;text-align:center"><strong style="color:var(--txt)">' + escapeHtml(si.stamped.name) + '</strong> n\'\u00E9tait PAS dans le d\u00E9ploiement original.</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="window._pendingScanItem=null;V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-gold btn-sm" style="flex:1" onclick="var s=window._pendingScanItem;window._pendingScanItem=null;_finalizeScanItem(s.stamped,s.sceaux,s.isPickoff)">SCANNER</button>' +
          '</div>';
      } else if(state.showModal === 'scanSurveiller' && window._pendingScanItem){
        var si2 = window._pendingScanItem;
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F Item en surveillance</h3>' +
          '<div style="text-align:left;padding:10px 14px;background:rgba(230,126,34,.08);border:1px solid rgba(230,126,34,.25);border-radius:10px;margin-bottom:12px">' +
            '<div style="font-size:14px;font-weight:600;color:var(--txt)">' + escapeHtml(si2.stamped.name) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + escapeHtml(si2.stamped.id) + (si2.stamped.notes ? ' \u2014 ' + escapeHtml(si2.stamped.notes) : '') + '</div>' +
          '</div>' +
          '<textarea id="surv-note" rows="2" placeholder="Note obligatoire \u2014 raison de l\'utilisation..." style="width:100%;margin-bottom:10px;background:var(--card2);color:var(--txt);border:1px solid var(--border);border-radius:10px;padding:10px;font-family:Inter,sans-serif;font-size:13px;resize:none"></textarea>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="window._pendingScanItem=null;V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-gold btn-sm" style="flex:1" onclick="(function(){var n=document.getElementById(\'surv-note\');if(!n||!n.value.trim()){showToast(\'\u274C Note obligatoire\',\'err\');return;}var s=window._pendingScanItem;s.stamped.itemNote=n.value.trim();window._pendingScanItem=null;_finalizeScanItem(s.stamped,s.sceaux,s.isPickoff)})()">CONFIRMER</button>' +
          '</div>';
      } else if(state.showModal === 'leaveScan'){
        content = '<h3 style="color:var(--red)">\u26A0\uFE0F Quitter le scan?</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">Tu as <strong style="color:var(--txt)">' + state.scanned.length + ' item' + (state.scanned.length>1?'s':'') + '</strong> scann\u00E9' + (state.scanned.length>1?'s':'') + '.<br>Quitter sans sauvegarder?</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null})">RESTER</button>' +
            '<button class="btn btn-sm" style="flex:1;background:var(--red);color:#fff" onclick="V6Scanner.stopQrScanner();V6Engine.setState({step:window._leaveScanTarget||0,scanned:[],sceaux:{},showModal:null})">QUITTER</button>' +
          '</div>';
      } else if(state.showModal === 'pickOnBlocked'){
        var _poSince = '';
        try{ var _poTxs = V6Data.getMyActivePickOns(); if(_poTxs.length){ _poSince = new Date(_poTxs[_poTxs.length-1].timestamp).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}); } }catch(e){}
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F PICK-ON D\u00C9J\u00C0 ACTIF</h3>' +
          '<div style="text-align:center;padding:10px 14px;background:rgba(230,126,34,.08);border:1px solid rgba(230,126,34,.25);border-radius:10px;margin-bottom:12px">' +
            '<div style="font-size:28px;font-weight:800;color:var(--rescue)">' + (window._pickOnActiveCount||1) + '</div>' +
            '<div style="font-size:11px;color:var(--muted)">d\u00E9ploiement' + ((window._pickOnActiveCount||1)>1?'s':'') + ' en cours</div>' +
            '<div style="font-size:13px;color:var(--txt);margin-top:4px">' + (window._pickOnActiveItems||0) + ' items dehors</div>' +
            (_poSince ? '<div style="font-size:12px;color:var(--rescue);margin-top:6px;font-weight:600">Pick On actif depuis ' + _poSince + '</div>' : '') +
          '</div>' +
          '<p style="font-size:12px;color:var(--muted);margin-bottom:14px;text-align:center">Un Pick On est d\u00E9j\u00E0 actif. Voulez-vous en cr\u00E9er un nouveau ?</p>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<button class="btn btn-gold btn-sm" onclick="V6Engine.setState({showModal:null});startPickOff()">FAIRE LE PICK-OFF</button>' +
            '<button class="btn btn-sm" style="background:rgba(230,126,34,.12);color:var(--rescue);border:1px solid rgba(230,126,34,.3)" onclick="V6Engine.setState({showModal:null,step:2,mode:\'pickon\',scanned:[],sceaux:{},depot:null,dest:null,remorques:[],sauvs:[],numProjet:\'\',personneRessource:\'\',personneRessourceTel:\'\',personneRessourceEmail:\'\',detailsJob:\'\'})">OUI, NOUVEAU PICK-ON</button>' +
            '<button class="btn btn-outline btn-sm" onclick="V6Engine.setState({showModal:null})">ANNULER</button>' +
          '</div>';
      } else if(state.showModal === 'confirmClear'){
        var p = window._confirmClearPending || {};
        content = '<h3 style="color:var(--red)">\uD83D\uDDD1 EFFACER</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">' + (p.msg||'Confirmer la suppression?') + '</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-sm" style="flex:1;background:rgba(192,57,43,.15);color:var(--red);border:1px solid rgba(192,57,43,.3)" onclick="_execClear()">OUI, EFFACER</button>' +
          '</div>';
      } else if(state.showModal === 'confirmKmHigh'){
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F KILOM\u00C9TRAGE \u00C9LEV\u00C9</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">' + (state._kmHighMsg||'') + '<br><br>Un superviseur sera notifi\u00E9.</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-gold btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null});V6Km.doSubmitKm()">CONFIRMER</button>' +
          '</div>';
      } else if(state.showModal === 'confirmOdoSuggestion'){
        content = '<h3 style="color:var(--gold)">\uD83D\uDCCA DERNIER KM CONNU</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">Aucun kilom\u00E9trage entr\u00E9.<br>Utiliser le dernier connu pour <strong style="color:var(--txt)">' + (state._odoVehicle||'') + '</strong> :<br><strong style="color:var(--gold);font-size:18px">' + ((state._odoVal||0).toLocaleString ? (state._odoVal||0).toLocaleString() : (state._odoVal||0)) + ' km</strong></p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-green btn-sm" style="flex:1" onclick="V6Engine.getState().kmOdoStart=String(window._odoSuggestion||0);V6Engine.setState({showModal:null});submitOdoDepart()">UTILISER</button>' +
          '</div>';
      } else if(state.showModal === 'confirmOdoHigh'){
        content = '<h3 style="color:var(--orange)">\u26A0\uFE0F KM \u00C9LEV\u00C9</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center"><strong style="color:var(--txt)">' + (state._odoHighKm||0) + ' km</strong> parcouru \u2014 c\'est beaucoup!<br>Confirmer quand m\u00EAme?</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-gold btn-sm" style="flex:1" onclick="V6Engine.setState({showModal:null});V6Km.doSubmitOdoRetour()">CONFIRMER</button>' +
          '</div>';
      } else if(state.showModal === 'pickoffMissing'){
        var pmissing = window._pickoffMissing || [];
        var pMissingDetails = pmissing.map(function(m2){ var it2 = ITEMS.find(function(i){ return i.id===m2.id; }); return {name:it2?it2.name:(m2.name||m2.id), id:m2.id, serial:it2&&it2.serial?it2.serial:''}; });
        content = '<h3 style="color:var(--red)">\u26A0\uFE0F ' + pmissing.length + ' ITEM' + (pmissing.length>1?'S':'') + ' MANQUANT' + (pmissing.length>1?'S':'') + '</h3>' +
          '<div style="text-align:left;padding:10px 14px;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);border-radius:10px;margin-bottom:12px;max-height:25vh;overflow-y:auto">' +
            pMissingDetails.map(function(d){ return '<div style="font-size:12px;color:var(--muted);margin-bottom:5px;padding:4px 0;border-bottom:1px solid rgba(192,57,43,.1)"><div style="font-weight:600;color:var(--red)">\u2022 ' + d.name + '</div><div style="font-size:10px;font-family:JetBrains Mono,monospace;color:var(--muted2)">' + d.id + (d.serial?' \u2022 S/N: '+d.serial:'') + '</div></div>'; }).join('') +
          '</div>' +
          '<div style="font-size:12px;color:var(--red);font-weight:700;margin-bottom:6px;text-align:center">Raison du manquement (obligatoire, min. 10 caract\u00E8res)</div>' +
          '<textarea id="pickoff-missing-note" rows="3" placeholder="D\u00E9crivez la raison des items manquants..." oninput="(function(el){var btn=document.getElementById(\'btnConfirmMissing\');if(btn){btn.disabled=el.value.trim().length<10;btn.style.opacity=el.value.trim().length<10?\'.4\':\'1\'}})(this)" style="width:100%;margin-bottom:10px;background:var(--card2);color:var(--txt);border:1px solid var(--border);border-radius:10px;padding:10px;font-family:Inter,sans-serif;font-size:13px;resize:none"></textarea>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="window._pickoffMissing=null;V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button id="btnConfirmMissing" class="btn btn-sm" style="flex:1;background:rgba(192,57,43,.15);color:var(--red);border:1px solid rgba(192,57,43,.3);opacity:.4" disabled onclick="_submitPickoffMissing()">CONFIRMER</button>' +
          '</div>';
      } else if(state.showModal === 'confirmCmRemove'){
        var pcr = window._cmRemovePending || {};
        var crItem = ITEMS.find(function(i){ return i.id===pcr.itemId; }) || {name:pcr.itemId||'?'};
        content = '<h3 style="color:var(--red)">\u26A0\uFE0F RETIRER ITEM</h3>' +
          '<p style="font-size:13px;color:var(--muted);margin-bottom:14px;text-align:center">Retirer <strong style="color:var(--txt)">' + escapeHtml(crItem.name) + '</strong> (' + escapeHtml(pcr.itemId||'') + ') d\u00E9finitivement de cette caisse?</p>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline btn-sm" style="flex:1" onclick="window._cmRemovePending=null;V6Engine.setState({showModal:null})">ANNULER</button>' +
            '<button class="btn btn-sm" style="flex:1;background:rgba(192,57,43,.15);color:var(--red);border:1px solid rgba(192,57,43,.3)" onclick="V6Engine.setState({showModal:null});_doCmRemoveItem()">RETIRER</button>' +
          '</div>';
      } else if(state.showModal && state.showModal.indexOf('add_') === 0){
        var addType = state.showModal.replace('add_', '');
        var titles = {depot:'NOUVEAU D\u00C9P\u00D4T', destination:'NOUVELLE DESTINATION', sauveteur:'NOUVEAU SAUVETEUR', item:'NOUVEL ITEM', remorque:'NOUVEAU V\u00C9HICULE'};
        var needsRegion = addType==='depot' || addType==='destination' || addType==='sauveteur';
        content = '<h3 style="color:var(--gold)">+ ' + (titles[addType]||'AJOUTER') + '</h3>' +
          '<input placeholder="Nom" id="add-name" style="margin-bottom:8px">' +
          (addType==='sauveteur' ? '<input placeholder="ID VOLO (ex: V0400)" id="add-volo" style="margin-bottom:8px">' : '') +
          (addType==='item' ? '<select id="add-cat" style="margin-bottom:8px"><option>Param\u00E9dic</option><option>Corde</option><option>D\u00E9tection</option><option>\u00C9vacuation</option><option>EPI</option></select>' : '') +
          (needsRegion ? '<select id="add-region" style="margin-bottom:8px"><option>ESTRIE</option><option>CAPITALE-NATIONALE</option><option>MAURICIE</option><option>LANAUDI\u00C8RE</option><option>MONTR\u00C9AL</option><option>OUTAOUAIS</option><option>BAS-ST-LAURENT</option></select>' : '') +
          '<button class="btn btn-gold btn-sm" onclick="doAddItem(\'' + addType + '\')">AJOUTER</button>';
      } else if(state.showModal === 'txDetail'){
        var tx = V6Data.getHistory().find(function(t){ return t.id === window._txDetailId; });
        if(tx){
          var isPO = tx.mode === 'PICK-ON';
          var dt = tx.timestamp ? new Date(tx.timestamp) : null;
          var timeStr = dt ? dt.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}) : '\u2014';
          var dateStr = dt ? dt.toLocaleDateString('fr-CA',{year:'numeric',month:'long',day:'numeric'}) : '\u2014';
          var statusColor = tx.statut==='ACTIF' ? 'var(--rescue)' : tx.statut==='RETOURN\u00C9' ? 'var(--green)' : 'var(--red)';
          var statusLabel = tx.statut==='ACTIF' ? (isPO?'EN COURS':'RETOUR OK') : tx.statut==='RETOURN\u00C9' ? 'RETOURN\u00C9' : 'ANNUL\u00C9';
          var txItems = []; try{ txItems = JSON.parse(tx.items||'[]'); }catch(e2){}
          content = '<h3 style="color:' + (isPO?'var(--rescue)':'var(--green)') + '">' + (isPO?'\u25B6 PICK-ON':'\u25C0 PICK-OFF') + '</h3>' +
            '<div style="text-align:center;margin-bottom:12px"><span style="font-size:11px;padding:3px 10px;border-radius:8px;background:rgba(255,255,255,.06);color:'+statusColor+';font-weight:700;border:1px solid '+statusColor+'">'+statusLabel+'</span></div>' +
            '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:12px">' +
              '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">Par</span><span style="font-weight:600;font-size:13px">'+escapeHtml(tx.sauveteur_nom||'\u2014')+'</span></div>' +
              '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">Date</span><span style="font-size:13px">'+dateStr+'</span></div>' +
              '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">Heure</span><span style="font-weight:600;font-size:13px;font-family:JetBrains Mono,monospace">'+timeStr+'</span></div>' +
              '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">Destination</span><span style="font-size:13px">'+escapeHtml(tx.destination||'\u2014')+'</span></div>' +
              '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">D\u00E9p\u00F4t</span><span style="font-size:13px">'+escapeHtml(tx.depot||'\u2014')+'</span></div>' +
              (tx.num_projet?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">N\u00B0 Projet</span><span style="font-size:13px;color:var(--rescue)">'+escapeHtml(tx.num_projet)+'</span></div>':'') +
              (tx.personne_ressource?'<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted);font-size:12px">Contact</span><span style="font-size:13px">'+escapeHtml(tx.personne_ressource)+'</span></div>':'') +
              (tx.note?'<div style="padding:4px 0"><span style="color:var(--muted);font-size:12px">Note</span><div style="font-size:12px;color:var(--txt);margin-top:2px;white-space:pre-wrap">'+escapeHtml(tx.note)+'</div></div>':'') +
            '</div>' +
            '<div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--goldL);margin-bottom:6px">ITEMS ('+txItems.length+')</div>' +
            '<div style="max-height:40vh;overflow-y:auto;background:var(--card2);border-radius:10px;padding:8px 12px">' +
              txItems.map(function(itm){ var fullItem = ITEMS.find(function(x){ return x.id===itm.id; }); var serial = fullItem&&fullItem.serial?fullItem.serial:''; var icon = fullItem&&fullItem.icon?fullItem.icon:'\uD83D\uDCE6';
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="font-size:14px">'+icon+'</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--txt)">'+escapeHtml(itm.name||itm.id)+'</div><div style="font-size:10px;color:var(--muted);font-family:JetBrains Mono,monospace">'+escapeHtml(itm.id)+(serial?' \u00B7 S/N: '+escapeHtml(serial):'')+(itm.sceau&&itm.sceau!=='N/A'?' \u00B7 Sceau: '+escapeHtml(itm.sceau):'')+'</div></div></div>';
              }).join('') +
            '</div>';
        } else {
          content = '<h3 style="color:var(--red)">Transaction introuvable</h3>';
        }
      } else {
        content = '<p>Modal: ' + escapeHtml(state.showModal || '') + '</p>';
      }
      return '<div class="modal-overlay" onclick="if(event.target===this)V6Engine.setState({showModal:null})"><div class="modal">' + content +
        '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="V6Engine.setState({showModal:null})">FERMER</button></div></div>';
    },

    scanGroup: function(grp) {
      var grpItems = (grp.items_contenus || grp.items || []).slice();
      if(grp.sous_groupes && grp.sous_groupes.length){
        grp.sous_groupes.forEach(function(sgId){
          var sg = (typeof CAISSES !== 'undefined' ? CAISSES : typeof GROUPS !== 'undefined' ? GROUPS : []).find(function(g){return g.id===sgId;});
          if(sg) (sg.items_contenus || sg.items || []).forEach(function(id){ if(!grpItems.includes(id)) grpItems.push(id); });
        });
      }
      var grpName = grp.nom || grp.name || grp.id;
      var already = state.scanned.map(function(s){return s.id;});
      var allItemDefs = grpItems.map(function(id){return ITEMS.find(function(i){return i.id===id;});}).filter(Boolean);
      var newItems = allItemDefs.filter(function(it){return !already.includes(it.id);});
      if(newItems.length === 0){ V6UI.showToast('\u2713 ' + grpName + ' \u2014 D\u00E9j\u00E0 tout scann\u00E9', 'info'); return; }
      var problemes = allItemDefs.filter(function(it){return it.etat && it.etat !== 'Bon';});
      var alreadyCount = already.filter(function(id){return grpItems.includes(id);}).length;
      window._pendingScanGroup = {grp:grp, grpItems:grpItems, grpName:grpName, newItems:newItems, allItemDefs:allItemDefs, problemes:problemes, alreadyCount:alreadyCount};
      this.setState({showModal: 'scanGroupConfirm'});
    },

    updateCaisseStatut: function(grpId, statut) {
      var s = JSON.parse(localStorage.getItem('volo_caisse_statuts') || '{}');
      s[grpId] = {statut: statut, since: V6Data.tsNow(), user: state.pin || ''};
      localStorage.setItem('volo_caisse_statuts', JSON.stringify(s));
    },

    handlePin: function(d) {
      if(state.pin.length >= 4) return;
      var next = state.pin + d;
      this.setState({pin: next});
    },

    toggleSauv: function(id) {
      var s = state.sauvs.slice();
      var i = s.indexOf(id);
      if(i >= 0) s.splice(i, 1); else s.push(id);
      this.setState({sauvs: s});
    },

    scanItem: function(id) {
      var item = ITEMS.find(function(i){ return i.id === id; });
      if(!item || state.scanned.find(function(s){ return s.id === id; })) return;
      var sceaux = Object.assign({}, state.sceaux);
      if(item.sceau) sceaux[id] = 'INTACT';
      var stamped = Object.assign({}, item, {scanTime: new Date()});
      var isPickoff = state.mode === 'pickoff';
      var expected = isPickoff && window._pickoffExpected ? window._pickoffExpected : [];
      var isExpected = expected.some(function(e){ return e.id === id; });
      if(isPickoff && expected.length > 0 && !isExpected){
        window._pendingScanItem = {stamped:stamped, sceaux:sceaux, isPickoff:isPickoff};
        this.setState({showModal: 'scanUnexpected'}); return;
      }
      if(!isPickoff && item.etat === 'Hors service'){
        V6UI.showToast('\uD83D\uDEAB ' + item.name + ' est HORS SERVICE \u2014 pick-on interdit', 'err'); return;
      }
      if(!isPickoff && item.expiry && item.expiry !== 'N/A'){
        var exp = typeof parseFlexDate === 'function' ? parseFlexDate(item.expiry) : null;
        if(exp && exp < new Date()){ V6UI.showToast('\uD83D\uDEAB ' + item.name + ' est EXPIR\u00C9 \u2014 pick-on interdit', 'err'); return; }
      }
      if(item.etat === 'A surveiller'){
        window._pendingScanItem = {stamped:stamped, sceaux:sceaux, isPickoff:isPickoff};
        this.setState({showModal: 'scanSurveiller'}); return;
      }
      _finalizeScanItem(stamped, sceaux, isPickoff);
    },

    startPickOn: function() {
      var myActive = V6Data.getMyActivePickOns();
      if(myActive.length > 0){
        window._pickOnActiveCount = myActive.length;
        window._pickOnActiveItems = myActive.reduce(function(n,tx){ try{ return n + JSON.parse(tx.items||'[]').length; }catch(e){ return n; } }, 0);
        this.setState({showModal: 'pickOnBlocked'});
        return;
      }
      this.setState({step:2, mode:'pickon', scanned:[], sceaux:{}, depot:null, dest:null, remorques:[], sauvs:[], numProjet:'', personneRessource:'', personneRessourceTel:'', personneRessourceEmail:'', detailsJob:''});
    },

    startPickOff: function() {
      window._pickoffExpected = null;
      window._pickoffOriginalTx = null;
      this.setState({step:2, mode:'pickoff', scanned:[], sceaux:{}, depot:null, dest:null, remorques:[], sauvs:[], numProjet:'', personneRessource:'', detailsJob:'', _showAllPickoff:false});
    },

    doValidation: function() {
      var noteEl = document.getElementById('confirm-note');
      if(noteEl) state.txNote = noteEl.value.trim();
      var tsNow = V6Data.tsNow;
      var escapeHtml = V6Data.escapeHtml;
      var safeGetLS = V6Data.safeGetLS;
      var safeSetLS = V6Data.safeSetLS;

      if(state.mode === 'pickoff' && window._pickoffExpected){
        var expected = window._pickoffExpected;
        var scannedIds = state.scanned.map(function(s){return s.id;});
        var missing = expected.filter(function(e){return !scannedIds.includes(e.id);});
        if(missing.length > 0){
          window._pickoffMissing = missing;
          this.setState({showModal:'pickoffMissing'}); return;
        }
        var grpIds = [];
        var seen = {};
        expected.forEach(function(e){
          var it = ITEMS.find(function(i){return i.id===e.id;});
          if(!it) return;
          var grp = (typeof GROUPS !== 'undefined' ? GROUPS : []).find(function(g){return (g.items_contenus||g.items||[]).includes(it.id);});
          if(grp && !seen[grp.id]){ seen[grp.id]=true; grpIds.push(grp.id); }
        });
        var self = this;
        grpIds.forEach(function(gid){ self.updateCaisseStatut(gid, 'disponible'); });
      }

      var depot = DEPOTS.find(function(d){return d.id===state.depot;});
      var dest = DESTINATIONS.find(function(d){return d.id===state.dest;});
      var remNames = state.remorques && state.remorques.length ? state.remorques.map(function(id){var r=REMORQUES.find(function(x){return x.id===id;});return r?r.name:id;}).join(' + ') : 'Aucun';
      var sauvNames = state.sauvs.map(function(id){var s=SAUVETEURS.find(function(x){return x.id===id;});return s?s.name:id;});
      var payload = {
        mode: state.mode==='pickon' ? 'PICK-ON' : 'PICK-OFF',
        sauveteur_id: state.sauvs[0]||'',
        sauveteur_nom: sauvNames[0]||'',
        remorque: remNames,
        depot: depot?depot.name:'',
        destination: dest?dest.name:'',
        num_projet: state.numProjet||'',
        personne_ressource: state.personneRessource||'',
        personne_ressource_tel: state.personneRessourceTel||'',
        personne_ressource_email: state.personneRessourceEmail||'',
        details_job: state.detailsJob||'',
        items: JSON.stringify(state.scanned.map(function(i){return {id:i.id,name:i.name,sceau:state.sceaux[i.id]||'N/A',fromGroup:i.fromGroup||'',note:i.itemNote||''};})),
        nb_items: state.scanned.length,
        caisses_utilisees: JSON.stringify([].concat(Array.from(new Set(state.scanned.filter(function(i){return i.fromGroup;}).map(function(i){return i.fromGroup;}))))),
        note: state.txNote||'',
        statut: 'ACTIF',
        timestamp: tsNow()
      };
      lastPayload = payload;
      cancelSeconds = 300;
      V6Data.saveToHistory(payload);
      V6Data.appendAuditLog(payload);

      if(state.mode === 'pickoff' && window._pickoffOriginalTx){
        var origTx = window._pickoffOriginalTx;
        var closurePayload = {
          mode:'PICK-ON', sauveteur_id:origTx.sauveteur_id||'', sauveteur_nom:origTx.sauveteur_nom||'',
          remorque:origTx.remorque||'Aucun', depot:origTx.depot||'', destination:origTx.destination||'',
          num_projet:origTx.num_projet||'', personne_ressource:origTx.personne_ressource||'',
          items:origTx.items||'[]', nb_items:origTx.nb_items||0,
          statut:'RETOURN\u00C9', original_timestamp:origTx.timestamp, timestamp:tsNow()
        };
        V6Data.saveToHistory(closurePayload);
        window._pickoffOriginalTx = null;
        window._pickoffExpected = null;
      }

      fetch(VOLO_WH_M, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
        .then(function(r){ if(r.ok) V6UI.showToast('\u2705 Transaction envoy\u00E9e','ok'); else V6UI.showToast('\u26A0\uFE0F Erreur serveur','err'); })
        .catch(function(){ try{var q=JSON.parse(localStorage.getItem('volo_queue')||'[]');q.push(payload);localStorage.setItem('volo_queue',JSON.stringify(q));}catch(e){} V6UI.showToast('\uD83D\uDCF4 Hors-ligne \u2014 sauvegard\u00E9 localement','off'); });

      // Auto usage tracker
      try{
        if(state.mode === 'pickon'){
          var usageLog = safeGetLS('volo_usage_log', []);
          state.scanned.forEach(function(s){
            usageLog.push({itemId:s.id, itemName:s.name, startDate:new Date().toISOString(), userId:state.user?state.user.volo:('V'+state.pin), txId:payload.timestamp||'', type:'auto-pick-on'});
          });
          safeSetLS('volo_usage_log', usageLog);
        } else if(state.mode === 'pickoff'){
          var usageLog2 = safeGetLS('volo_usage_log', []);
          var returnedIds = state.scanned.map(function(s){return s.id;});
          usageLog2 = usageLog2.filter(function(u){return returnedIds.indexOf(u.itemId)===-1;});
          safeSetLS('volo_usage_log', usageLog2);
        }
      }catch(e){ console.warn('Usage tracker auto error:', e); }

      this.setState({step:8});
      setTimeout(function(){ V6UI.playEagleCry(); }, 300);
      this.startCancelTimer();
    },

    startCancelTimer: function() {
      if(cancelTimer) clearInterval(cancelTimer);
      cancelSeconds = 300;
      cancelTimer = setInterval(function(){
        cancelSeconds--;
        if(cancelSeconds <= 0){ clearInterval(cancelTimer); cancelTimer = null; }
        var el = document.getElementById('cancel-btn');
        if(el){
          if(cancelSeconds <= 0){ el.style.display = 'none'; return; }
          var m = Math.floor(cancelSeconds/60); var s = cancelSeconds%60;
          el.textContent = 'ANNULER (' + m + ':' + String(s).padStart(2,'0') + ' restant)';
        }
      }, 1000);
    },

    cancelTransaction: function() {
      if(!lastPayload || cancelSeconds <= 0) return;
      if(cancelTimer){ clearInterval(cancelTimer); cancelTimer = null; }
      var cancelPayload = Object.assign({}, lastPayload, {statut:'ANNUL\u00C9', original_timestamp:lastPayload.timestamp, timestamp:V6Data.tsNow()});
      V6Data.saveToHistory(cancelPayload);
      fetch(VOLO_WH_M, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cancelPayload)})
        .then(function(r){ if(r.ok) V6UI.showToast('\u2705 Transaction annul\u00E9e','ok'); else V6UI.showToast('\u26A0\uFE0F Erreur annulation','err'); })
        .catch(function(){ V6UI.showToast('\uD83D\uDCF4 Annulation hors-ligne','off'); try{var q=JSON.parse(localStorage.getItem('volo_queue')||'[]');q.push(cancelPayload);localStorage.setItem('volo_queue',JSON.stringify(q));}catch(e){} });
      lastPayload = null; cancelSeconds = 0;
      this.render();
    },

    // ──────────────────────────────────────────────────────────
    // CAISSE MODULE (14 functions)
    // ──────────────────────────────────────────────────────────

    /**
     * Check if current user is a stock manager
     * @returns {boolean}
     */
    isStockManager: function() {
      var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
      if (!user) return false;
      var name = (user.name || '').toLowerCase();
      return STOCK_MANAGERS.some(function(m){ return name.includes(m); }) || user.role === "CHEF D'EQUIPE";
    },

    getCaisseStock: function() {
      try { return JSON.parse(localStorage.getItem('volo_caisse_stock') || '{}'); } catch(e) { return {}; }
    },

    saveCaisseStock: function(stock) {
      V6Data.safeSetLS('volo_caisse_stock', stock);
    },

    getCaisseItems: function(grpId) {
      var stock = V6Engine.getCaisseStock();
      var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null;
      if (!grp) return [];
      if (!stock[grpId]) return [].concat(grp.items);
      return stock[grpId];
    },

    initCaisseStock: function(grpId) {
      var stock = V6Engine.getCaisseStock();
      if (!stock[grpId]) {
        var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null;
        if (grp) { stock[grpId] = [].concat(grp.items); V6Engine.saveCaisseStock(stock); }
      }
    },

    sendStockWebhook: function(payload) {
      try {
        fetch(STOCK_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } catch(e) { console.warn('Stock webhook:', e); }
    },

    getStockHistory: function(grpId) {
      try { return JSON.parse(localStorage.getItem('volo_stock_hist_' + grpId) || '[]'); } catch(e) { return []; }
    },

    saveStockHistory: function(grpId, entry) {
      var h = V6Engine.getStockHistory(grpId);
      h.unshift(entry);
      V6Data.safeSetLS('volo_stock_hist_' + grpId, h.slice(0, 30));
    },

    openCaisseModule: function() {
      try {
        var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
        if (user) localStorage.setItem('volo_caisse_user', JSON.stringify(user));
      } catch(e) {}
      window.location.href = '../caisses-stock.html';
    },

    cmTab: function(id, btn) {
      document.querySelectorAll('#cm-overlay .cm-tc').forEach(function(t){ t.classList.remove('active'); });
      document.querySelectorAll('#cm-overlay .cm-tab').forEach(function(t){ t.classList.remove('active'); });
      var tc = document.getElementById('cm-tc-' + id);
      if (tc) tc.classList.add('active');
      btn.classList.add('active');
    },

    cmRenderGlobal: function() {
      var el = document.getElementById('cm-tc-global'); if (!el) return;
      var grps = typeof GROUPS !== 'undefined' ? GROUPS : [];
      var stock = V6Engine.getCaisseStock();
      var totalDispo = 0, totalItems = 0, lowCount = 0, emptyCount = 0;
      var rows = grps.map(function(g) {
        var total = g.items.length;
        var dispo = (stock[g.id] || g.items).length;
        var pct = total > 0 ? Math.round((dispo / total) * 100) : 0;
        totalDispo += dispo; totalItems += total;
        if (pct < 30 && total > 0) lowCount++;
        if (pct === 0 && total > 0) emptyCount++;
        return { g: g, total: total, dispo: dispo, pct: pct };
      }).sort(function(a, b) { return a.pct - b.pct; });

      el.innerHTML =
        '<div class="cm-kpi-grid">' +
          '<div class="cm-kpi"><div class="cm-kpi-num" style="color:#27AE60">' + totalDispo + '</div><div class="cm-kpi-lbl">ITEMS DISPO</div></div>' +
          '<div class="cm-kpi"><div class="cm-kpi-num" style="color:#E65100">' + (totalItems - totalDispo) + '</div><div class="cm-kpi-lbl">SORTIS</div></div>' +
          '<div class="cm-kpi"><div class="cm-kpi-num" style="color:#C0392B">' + emptyCount + '</div><div class="cm-kpi-lbl">CAISSES VIDES</div></div>' +
        '</div>' +
        (lowCount ? '<div style="background:rgba(192,57,43,.1);border:1px solid rgba(192,57,43,.3);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#C0392B;font-family:\'Oswald\',sans-serif;letter-spacing:1px">\u26A0\uFE0F ' + lowCount + ' CAISSE' + (lowCount > 1 ? 'S' : '') + ' STOCK BAS (&lt;30%)</div>' : '') +
        '<div class="cm-sec">TOUTES LES CAISSES \u2014 STOCK</div>' +
        rows.map(function(r) {
          var color = r.pct > 60 ? '#27AE60' : r.pct > 20 ? '#E67E22' : '#C0392B';
          return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #141414;cursor:pointer" onclick="V6Engine.cmOpenDetail(\'' + r.g.id + '\')">' +
            '<span style="font-size:16px;flex-shrink:0">' + (r.g.icon || '\uD83D\uDCE6') + '</span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:13px;font-family:\'Oswald\',sans-serif;letter-spacing:1px;color:#F0F0F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.g.name + '</div></div>' +
            '<span style="font-size:11px;color:' + color + ';font-family:\'JetBrains Mono\';flex-shrink:0">' + r.dispo + '/' + r.total + '</span>' +
            '<div class="cm-bar"><div class="cm-bar-fill" style="width:' + r.pct + '%;background:' + color + '"></div></div>' +
          '</div>';
        }).join('');
    },

    cmRenderCaisses: function(search) {
      var el = document.getElementById('cm-caisse-list'); if (!el) return;
      var grps = typeof GROUPS !== 'undefined' ? GROUPS : [];
      var stock = V6Engine.getCaisseStock();
      var q = (search || '').toLowerCase();
      var filtered = grps.filter(function(g) { return !q || g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q); });
      if (!filtered.length) { el.innerHTML = '<div style="text-align:center;color:#555;padding:24px">Aucune caisse trouv\u00E9e</div>'; return; }
      el.innerHTML = filtered.map(function(g) {
        var total = g.items.length;
        var dispo = (stock[g.id] || g.items).length;
        var pct = total > 0 ? Math.round((dispo / total) * 100) : 0;
        var color = pct > 60 ? '#27AE60' : pct > 20 ? '#E67E22' : '#C0392B';
        var tagCls = pct > 60 ? 'cm-tag-g' : pct > 20 ? 'cm-tag-o' : 'cm-tag-r';
        var cardCls = pct === 0 ? 'empty' : pct < 30 ? 'low' : '';
        var preview = g.items.slice(0, 3).map(function(id) { var it = ITEMS.find(function(i){ return i.id === id; }); return it ? it.name : id; }).join(' \u00B7 ') + (g.items.length > 3 ? ' +' + (g.items.length - 3) : '');
        return '<div class="cm-card ' + cardCls + '" onclick="V6Engine.cmOpenDetail(\'' + g.id + '\')">' +
          '<span style="font-size:22px">' + (g.icon || '\uD83D\uDCE6') + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:14px;letter-spacing:1px;color:#F0F0F0">' + g.name + '</div>' +
            '<div style="font-size:10px;color:#777;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + preview + '</div>' +
            '<div style="font-size:9px;color:#444;margin-top:2px">' + g.id + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<span class="cm-tag ' + tagCls + '">' + dispo + '/' + total + '</span>' +
            '<div class="cm-bar" style="margin-top:6px"><div class="cm-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
          '</div>' +
        '</div>';
      }).join('');
    },

    cmOpenDetail: function(grpId) {
      var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null;
      if (!grp) return;
      V6Engine.initCaisseStock(grpId);
      var manager = V6Engine.isStockManager();
      document.querySelectorAll('#cm-overlay .cm-tc').forEach(function(t){ t.classList.remove('active'); });
      document.querySelectorAll('#cm-overlay .cm-tab').forEach(function(t){ t.classList.remove('active'); });
      var caisseTab = document.getElementById('cm-tc-caisses');
      if (caisseTab) caisseTab.classList.add('active');
      var main = document.getElementById('cm-tc-caisses'); if (!main) return;
      var dispoIds = V6Engine.getCaisseItems(grpId);
      var esc = V6Data.escapeHtml;
      var allItems = grp.items.map(function(id) {
        var item = ITEMS.find(function(i){ return i.id === id; }) || { id: id, name: id, icon: '\uD83D\uDCE6', etat: '?' };
        return Object.assign({}, item, { available: dispoIds.includes(id) });
      });
      var grouped = {};
      allItems.forEach(function(item) {
        var key = item.name;
        if (!grouped[key]) grouped[key] = Object.assign({}, item, { ids: [], availableIds: [], totalCount: 0, availableCount: 0 });
        grouped[key].ids.push(item.id); grouped[key].totalCount++;
        if (item.available) { grouped[key].availableIds.push(item.id); grouped[key].availableCount++; }
      });
      var groupedItems = Object.values(grouped);
      var selected = {};
      window._caisseGroupedItems = groupedItems;
      window._caisseSelected = selected;

      main.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
          '<button class="cm-btn cm-out" onclick="V6Engine.cmBackToCaisses()">\u2190 RETOUR</button>' +
          '<div style="flex:1">' +
            '<div style="font-family:\'Oswald\',sans-serif;font-size:15px;color:#27AE60;letter-spacing:2px">' + esc(grp.icon || '\uD83D\uDCE6') + ' ' + esc(grp.name) + '</div>' +
            '<div style="font-size:10px;color:#555">' + esc(grp.id) + ' \u00B7 ' + dispoIds.length + '/' + grp.items.length + ' disponibles</div>' +
          '</div>' +
          (manager ? '<button class="cm-btn cm-gold" onclick="cmOpenEdit(\'' + grpId + '\')">\u270F\uFE0F MODIFIER</button>' : '') +
        '</div>' +
        '<div style="background:#141414;border:1px solid #27AE60;border-radius:10px;padding:14px;margin-bottom:12px">' +
          '<div class="cm-sec" style="margin-top:0;border-top:none">ITEMS \u00C0 PRENDRE</div>' +
          '<div id="cm-items-' + grpId + '"></div>' +
          '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<button class="cm-btn cm-g" onclick="cmConfirmDeduction(\'' + grpId + '\')">\u2713 CONFIRMER LA PRISE</button>' +
            '<span style="font-size:11px;color:#555" id="cm-sel-count">0 s\u00E9lectionn\u00E9</span>' +
          '</div>' +
        '</div>' +
        '<div class="cm-sec">HISTORIQUE \u2014 ' + esc(grp.name) + '</div>' +
        '<div id="cm-hist-' + grpId + '" style="font-size:11px;color:#555">' + _cmRenderHistory(grpId) + '</div>';

      function renderRows() {
        var el2 = document.getElementById('cm-items-' + grpId); if (!el2) return;
        var tot = 0; Object.values(window._caisseSelected || {}).forEach(function(q2){ tot += q2; });
        var sc = document.getElementById('cm-sel-count'); if (sc) sc.textContent = tot + ' s\u00E9lectionn\u00E9' + (tot > 1 ? 's' : '');
        el2.innerHTML = groupedItems.map(function(g2) {
          var qty = window._caisseSelected[g2.name] || 0;
          var max = g2.availableCount;
          return '<div class="cm-item-row" style="' + (max === 0 ? 'opacity:.35' : '') + '">' +
            '<span style="font-size:16px">' + (g2.icon || '\uD83D\uDCE6') + '</span>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:12px;color:' + (max === 0 ? '#555' : '#F0F0F0') + ';font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g2.name) + '</div>' +
              '<div style="font-size:9px;color:#444">' + esc(g2.ids[0]) + (g2.totalCount > 1 ? ' +' + (g2.totalCount - 1) : '') + '</div>' +
            '</div>' +
            '<span class="cm-tag ' + (g2.availableCount > 0 ? 'cm-tag-g' : 'cm-tag-r') + '" style="font-size:9px">' + g2.availableCount + '/' + g2.totalCount + '</span>' +
            (max > 0 ? '<div class="cm-qty">' +
              '<button class="cm-qbtn" onclick="cmQty(\'' + grpId + '\',\'' + g2.name.replace(/'/g, "\\'").replace(/"/g, '\\"') + '\',' + Math.max(0, qty - 1) + ',' + max + ')">\u2212</button>' +
              '<span style="font-family:\'Oswald\',sans-serif;font-size:15px;min-width:18px;text-align:center">' + qty + '</span>' +
              '<button class="cm-qbtn" onclick="cmQty(\'' + grpId + '\',\'' + g2.name.replace(/'/g, "\\'").replace(/"/g, '\\"') + '\',' + Math.min(max, qty + 1) + ',' + max + ')">+</button>' +
            '</div>' : '<div style="width:80px"></div>') +
          '</div>';
        }).join('');
      }
      window._renderCaisseItems = renderRows;
      renderRows();
    },

    cmBackToCaisses: function() {
      var main = document.getElementById('cm-tc-caisses'); if (!main) return;
      main.innerHTML =
        '<input class="cm-search" placeholder="\uD83D\uDD0D Rechercher une caisse..." oninput="V6Engine.cmRenderCaisses(this.value)" id="cm-search">' +
        '<div id="cm-caisse-list"></div>';
      V6Engine.cmRenderCaisses('');
      document.querySelectorAll('#cm-overlay .cm-tab').forEach(function(t, i) { if (i === 1) t.classList.add('active'); else t.classList.remove('active'); });
    },

    // ──────────────────────────────────────────────────────────
    // USAGE TRACKER (18 functions)
    // ──────────────────────────────────────────────────────────

    /**
     * Navigate to usage tracker (step 16)
     */
    goToUsageTracker: function() {
      V6Engine.setState({ step: 16 });
    },

    getUsageLog: function() {
      try { return JSON.parse(localStorage.getItem('volo_usage_log') || '{}'); } catch(e) { return {}; }
    },

    saveUsageLog: function(log) {
      V6Data.safeSetLS('volo_usage_log', log);
    },

    getActiveUsageSession: function() {
      try { return JSON.parse(localStorage.getItem('volo_usage_active') || 'null'); } catch(e) { return null; }
    },

    saveActiveUsageSession: function(s) {
      if (s) V6Data.safeSetLS('volo_usage_active', s);
      else try { localStorage.removeItem('volo_usage_active'); } catch(e) {}
    },

    getItemUsage: function(itemId) {
      var log = V6Engine.getUsageLog();
      return log[itemId] && log[itemId].total_hours ? log[itemId].total_hours : 0;
    },

    startUsageSession: function() {
      var active = V6Engine.getActiveUsageSession();
      if (active) { V6UI.showToast('Session d\u00E9j\u00E0 en cours', 'err'); return; }
      var selectedItems = window._usageSelectedItems || [];
      if (!selectedItems.length) { V6UI.showToast('S\u00E9lectionne au moins un item', 'err'); return; }
      var typeEl = document.querySelector('.usage-type-btn.active');
      var type = typeEl ? typeEl.dataset.type : 'intervention';
      var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
      var session = {
        id: 'USG-' + Date.now(),
        items: selectedItems.map(function(i){ return { id: i.id, name: i.name, icon: i.icon || '' }; }),
        start: new Date().toISOString(),
        type: type,
        user: user ? user.name : (localStorage.getItem('volo_last_user') || 'Inconnu'),
        userId: user ? user.id : ''
      };
      V6Engine.saveActiveUsageSession(session);
      window._usageSelectedItems = [];
      V6UI.showToast('Session d\u00E9marr\u00E9e \u2014 ' + selectedItems.length + ' items', 'ok');
      V6Engine.startUsageTimer();
      V6Engine.render();
    },

    getItemConditions: function() {
      try { return JSON.parse(localStorage.getItem('volo_item_conditions') || '{}'); } catch(e) { return {}; }
    },

    saveItemCondition: function(itemId, cond, note) {
      var c = V6Engine.getItemConditions();
      c[itemId] = { condition: cond, note: note, ts: V6Data.tsNow() };
      V6Data.safeSetLS('volo_item_conditions', c);
    },

    stopUsageSession: function() {
      var active = V6Engine.getActiveUsageSession();
      if (!active) { V6UI.showToast('Aucune session active', 'err'); return; }
      var start = new Date(active.start);
      var end = new Date();
      var durationMin = Math.round((end - start) / 60000);
      var hh = Math.floor(durationMin / 60);
      var mm = durationMin % 60;
      var esc = V6Data.escapeHtml;
      window._usageStopData = { active: active, start: start, end: end, durationMin: durationMin };
      var overlay = document.createElement('div');
      overlay.id = 'usage-stop-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';
      overlay.innerHTML =
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto">' +
          '<div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--gold);text-align:center;margin-bottom:16px">FIN DE SESSION</div>' +
          '<div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:4px">' + esc(active.type.toUpperCase()) + ' \u2014 ' + active.items.length + ' item' + (active.items.length > 1 ? 's' : '') + '</div>' +
          '<div style="text-align:center;font-size:11px;color:var(--muted);margin-bottom:16px">' + esc(active.user) + '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DUR\u00C9E (MODIFIABLE)</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:16px">' +
            '<div style="flex:1"><label style="font-size:10px;color:var(--muted)">Heures</label><input type="number" id="usage-stop-hh" value="' + hh + '" min="0" max="99" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center"></div>' +
            '<div style="flex:1"><label style="font-size:10px;color:var(--muted)">Minutes</label><input type="number" id="usage-stop-mm" value="' + mm + '" min="0" max="59" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center"></div>' +
          '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">\u00C9TAT DU MAT\u00C9RIEL</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px" id="usage-cond-btns">' +
            USAGE_CONDITIONS.map(function(c){ return '<button onclick="document.querySelectorAll(\'#usage-cond-btns button\').forEach(b=>b.style.border=\'1px solid var(--border)\');this.style.border=\'2px solid ' + c.color + '\';window._usageStopCond=\'' + c.key + '\'" style="flex:1;min-width:45%;padding:8px 6px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);cursor:pointer;font-size:12px;text-align:center">' + c.icon + ' ' + c.label + '</button>'; }).join('') +
          '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">NOTE (OPTIONNEL)</div>' +
          '<textarea id="usage-stop-note" placeholder="Ex: Tr\u00E8s sale, besoin nettoyage imm\u00E9diat..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;font-family:Inter,sans-serif;resize:vertical;min-height:60px;margin-bottom:16px"></textarea>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline" onclick="document.getElementById(\'usage-stop-modal\').remove()" style="flex:1">ANNULER</button>' +
            '<button class="btn btn-gold" onclick="V6Engine.confirmStopUsage()" style="flex:1">CONFIRMER</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      window._usageStopCond = 'ok';
      var firstBtn = overlay.querySelector('#usage-cond-btns button');
      if (firstBtn) firstBtn.style.border = '2px solid var(--green,#22C55E)';
    },

    confirmStopUsage: function() {
      var data = window._usageStopData;
      if (!data) return;
      var hhVal = Math.min(99, Math.max(0, parseInt(document.getElementById('usage-stop-hh').value) || 0));
      var mmVal = Math.min(59, Math.max(0, parseInt(document.getElementById('usage-stop-mm').value) || 0));
      var finalMin = hhVal * 60 + mmVal;
      var finalHrs = finalMin / 60;
      var cond = window._usageStopCond || 'ok';
      var note = (document.getElementById('usage-stop-note').value || '').trim();
      var log = V6Engine.getUsageLog();
      data.active.items.forEach(function(item) {
        if (!log[item.id]) log[item.id] = { id: item.id, name: item.name, sessions: [], total_hours: 0 };
        log[item.id].sessions.push({
          start: data.active.start, end: data.end.toISOString(), duration_min: finalMin,
          type: data.active.type, user: data.active.user, condition: cond, note: note || undefined
        });
        log[item.id].total_hours = +(log[item.id].total_hours + finalHrs).toFixed(2);
        if (log[item.id].sessions.length > 100) log[item.id].sessions = log[item.id].sessions.slice(-100);
        if (cond !== 'ok' || note) V6Engine.saveItemCondition(item.id, cond, note);
      });
      V6Engine.saveUsageLog(log);
      V6Engine.saveActiveUsageSession(null);
      if (window._usageTimerInterval) { clearInterval(window._usageTimerInterval); window._usageTimerInterval = null; }
      document.getElementById('usage-stop-modal').remove();
      var condObj = USAGE_CONDITIONS.find(function(c){ return c.key === cond; });
      V6UI.showToast('Session \u2014 ' + (hhVal > 0 ? hhVal + 'h ' : '') + mmVal + 'min \u00B7 ' + (condObj ? condObj.icon : '') + (note ? ' \u00B7 ' + note : ''), 'ok');
      V6Engine.render();
    },

    showManualUsageEntry: function() {
      window._manualUsageItems = window._usageSelectedItems || [];
      if (!window._manualUsageItems.length) { V6UI.showToast('S\u00E9lectionne au moins un item', 'err'); return; }
      var esc = V6Data.escapeHtml;
      var overlay = document.createElement('div');
      overlay.id = 'usage-manual-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';
      overlay.innerHTML =
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto">' +
          '<div style="font-family:Oswald,sans-serif;font-size:16px;letter-spacing:2px;color:var(--blue);text-align:center;margin-bottom:16px">ENTR\u00C9E MANUELLE</div>' +
          '<div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:12px">' + window._manualUsageItems.length + ' item' + (window._manualUsageItems.length > 1 ? 's' : '') + ' s\u00E9lectionn\u00E9' + (window._manualUsageItems.length > 1 ? 's' : '') + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:16px">' +
            window._manualUsageItems.map(function(i){ return '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(59,130,246,.1);color:var(--blue)">' + (i.icon || '\uD83D\uDCE6') + ' ' + i.name + '</span>'; }).join('') +
          '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">TYPE</div>' +
          '<select id="manual-usage-type" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;margin-bottom:12px"><option value="intervention">INTERVENTION</option><option value="montage">MONTAGE</option><option value="formation">FORMATION</option><option value="exercice">EXERCICE</option></select>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DATE</div>' +
          '<input type="date" id="manual-usage-date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;margin-bottom:12px">' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">DUR\u00C9E</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:16px">' +
            '<div style="flex:1"><label style="font-size:10px;color:var(--muted)">Heures</label><input type="number" id="manual-usage-hh" value="0" min="0" max="99" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center"></div>' +
            '<div style="flex:1"><label style="font-size:10px;color:var(--muted)">Minutes</label><input type="number" id="manual-usage-mm" value="0" min="0" max="59" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:18px;font-family:JetBrains Mono,monospace;text-align:center"></div>' +
          '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">\u00C9TAT DU MAT\u00C9RIEL</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px" id="manual-cond-btns">' +
            USAGE_CONDITIONS.map(function(c){ return '<button onclick="document.querySelectorAll(\'#manual-cond-btns button\').forEach(b=>b.style.border=\'1px solid var(--border)\');this.style.border=\'2px solid ' + c.color + '\';window._manualUsageCond=\'' + c.key + '\'" style="flex:1;min-width:45%;padding:8px 6px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);cursor:pointer;font-size:12px;text-align:center">' + c.icon + ' ' + c.label + '</button>'; }).join('') +
          '</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:6px">NOTE (OPTIONNEL)</div>' +
          '<textarea id="manual-usage-note" placeholder="Ex: Tr\u00E8s sale, besoin nettoyage imm\u00E9diat..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--txt);font-size:13px;font-family:Inter,sans-serif;resize:vertical;min-height:60px;margin-bottom:16px"></textarea>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-outline" onclick="document.getElementById(\'usage-manual-modal\').remove()" style="flex:1">ANNULER</button>' +
            '<button class="btn btn-blue" onclick="V6Engine.confirmManualUsage()" style="flex:1">AJOUTER</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      window._manualUsageCond = 'ok';
      var firstBtn = overlay.querySelector('#manual-cond-btns button');
      if (firstBtn) firstBtn.style.border = '2px solid var(--green,#22C55E)';
    },

    confirmManualUsage: function() {
      var items = window._manualUsageItems || [];
      if (!items.length) return;
      var hhVal = Math.min(99, Math.max(0, parseInt(document.getElementById('manual-usage-hh').value) || 0));
      var mmVal = Math.min(59, Math.max(0, parseInt(document.getElementById('manual-usage-mm').value) || 0));
      if (hhVal === 0 && mmVal === 0) { V6UI.showToast('Entre une dur\u00E9e', 'err'); return; }
      var finalMin = hhVal * 60 + mmVal;
      var finalHrs = finalMin / 60;
      var type = document.getElementById('manual-usage-type').value;
      var date = document.getElementById('manual-usage-date').value;
      var cond = window._manualUsageCond || 'ok';
      var note = (document.getElementById('manual-usage-note').value || '').trim();
      var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
      var userName = user ? user.name : (localStorage.getItem('volo_last_user') || 'Inconnu');
      var startISO = new Date(date + 'T08:00:00').toISOString();
      var endDate = new Date(new Date(date + 'T08:00:00').getTime() + finalMin * 60000);
      var log = V6Engine.getUsageLog();
      items.forEach(function(item) {
        if (!log[item.id]) log[item.id] = { id: item.id, name: item.name, sessions: [], total_hours: 0 };
        log[item.id].sessions.push({
          start: startISO, end: endDate.toISOString(), duration_min: finalMin,
          type: type, user: userName, condition: cond, note: note || undefined, manual: true
        });
        log[item.id].total_hours = +(log[item.id].total_hours + finalHrs).toFixed(2);
        if (log[item.id].sessions.length > 100) log[item.id].sessions = log[item.id].sessions.slice(-100);
        if (cond !== 'ok' || note) V6Engine.saveItemCondition(item.id, cond, note);
      });
      V6Engine.saveUsageLog(log);
      document.getElementById('usage-manual-modal').remove();
      window._usageSelectedItems = [];
      V6UI.showToast('Ajout\u00E9 \u2014 ' + (hhVal > 0 ? hhVal + 'h ' : '') + mmVal + 'min pour ' + items.length + ' items', 'ok');
      V6Engine.render();
    },

    getItemMissionCount: function(itemId) {
      try {
        var hist = JSON.parse(localStorage.getItem('volo_history') || '[]');
        var count = 0;
        hist.forEach(function(h) {
          if (h.mode === 'PICK-ON' && h.items) {
            var items = typeof h.items === 'string' ? JSON.parse(h.items) : h.items;
            if (Array.isArray(items) && items.some(function(i){ return (i.id || i) === itemId; })) count++;
          }
        });
        return count;
      } catch(e) { return 0; }
    },

    startUsageTimer: function() {
      if (window._usageTimerInterval) clearInterval(window._usageTimerInterval);
      window._usageTimerInterval = setInterval(function() {
        var els = document.querySelectorAll('.usage-timer-display');
        var active = V6Engine.getActiveUsageSession();
        if (!active || !els.length) { clearInterval(window._usageTimerInterval); window._usageTimerInterval = null; return; }
        var elapsed = Math.floor((Date.now() - new Date(active.start).getTime()) / 1000);
        var hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        var mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        var ss = String(elapsed % 60).padStart(2, '0');
        els.forEach(function(el){ el.textContent = hh + ':' + mm + ':' + ss; });
      }, 1000);
    },

    renderUsageIndicator: function() {
      var active = V6Engine.getActiveUsageSession();
      if (!active) return '';
      var elapsed = Math.floor((Date.now() - new Date(active.start).getTime()) / 1000);
      var hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      var mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      var ss = String(elapsed % 60).padStart(2, '0');
      return '<div onclick="V6Engine.goToUsageTracker()" style="position:fixed;top:68px;right:12px;z-index:9997;display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:20px;background:rgba(192,57,43,.92);color:#fff;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:13px;font-weight:600;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(192,57,43,.3);animation:pulse 2s infinite">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff4444;animation:pulse 1s infinite"></span>' +
        '<span class="usage-timer-display">' + hh + ':' + mm + ':' + ss + '</span>' +
        '<span style="font-size:10px;font-family:Oswald,sans-serif;letter-spacing:1px;opacity:.8">EN COURS</span>' +
      '</div>';
    },

    toggleUsageItem: function(itemId) {
      if (!window._usageSelectedItems) window._usageSelectedItems = [];
      var idx = window._usageSelectedItems.findIndex(function(i){ return i.id === itemId; });
      if (idx >= 0) {
        window._usageSelectedItems.splice(idx, 1);
      } else {
        var item = ITEMS.find(function(i){ return i.id === itemId; });
        if (item) window._usageSelectedItems.push({ id: item.id, name: item.name, icon: item.icon || '' });
      }
      V6Engine.render();
    },

    renderUsageTracker: function() {
      if (!window._usageSelectedItems) window._usageSelectedItems = [];
      if (!window._usageType) window._usageType = 'intervention';
      if (!window._usageSearchQ) window._usageSearchQ = '';
      var active = V6Engine.getActiveUsageSession();
      var log = V6Engine.getUsageLog();
      var selectedIds = window._usageSelectedItems.map(function(i){ return i.id; });
      var esc = V6Data.escapeHtml;

      // Active session display
      var activeHtml = '';
      if (active) {
        var elapsed = Math.floor((Date.now() - new Date(active.start).getTime()) / 1000);
        var hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        var mm2 = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        var ss = String(elapsed % 60).padStart(2, '0');
        activeHtml =
          '<div style="background:linear-gradient(135deg,rgba(192,57,43,.15),rgba(192,57,43,.08));border:2px solid var(--red);border-radius:14px;padding:16px;margin-bottom:16px;animation:pulse-border 2s infinite">' +
            '<div style="text-align:center;margin-bottom:10px">' +
              '<div style="font-family:Oswald,sans-serif;font-size:14px;letter-spacing:3px;color:var(--red);margin-bottom:4px">SESSION EN COURS</div>' +
              '<div style="font-family:JetBrains Mono,monospace;font-size:36px;font-weight:700;color:var(--txt)" class="usage-timer-display">' + hh + ':' + mm2 + ':' + ss + '</div>' +
              '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + active.type.toUpperCase() + ' \u2014 ' + esc(active.user) + '</div>' +
              '<div style="font-size:11px;color:var(--muted);margin-top:2px">D\u00E9but\u00E9 \u00E0 ' + new Date(active.start).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:12px">' +
              active.items.map(function(i){ return '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(192,57,43,.12);color:var(--red)">' + (i.icon || '\uD83D\uDCE6') + ' ' + i.name + '</span>'; }).join('') +
            '</div>' +
            '<div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px">' + active.items.length + ' item' + (active.items.length > 1 ? 's' : '') + '</div>' +
            '<button class="btn btn-red" onclick="V6Engine.stopUsageSession()">\u23F9 FIN UTILISATION</button>' +
          '</div>';
      }

      // Usage type selector
      var types = [{ key: 'intervention', label: 'INTERVENTION', icon: '\uD83D\uDEA8' }, { key: 'montage', label: 'MONTAGE', icon: '\uD83C\uDFD7\uFE0F' }, { key: 'formation', label: 'FORMATION', icon: '\uD83C\uDF93' }, { key: 'exercice', label: 'EXERCICE', icon: '\uD83C\uDFCB\uFE0F' }];
      var typeHtml = active ? '' :
        '<div style="margin-bottom:14px">' +
          '<div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px;text-align:center">TYPE D\'UTILISATION</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            types.map(function(t){ return '<button class="usage-type-btn btn-filter' + (window._usageType === t.key ? ' active' : '') + '" data-type="' + t.key + '" onclick="window._usageType=\'' + t.key + '\';document.querySelectorAll(\'.usage-type-btn\').forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\')" style="flex:1;min-width:70px;text-align:center;padding:10px 4px;font-size:11px">' + t.icon + '<br>' + t.label + '</button>'; }).join('') +
          '</div>' +
        '</div>';

      // Item selection by category
      var catHtml = '';
      if (!active) {
        var q = (window._usageSearchQ || '').toLowerCase();
        var _prioCats = ['Cordages', 'Sac Premonter #1', 'Sac Premonter #2', 'Sauveteur 1', 'Sauveteur 2', 'Harnais sauveteur', 'Premier de corder'];
        var categories = [];
        var catSet = {};
        ITEMS.forEach(function(i){ if (i.cat && !catSet[i.cat]) { catSet[i.cat] = true; categories.push(i.cat); } });
        categories.sort(function(a, b) {
          var pa = _prioCats.indexOf(a), pb = _prioCats.indexOf(b);
          if (pa !== -1 && pb !== -1) return pa - pb;
          if (pa !== -1) return -1;
          if (pb !== -1) return 1;
          return a.localeCompare(b);
        });
        var filteredCats = categories;
        if (q) {
          filteredCats = categories.filter(function(cat) {
            if (cat.toLowerCase().includes(q)) return true;
            return ITEMS.filter(function(i){ return i.cat === cat; }).some(function(i){ return i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q); });
          });
        }
        catHtml =
          '<div style="margin-bottom:14px">' +
            '<div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:6px;text-align:center">S\u00C9LECTION ITEMS</div>' +
            '<input type="text" placeholder="\uD83D\uDD0D Rechercher item, cat\u00E9gorie, ID..." value="' + (window._usageSearchQ || '') + '" oninput="window._usageSearchQ=this.value;V6Engine.render()" style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px;font-family:Inter,sans-serif;margin-bottom:10px;outline:none">' +
            '<div id="usage-cat-list" style="max-height:50vh;overflow-y:auto;-webkit-overflow-scrolling:touch">' +
            filteredCats.map(function(cat) {
              var catItems = ITEMS.filter(function(i){ return i.cat === cat; });
              var filtItems = catItems;
              if (q) filtItems = catItems.filter(function(i){ return i.cat.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q); });
              var selCount = filtItems.filter(function(i){ return selectedIds.includes(i.id); }).length;
              var allSel = selCount === filtItems.length && filtItems.length > 0;
              var icon = filtItems[0] ? filtItems[0].icon || '\uD83D\uDCE6' : '\uD83D\uDCE6';
              var isExp = window._usageExpandedCat === cat;
              return '<div style="border:1px solid ' + (allSel ? 'var(--blue)' : selCount > 0 ? 'rgba(59,130,246,.4)' : 'var(--border)') + ';border-radius:12px;margin-bottom:8px;overflow:hidden;' + (selCount > 0 ? 'background:rgba(59,130,246,.04)' : '') + '">' +
                '<div style="display:flex;align-items:center;padding:12px 14px;cursor:pointer;gap:8px" onclick="window._usageExpandedCat=' + (isExp ? 'null' : "'" + cat.replace(/'/g, "\\'") + "'") + ';V6Engine.render()">' +
                  '<span style="font-size:20px">' + icon + '</span>' +
                  '<div style="flex:1"><div style="font-size:14px;font-weight:700;color:' + (allSel ? 'var(--blue)' : 'var(--txt)') + '">' + esc(cat) + '</div><div style="font-size:11px;color:var(--muted)">' + filtItems.length + ' items' + (selCount ? ' \u2014 <span style="color:var(--blue)">' + selCount + ' s\u00E9lectionn\u00E9' + (selCount > 1 ? 's' : '') + '</span>' : '') + '</div></div>' +
                  '<span style="font-size:12px;color:var(--muted);transition:transform .2s;transform:rotate(' + (isExp ? '180' : '0') + 'deg)">\u25BC</span>' +
                '</div>' +
                (isExp ? '<div style="padding:0 10px 10px;border-top:1px solid var(--border)">' +
                  filtItems.map(function(item) {
                    var sel = selectedIds.includes(item.id);
                    var hrs = V6Engine.getItemUsage(item.id);
                    return '<div onclick="V6Engine.toggleUsageItem(\'' + item.id + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;border-bottom:1px solid rgba(59,130,246,.05)">' +
                      '<span style="width:20px;height:20px;border-radius:6px;border:2px solid ' + (sel ? 'var(--blue)' : 'var(--border)') + ';background:' + (sel ? 'var(--blue)' : 'transparent') + ';display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0">' + (sel ? '\u2713' : '') + '</span>' +
                      '<span style="font-size:14px">' + (item.icon || '\uD83D\uDCE6') + '</span>' +
                      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:' + (sel ? 'var(--blue)' : 'var(--txt)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(item.name) + '</div><div style="font-size:10px;color:var(--muted);font-family:JetBrains Mono,monospace">' + esc(item.id) + (hrs > 0 ? ' \u2014 <span style="color:var(--blue)">' + hrs.toFixed(1) + 'h</span>' : '') + '</div></div>' +
                    '</div>';
                  }).join('') +
                '</div>' : '') +
              '</div>';
            }).join('') +
            '</div>' +
          '</div>';
      }

      // Selected items summary
      var selSummary = '';
      if (!active && selectedIds.length > 0) {
        selSummary =
          '<div style="background:var(--card);border:1px solid var(--blue);border-radius:12px;padding:12px;margin-bottom:14px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-family:Oswald,sans-serif;font-size:13px;letter-spacing:2px;color:var(--blue)">\u23F1\uFE0F ITEMS S\u00C9LECTIONN\u00C9S</div><div style="font-family:JetBrains Mono,monospace;font-size:12px;color:var(--blue);font-weight:700">' + selectedIds.length + '</div></div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">' + window._usageSelectedItems.map(function(i){ return '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(59,130,246,.1);color:var(--blue)">' + (i.icon || '\uD83D\uDCE6') + ' ' + i.name + '</span>'; }).join('') + '</div>' +
            '<div style="display:flex;gap:8px"><button class="btn btn-blue" onclick="V6Engine.startUsageSession()" style="flex:1">\u25B6 D\u00C9BUT UTILISATION</button><button class="btn btn-outline" onclick="V6Engine.showManualUsageEntry()" style="flex:1">\u270F\uFE0F ENTR\u00C9E MANUELLE</button></div>' +
          '</div>';
      }

      // Usage history stats
      var allItems = Object.values(log);
      var totalHrs = allItems.reduce(function(s, item){ return s + item.total_hours; }, 0);
      var recentSessions = [];
      allItems.forEach(function(item) { (item.sessions || []).forEach(function(sess) { recentSessions.push(Object.assign({}, sess, { itemName: item.name })); }); });
      recentSessions.sort(function(a, b){ return new Date(b.end || b.start) - new Date(a.end || a.start); });
      var last10 = recentSessions.slice(0, 10);
      var totalMissions = 0;
      try { var hist = JSON.parse(localStorage.getItem('volo_history') || '[]'); totalMissions = hist.filter(function(h){ return h.mode === 'PICK-ON'; }).length; } catch(e) {}

      var historyHtml = '';
      if (last10.length > 0 || totalMissions > 0) {
        historyHtml =
          '<div style="margin-top:16px">' +
            '<div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:8px;text-align:center">HISTORIQUE UTILISATION</div>' +
            '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
              '<div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center"><div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--blue)">' + totalHrs.toFixed(1) + '</div><div style="font-size:10px;color:var(--muted);letter-spacing:1px">HEURES</div></div>' +
              '<div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center"><div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--gold)">' + recentSessions.length + '</div><div style="font-size:10px;color:var(--muted);letter-spacing:1px">SESSIONS</div></div>' +
              '<div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center"><div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--rescue)">' + totalMissions + '</div><div style="font-size:10px;color:var(--muted);letter-spacing:1px">MISSIONS</div></div>' +
              '<div style="flex:1;min-width:70px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center"><div style="font-family:JetBrains Mono,monospace;font-size:20px;font-weight:700;color:var(--txt)">' + allItems.length + '</div><div style="font-size:10px;color:var(--muted);letter-spacing:1px">ITEMS</div></div>' +
            '</div>' +
            (last10.length > 0 ? '<div style="max-height:300px;overflow-y:auto">' +
              last10.map(function(s) {
                var d = new Date(s.end || s.start);
                var shh = Math.floor((s.duration_min || 0) / 60);
                var smm = (s.duration_min || 0) % 60;
                var typeColors = { intervention: 'var(--red)', montage: 'var(--orange)', formation: 'var(--gold)', exercice: 'var(--blue)' };
                var condObj = s.condition ? USAGE_CONDITIONS.find(function(c){ return c.key === s.condition; }) : null;
                var condBadge = condObj && condObj.key !== 'ok' ? '<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.08);color:' + condObj.color + '">' + condObj.icon + ' ' + condObj.label.split('\u2014')[0].trim() + '</span>' : '';
                return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">' +
                  '<div style="width:6px;height:6px;border-radius:50%;background:' + (typeColors[s.type] || 'var(--muted)') + ';flex-shrink:0;margin-top:6px"></div>' +
                  '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (s.itemName || '') + '</div><div style="font-size:10px;color:var(--muted)">' + d.toLocaleDateString('fr-CA') + ' \u2014 ' + (s.type || '').toUpperCase() + ' \u2014 ' + (s.user || '') + '</div>' +
                  (condBadge ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">' + condBadge + '</div>' : '') +
                  '</div>' +
                  '<div style="font-family:JetBrains Mono,monospace;font-size:12px;color:var(--blue);font-weight:600;flex-shrink:0">' + (shh > 0 ? shh + 'h ' : '') + smm + 'm</div>' +
                '</div>';
              }).join('') +
            '</div>' : '') +
          '</div>';
      }

      return '<button class="top-back" onclick="V6Engine.setState({step:0})">\u25C0 RETOUR</button>' +
        '<h2>\u23F1\uFE0F UTILISATION MAT\u00C9RIEL</h2>' +
        '<p style="text-align:center;font-size:13px;color:var(--muted);margin-bottom:16px">Suivi des heures d\'utilisation r\u00E9elles par item</p>' +
        activeHtml + selSummary + typeHtml + catHtml + historyHtml;
    },

    // ──────────────────────────────────────────────────────────
    // CHAT SYSTEM (35 functions)
    // ──────────────────────────────────────────────────────────

    /**
     * Get current user info for chat
     * @returns {Object} { uid, name, role }
     */
    chatGetCurrentUser: function() {
      if (typeof PERSONNEL === 'undefined' || !PERSONNEL.length) return null;
      var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
      if (!user) return null;
      return { id: user.id, name: user.name, role: user.role, type: user.type };
    },

    chatColor: function(uid) {
      var h = 0;
      for (var i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
      return CHAT_COLORS[Math.abs(h) % CHAT_COLORS.length];
    },

    chatInitials: function(name) {
      var p = (name || '?').trim().split(' ');
      return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    },

    chatTimeAgo: function(ts) {
      var now = Date.now(), diff = now - ts;
      if (diff < 60000) return "a\u0300 l'instant";
      if (diff < 3600000) return Math.floor(diff / 60000) + 'min';
      if (diff < 86400000) { var d = new Date(ts); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); }
      if (diff < 172800000) { var d2 = new Date(ts); return 'hier ' + d2.getHours() + 'h' + String(d2.getMinutes()).padStart(2, '0'); }
      var d3 = new Date(ts); return d3.getDate() + '/' + (d3.getMonth() + 1) + ' ' + d3.getHours() + 'h' + String(d3.getMinutes()).padStart(2, '0');
    },

    chatDayLabel: function(ts) {
      var d = new Date(ts), today = new Date();
      if (d.toDateString() === today.toDateString()) return "AUJOURD'HUI";
      var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'HIER';
      return d.getDate() + ' ' + CHAT_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    },

    chatDbPath: function() {
      if (chatMode === 'dm' && chatDmTarget) {
        var cu = V6Engine.chatGetCurrentUser();
        if (!cu) return 'messages';
        var ids = [cu.id, chatDmTarget.id].sort();
        return 'private/' + ids[0] + '_' + ids[1];
      }
      if (chatMode === 'sauveteur') return 'channels/sauveteur';
      return 'messages';
    },

    chatGetDmUnread: function(targetId) {
      var key = CHAT_LS + 'dm_read_' + targetId;
      var lastRead = parseInt(localStorage.getItem(key) || '0');
      var cached = chatDmCache[targetId] || [];
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return 0;
      return cached.filter(function(m){ return m.authorId !== cu.id && m.timestamp > lastRead; }).length;
    },

    chatLoadDmCache: function() {
      if (!firebaseDB) return;
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      PERSONNEL.forEach(function(p) {
        if (p.id === cu.id) return;
        var ids = [cu.id, p.id].sort();
        var path = 'private/' + ids[0] + '_' + ids[1];
        firebaseDB.ref(path).orderByChild('timestamp').limitToLast(20).once('value', function(snap) {
          var data = snap.val();
          if (data) chatDmCache[p.id] = Object.values(data).sort(function(a, b){ return a.timestamp - b.timestamp; });
        });
      });
    },

    chatStartListening: function() {
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      if (!firebaseDB) { V6Engine.chatLoadLocal(); return; }
      V6Engine.chatStopListening();
      V6Engine.chatLoadDmCache();
      var ref = firebaseDB.ref(V6Engine.chatDbPath()).orderByChild('timestamp').limitToLast(200);
      chatListener = ref.on('value', function(snap) {
        var data = snap.val() || {};
        chatMessages = Object.values(data).sort(function(a, b){ return a.timestamp - b.timestamp; });
        if (state.step !== 17) {
          var lastRead = parseInt(localStorage.getItem(CHAT_LS_READ) || '0');
          chatUnreadCount = chatMessages.filter(function(m){ return m.timestamp > lastRead && m.authorId !== cu.id; }).length;
        }
        var lastRead2 = parseInt(localStorage.getItem(CHAT_LS_READ) || '0');
        var newMentions = chatMessages.filter(function(m){ return m.timestamp > lastRead2 && m.authorId !== cu.id && m.text && m.text.includes('@' + cu.name.split(' ')[0]); });
        if (newMentions.length > 0 && state.step !== 17) {
          V6UI.showToast('\uD83D\uDCAC ' + newMentions[newMentions.length - 1].authorName + ' vous a mentionn\u00E9', 'info');
        }
        if (state.step === 17) V6Engine.chatRenderMessages();
      });
    },

    chatStopListening: function() {
      if (chatListener && firebaseDB) {
        firebaseDB.ref(V6Engine.chatDbPath()).off('value', chatListener);
        chatListener = null;
      }
    },

    chatLoadLocal: function() {
      try { chatMessages = JSON.parse(localStorage.getItem(CHAT_LS + 'msgs_' + V6Engine.chatDbPath().replace(/\//g, '_')) || '[]'); } catch(e) { chatMessages = []; }
      if (state.step === 17) V6Engine.chatRenderMessages();
    },

    chatSaveLocal: function() {
      localStorage.setItem(CHAT_LS + 'msgs_' + V6Engine.chatDbPath().replace(/\//g, '_'), JSON.stringify(chatMessages.slice(-200)));
    },

    chatSend: function() {
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      var input = document.getElementById('chatInput');
      if (!input) return;
      var text = input.value.trim();
      if (!text) return;
      var msg = {
        id: 'm' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        authorId: cu.id, authorName: cu.name, text: text,
        timestamp: Date.now(), pinned: false, reactions: {}
      };
      if (firebaseDB) {
        firebaseDB.ref(V6Engine.chatDbPath() + '/' + msg.id).set(msg);
      } else {
        chatMessages.push(msg);
        V6Engine.chatSaveLocal();
        V6Engine.chatRenderMessages();
      }
      input.value = '';
      input.style.height = '36px';
      chatMentionDropdown = false;
      var dd = document.getElementById('chatMentionDD');
      if (dd) dd.classList.remove('visible');
    },

    chatReact: function(msgId, emoji) {
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      var path = V6Engine.chatDbPath() + '/' + msgId + '/reactions/' + emoji;
      if (firebaseDB) {
        var ref = firebaseDB.ref(path);
        ref.once('value', function(snap) {
          var arr = snap.val() || [];
          var idx = arr.indexOf(cu.id);
          if (idx > -1) arr.splice(idx, 1); else arr.push(cu.id);
          ref.set(arr.length ? arr : null);
        });
      } else {
        var msg = chatMessages.find(function(m){ return m.id === msgId; });
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        var idx2 = msg.reactions[emoji].indexOf(cu.id);
        if (idx2 > -1) msg.reactions[emoji].splice(idx2, 1); else msg.reactions[emoji].push(cu.id);
        if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
        V6Engine.chatSaveLocal();
        V6Engine.chatRenderMessages();
      }
    },

    chatPin: function(msgId) {
      if (!V6Auth.isUserChef()) return;
      var path = V6Engine.chatDbPath();
      if (firebaseDB) {
        firebaseDB.ref(path).once('value', function(snap) {
          var data = snap.val() || {};
          var updates = {};
          Object.keys(data).forEach(function(k) { if (data[k].pinned) updates[k + '/pinned'] = false; });
          updates[msgId + '/pinned'] = true;
          firebaseDB.ref(path).update(updates);
        });
      } else {
        chatMessages.forEach(function(m){ m.pinned = false; });
        var msg = chatMessages.find(function(m){ return m.id === msgId; });
        if (msg) msg.pinned = true;
        V6Engine.chatSaveLocal();
        V6Engine.chatRenderMessages();
      }
    },

    chatUnpin: function(msgId) {
      if (firebaseDB) {
        firebaseDB.ref(V6Engine.chatDbPath() + '/' + msgId + '/pinned').set(false);
      } else {
        var msg = chatMessages.find(function(m){ return m.id === msgId; });
        if (msg) msg.pinned = false;
        V6Engine.chatSaveLocal();
        V6Engine.chatRenderMessages();
      }
    },

    chatProcessMentions: function(text) {
      var result = text;
      PERSONNEL.forEach(function(p) {
        var firstName = p.name.split(' ')[0];
        var re = new RegExp('@' + firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        result = result.replace(re, '<span class="chat-mention">@' + firstName + '</span>');
      });
      return result;
    },

    chatSwitchChannel: function(channel) {
      if (chatMode === channel) return;
      if (channel === 'sauveteur' && V6Auth.isUserSurv()) return;
      V6Engine.chatStopListening();
      chatMode = channel;
      chatMessages = [];
      V6Engine.chatStartListening();
      V6Engine.chatRenderFull();
    },

    chatOpenDM: function(targetId, targetName) {
      V6Engine.chatStopListening();
      chatLastChannel = chatMode === 'dm' ? chatLastChannel : chatMode;
      chatMode = 'dm';
      chatDmTarget = { id: targetId, name: targetName };
      chatMessages = [];
      localStorage.setItem(CHAT_LS + 'dm_read_' + targetId, Date.now().toString());
      V6Engine.chatStartListening();
      V6Engine.chatRenderFull();
    },

    chatBackToGeneral: function() {
      V6Engine.chatStopListening();
      chatMode = chatLastChannel || 'general';
      chatDmTarget = null;
      chatMessages = [];
      V6Engine.chatStartListening();
      V6Engine.chatRenderFull();
    },

    renderMainChat: function() {
      chatUnreadCount = 0;
      localStorage.setItem(CHAT_LS_READ, Date.now().toString());
      V6Engine.chatStartListening();
      return '<button class="top-back" onclick="V6Engine.chatStopListening();V6Engine.setState({step:typeof window._chatPrevStep===\'number\'?window._chatPrevStep:0})">\u25C0 RETOUR</button>' +
        '<h2>\uD83D\uDCAC CHAT \u00C9QUIPE</h2>' +
        '<div id="chatContainer" style="margin-top:10px"></div>';
    },

    initMainChatUI: function() {
      V6Engine.chatRenderFull();
    },

    chatRenderFull: function() {
      var container = document.getElementById('chatContainer');
      if (!container) return;
      var cu = V6Engine.chatGetCurrentUser();
      var esc = V6Data.escapeHtml;
      if (!cu) { container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px">Connectez-vous pour acc\u00E9der au chat</p>'; return; }
      var pinned = chatMessages.find(function(m){ return m.pinned; });
      var isDM = chatMode === 'dm';
      var isSauv = chatMode === 'sauveteur';
      var isSurvUser = V6Auth.isUserSurv();
      var sauvCount = PERSONNEL.filter(function(p){ return p.type === 'SAUVETEUR'; }).length;

      var html = '<div class="chat-wrap">';
      html += '<div class="chat-header">';
      if (isDM) {
        html += '<button onclick="V6Engine.chatBackToGeneral()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:2px 6px" aria-label="Retour au canal g\u00E9n\u00E9ral">\u2039</button>';
        html += '<div class="chat-header-title">' + esc(chatDmTarget.name) + '</div>';
        html += '<div class="chat-header-sub">MESSAGE PRIV\u00C9</div>';
      } else {
        html += '<span style="font-size:16px">' + (isSauv ? '\uD83E\uDD85' : '\uD83D\uDCAC') + '</span>';
        html += '<div class="chat-header-title">' + (isSauv ? 'SAUVETEURS' : 'TOUS') + '</div>';
        html += '<div class="chat-header-sub">' + (isSauv ? sauvCount + ' sauveteurs' : PERSONNEL.length + ' membres') + '</div>';
        if (V6Auth.isUserChef()) {
          html += '<button onclick="V6Engine.chatShowDMList()" style="background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:var(--gold);border-radius:8px;padding:5px 10px;font-family:Oswald,sans-serif;font-size:9px;letter-spacing:1px;cursor:pointer">\uD83D\uDCE8 DM</button>';
        }
      }
      html += '</div>';
      if (!isDM) {
        html += '<div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--card);flex-shrink:0">';
        html += '<button onclick="V6Engine.chatSwitchChannel(\'general\')" style="flex:1;padding:9px 0;font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;border:none;cursor:pointer;background:none;color:' + (chatMode === 'general' ? 'var(--rescue)' : 'var(--muted)') + ';border-bottom:2px solid ' + (chatMode === 'general' ? 'var(--rescue)' : 'transparent') + ';transition:all .15s">\uD83D\uDCAC TOUS</button>';
        if (!isSurvUser) {
          html += '<button onclick="V6Engine.chatSwitchChannel(\'sauveteur\')" style="flex:1;padding:9px 0;font-family:Oswald,sans-serif;font-size:11px;letter-spacing:2px;border:none;cursor:pointer;background:none;color:' + (chatMode === 'sauveteur' ? 'var(--rescue)' : 'var(--muted)') + ';border-bottom:2px solid ' + (chatMode === 'sauveteur' ? 'var(--rescue)' : 'transparent') + ';transition:all .15s">\uD83E\uDD85 SAUVETEURS</button>';
        }
        html += '</div>';
      }
      if (pinned) {
        html += '<div class="chat-pinned"><span class="cp-icon">\uD83D\uDCCC</span><span class="cp-text"><strong>' + esc(pinned.authorName.split(' ')[0]) + '</strong> : ' + esc(pinned.text) + '</span>';
        if (V6Auth.isUserChef()) html += '<button class="cp-close" onclick="V6Engine.chatUnpin(\'' + pinned.id + '\')" aria-label="D\u00E9s\u00E9pingler le message">\u2715</button>';
        html += '</div>';
      }
      html += '<div class="chat-messages" id="chatMsgArea"></div>';
      html += '<div id="chatNewBtn" style="display:none;text-align:center;padding:4px"><button class="chat-new-msg-btn" onclick="V6Engine.chatScrollBottom()">\u2193 Nouveaux messages</button></div>';
      html += '<div class="chat-input-wrap" style="position:relative">';
      html += '<div id="chatMentionDD" class="chat-mention-dd"></div>';
      var chatPlaceholder = isDM ? 'Message \u00E0 ' + esc(chatDmTarget.name.split(' ')[0]) + '\u2026' : isSauv ? 'Message aux sauveteurs\u2026' : 'Message \u00E0 tous\u2026';
      html += '<textarea class="chat-input" id="chatInput" placeholder="' + chatPlaceholder + '" rows="1" oninput="V6Engine.chatOnInput(this)" onkeydown="V6Engine.chatOnKeydown(event)"></textarea>';
      html += '<button class="chat-send" id="chatSendBtn" onclick="V6Engine.chatSend()" aria-label="Envoyer le message">\u27A4</button>';
      html += '</div></div>';
      container.innerHTML = html;
      V6Engine.chatRenderMessages();

      var area = document.getElementById('chatMsgArea');
      if (area) {
        area.addEventListener('scroll', function() {
          var atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;
          chatIsAtBottom = atBottom;
          if (atBottom) {
            chatNewMsgCount = 0;
            var btn = document.getElementById('chatNewBtn');
            if (btn) btn.style.display = 'none';
          }
        });
      }
    },

    chatRenderMessages: function() {
      var area = document.getElementById('chatMsgArea');
      if (!area) return;
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      var esc = V6Data.escapeHtml;
      if (!chatMessages.length) {
        var emptyIcon = chatMode === 'sauveteur' ? '\uD83E\uDD85' : '\uD83D\uDCAC';
        var emptyLabel = chatMode === 'sauveteur' ? 'CANAL SAUVETEURS' : 'AUCUN MESSAGE';
        var emptySub = chatMode === 'sauveteur' ? 'Premier message entre sauveteurs' : 'Soyez le premier \u00E0 \u00E9crire';
        area.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--muted)"><div style="font-size:32px;margin-bottom:10px">' + emptyIcon + '</div><div style="font-family:Oswald,sans-serif;font-size:12px;letter-spacing:2px">' + emptyLabel + '</div><div style="font-size:11px;margin-top:4px">' + emptySub + '</div></div>';
        return;
      }
      var html = '';
      var lastAuthor = null, lastTime = 0, lastDay = '';
      chatMessages.forEach(function(msg) {
        var isMine = msg.authorId === cu.id;
        var sameAuthor = msg.authorId === lastAuthor;
        var closeInTime = msg.timestamp - lastTime < 120000;
        var grouped = sameAuthor && closeInTime;
        var day = V6Engine.chatDayLabel(msg.timestamp);
        if (day !== lastDay) {
          html += '<div class="chat-day-sep">' + day + '</div>';
          lastDay = day;
        }
        if (!grouped) {
          if (lastAuthor !== null) html += '</div></div>';
          var color = V6Engine.chatColor(msg.authorId);
          html += '<div class="chat-group' + (isMine ? ' mine' : '') + '">';
          html += '<div class="chat-avatar-chat" style="background:' + color + '">' + esc(V6Engine.chatInitials(msg.authorName)) + '</div>';
          html += '<div class="chat-bubbles">';
          if (!isMine) html += '<div class="chat-author">' + esc(msg.authorName.split(' ')[0]) + '</div>';
        }
        var processedText = V6Engine.chatProcessMentions(msg.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
        html += '<div class="chat-bubble' + (isMine ? ' mine' : ' other') + '" data-msgid="' + msg.id + '">';
        html += '<div class="chat-hover-actions">';
        html += '<button onclick="V6Engine.chatReact(\'' + msg.id + '\',\'\uD83D\uDC4D\')" title="\uD83D\uDC4D">\uD83D\uDC4D</button>';
        html += '<button onclick="V6Engine.chatReact(\'' + msg.id + '\',\'\u2705\')" title="\u2705">\u2705</button>';
        html += '<button onclick="V6Engine.chatReact(\'' + msg.id + '\',\'\u274C\')" title="\u274C">\u274C</button>';
        if (V6Auth.isUserChef() && !msg.pinned) html += '<button onclick="V6Engine.chatPin(\'' + msg.id + '\')" title="\u00C9pingler">\uD83D\uDCCC</button>';
        html += '</div>';
        html += processedText;
        html += '<span class="cb-time">' + V6Engine.chatTimeAgo(msg.timestamp) + '</span>';
        html += '</div>';
        if (msg.reactions && Object.keys(msg.reactions).length) {
          html += '<div class="chat-reactions">';
          Object.entries(msg.reactions).forEach(function(entry) {
            var emoji = entry[0], uids = entry[1];
            if (!uids || !uids.length) return;
            var active = uids.includes(cu.id);
            html += '<button class="chat-react-btn' + (active ? ' active' : '') + '" onclick="V6Engine.chatReact(\'' + msg.id + '\',\'' + emoji + '\')">' + emoji + ' <span class="cr-count">' + uids.length + '</span></button>';
          });
          html += '</div>';
        }
        lastAuthor = msg.authorId;
        lastTime = msg.timestamp;
      });
      if (lastAuthor !== null) html += '</div></div>';
      area.innerHTML = html;
      if (chatIsAtBottom) {
        area.scrollTop = area.scrollHeight;
      } else {
        chatNewMsgCount++;
        var btn = document.getElementById('chatNewBtn');
        if (btn && chatNewMsgCount > 0) btn.style.display = 'block';
      }
    },

    chatScrollBottom: function() {
      var area = document.getElementById('chatMsgArea');
      if (area) { area.scrollTop = area.scrollHeight; chatIsAtBottom = true; }
      chatNewMsgCount = 0;
      var btn = document.getElementById('chatNewBtn');
      if (btn) btn.style.display = 'none';
    },

    chatOnInput: function(el) {
      el.style.height = '36px';
      el.style.height = Math.min(80, el.scrollHeight) + 'px';
      var val = el.value;
      var cursor = el.selectionStart;
      var before = val.substring(0, cursor);
      var atMatch = before.match(/@(\w*)$/);
      var dd = document.getElementById('chatMentionDD');
      var esc = V6Data.escapeHtml;
      if (atMatch) {
        chatMentionFilter = atMatch[1].toLowerCase();
        var people = PERSONNEL.filter(function(p) {
          var fn = p.name.split(' ')[0].toLowerCase();
          return fn.startsWith(chatMentionFilter) || p.name.toLowerCase().includes(chatMentionFilter);
        }).slice(0, 8);
        if (people.length) {
          chatMentionIdx = 0;
          var ddHtml = '';
          people.forEach(function(p, i) {
            var roleColor = p.type === 'SAUVETEUR' ? 'var(--rescue)' : 'var(--blue)';
            ddHtml += '<div class="chat-mention-dd-item' + (i === 0 ? ' selected' : '') + '" onclick="V6Engine.chatInsertMention(\'' + esc(p.name.split(' ')[0]) + '\')" data-idx="' + i + '"><div class="chat-avatar-chat" style="width:24px;height:24px;font-size:9px;background:' + V6Engine.chatColor(p.id) + '">' + esc(V6Engine.chatInitials(p.name)) + '</div><span>' + esc(p.name) + '</span><span class="cmdi-role" style="color:' + roleColor + '">' + esc(p.role) + '</span></div>';
          });
          dd.innerHTML = ddHtml;
          dd.classList.add('visible');
          chatMentionDropdown = true;
        } else {
          dd.classList.remove('visible');
          chatMentionDropdown = false;
        }
      } else {
        if (dd) dd.classList.remove('visible');
        chatMentionDropdown = false;
      }
    },

    chatInsertMention: function(firstName) {
      var input = document.getElementById('chatInput');
      if (!input) return;
      var val = input.value;
      var cursor = input.selectionStart;
      var before = val.substring(0, cursor);
      var after = val.substring(cursor);
      var newBefore = before.replace(/@\w*$/, '@' + firstName + ' ');
      input.value = newBefore + after;
      input.selectionStart = input.selectionEnd = newBefore.length;
      input.focus();
      chatMentionDropdown = false;
      var dd = document.getElementById('chatMentionDD');
      if (dd) dd.classList.remove('visible');
    },

    chatOnKeydown: function(e) {
      if (chatMentionDropdown) {
        var dd = document.getElementById('chatMentionDD');
        var items = dd ? dd.querySelectorAll('.chat-mention-dd-item') : [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          chatMentionIdx = Math.min(chatMentionIdx + 1, items.length - 1);
          items.forEach(function(it, i){ it.classList.toggle('selected', i === chatMentionIdx); });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          chatMentionIdx = Math.max(chatMentionIdx - 1, 0);
          items.forEach(function(it, i){ it.classList.toggle('selected', i === chatMentionIdx); });
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (items[chatMentionIdx]) items[chatMentionIdx].click();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          chatMentionDropdown = false;
          if (dd) dd.classList.remove('visible');
          return;
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        V6Engine.chatSend();
      }
    },

    chatShowDMList: function() {
      V6Engine.chatStopListening();
      chatLastChannel = chatMode;
      chatMode = 'dm-list';
      V6Engine.chatRenderDMList();
    },

    chatRenderDMList: function() {
      var container = document.getElementById('chatContainer');
      if (!container) return;
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      var esc = V6Data.escapeHtml;
      var people = PERSONNEL.slice().sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });
      var html = '<div class="chat-wrap"><div class="chat-header"><button onclick="V6Engine.chatBackToGeneral()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:2px 6px" aria-label="Retour au canal g\u00E9n\u00E9ral">\u2039</button><div class="chat-header-title">MESSAGES PRIV\u00C9S</div><div class="chat-header-sub">' + people.length + ' membres</div></div>';
      html += '<div style="padding:8px 14px"><input type="text" class="chat-input" placeholder="Rechercher\u2026" style="border-radius:10px;padding:8px 12px" oninput="V6Engine.chatFilterDM(this.value)"></div>';
      html += '<div class="chat-dm-list" id="chatDMList">';
      people.forEach(function(p) {
        if (p.id === cu.id) return;
        var color = V6Engine.chatColor(p.id);
        var roleColor = p.type === 'SAUVETEUR' ? 'var(--rescue)' : 'var(--blue)';
        var unread = V6Engine.chatGetDmUnread(p.id);
        html += '<div class="chat-dm-item" onclick="V6Engine.chatOpenDM(\'' + p.id + '\',\'' + p.name.replace(/'/g, "\\'") + '\')" data-name="' + p.name.toLowerCase() + '"><div class="chat-avatar-chat" style="width:28px;height:28px;font-size:10px;background:' + color + '">' + esc(V6Engine.chatInitials(p.name)) + '</div><div class="dmi-name">' + esc(p.name) + ' <span style="font-family:Oswald,sans-serif;font-size:9px;letter-spacing:1px;color:' + roleColor + ';margin-left:4px">' + (p.type === 'SAUVETEUR' ? 'SAUV' : 'SURV') + '</span></div>' + (unread > 0 ? '<div class="dmi-badge"></div>' : '') + '</div>';
      });
      html += '</div></div>';
      container.innerHTML = html;
    },

    chatFilterDM: function(val) {
      var items = document.querySelectorAll('#chatDMList .chat-dm-item');
      var q = val.toLowerCase();
      items.forEach(function(it) {
        it.style.display = it.dataset.name.includes(q) ? '' : 'none';
      });
    },

    chatStartBackgroundListener: function() {
      var cu = V6Engine.chatGetCurrentUser();
      if (!cu) return;
      if (chatListener) return;
      if (!firebaseDB) {
        V6Engine.chatLoadLocal();
        var lastRead = parseInt(localStorage.getItem(CHAT_LS_READ) || '0');
        chatUnreadCount = chatMessages.filter(function(m){ return m.timestamp > lastRead && m.authorId !== cu.id; }).length;
        if (typeof window.updateChatFab === 'function') window.updateChatFab();
        return;
      }
      var bgRef = firebaseDB.ref('messages').orderByChild('timestamp').limitToLast(50);
      chatListener = bgRef.on('value', function(snap) {
        var data = snap.val() || {};
        var bgMessages = Object.values(data).sort(function(a, b){ return a.timestamp - b.timestamp; });
        if (state.step !== 17) {
          chatMessages = bgMessages;
          var lastRead2 = parseInt(localStorage.getItem(CHAT_LS_READ) || '0');
          chatUnreadCount = bgMessages.filter(function(m){ return m.timestamp > lastRead2 && m.authorId !== cu.id; }).length;
          if (typeof window.updateChatFab === 'function') window.updateChatFab();
        } else if (chatMode === 'general') {
          chatMessages = bgMessages;
          V6Engine.chatRenderMessages();
        }
      });
    }
  };

  // ── Global aliases for onclick handlers in rendered HTML ──

  // Auth / session
  window.unlockScreen = function() { V6Auth.unlockScreen(); };
  window.doLogout = function() { V6Auth.doLogout(); };
  window.resetAll = function() { V6Auth.resetAll(); };
  window.onPinContinue = function() { V6Auth.onPinContinue(); };

  // Data / backup
  window.exportBackup = function() { V6Data.exportBackup(); };
  window.importBackup = function() { V6Data.importBackup(); };
  window.parseFlexDate = function(str) { return V6Data.parseFlexDate(str); };

  // Vehicle selection
  window._setVehicleCamion = _setVehicleCamion;
  window._setVehicleTrailer = _setVehicleTrailer;

  // Render helpers called from render()
  window.renderActivePickOnBanner = function() {
    var myPO = V6Data.getMyActivePickOns();
    if (!myPO.length) return '';
    return V6UI.renderActivePickOnBanner ? V6UI.renderActivePickOnBanner() : '';
  };
  window.renderPickoffSelect = function() {
    return V6UI.renderPickoffSelect ? V6UI.renderPickoffSelect() : '';
  };
  window.renderChatFab = function() {
    return V6UI.renderChatFab ? V6UI.renderChatFab() : '';
  };
  window.getUrgencyBannerHtml = function() {
    return V6UI.getUrgencyBannerHtml ? V6UI.getUrgencyBannerHtml() : '';
  };
  window.getAnnouncementBannerHtml = function() {
    return V6UI.getAnnouncementBannerHtml ? V6UI.getAnnouncementBannerHtml() : '';
  };
  window.renderChefDashboard = function() {
    return V6UI.renderChefDashboard ? V6UI.renderChefDashboard() : '';
  };
  window.renderPhotoSetup = function() {
    return V6UI.renderPhotoSetup ? V6UI.renderPhotoSetup() : '<div style="text-align:center;padding:40px;color:var(--muted)">Module photos non disponible</div>';
  };
  window.renderVersionFooter = function() { return V6UI.renderVersionFooter ? V6UI.renderVersionFooter() : ''; };
  window.renderWeatherWidget = function(w) { return V6UI.renderWeatherWidget ? V6UI.renderWeatherWidget(w) : ''; };
  window.fetchWeather = function() { return V6UI.fetchWeather ? V6UI.fetchWeather() : Promise.resolve(); };
  window.updateChatFab = function() { if (V6UI.updateChatFab) V6UI.updateChatFab(); };

  // Pointage / gains helpers
  window.isPointageActive = function() {
    try { var ptg = JSON.parse(localStorage.getItem('volo-ptg-onsite') || 'null'); return !!ptg; } catch(e) { return false; }
  };
  window.getSetupPhotos = function() {
    try { return JSON.parse(localStorage.getItem('volo_setup_photos') || '[]'); } catch(e) { return []; }
  };
  window.getPayPeriods = function() {
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
  };

  // Terrain contact
  window.loadTerrainContact = function(destId) {
    var c = V6Data.loadTerrainContact(destId);
    if (c) {
      var st = V6Engine.getState();
      if (c.nom) st.personneRessource = c.nom;
      if (c.tel) st.personneRessourceTel = c.tel;
      if (c.email) st.personneRessourceEmail = c.email;
    }
  };
  window.saveTerrainContact = function() {
    var st = V6Engine.getState();
    if (st.dest && st.personneRessource) {
      V6Data.saveTerrainContact(st.dest, { nom: st.personneRessource, tel: st.personneRessourceTel || '', email: st.personneRessourceEmail || '' });
    }
  };

  // Modal helpers
  window.showAddModal = function(type) {
    V6Engine.setState({ showModal: 'add_' + type });
  };

  // ── Scan flow globals ──
  window.leaveScan = function(targetStep) {
    if(state.scanned.length > 0){
      window._leaveScanTarget = targetStep;
      V6Engine.setState({showModal: 'leaveScan'});
      return;
    }
    V6Scanner.stopQrScanner();
    V6Engine.setState({step: targetStep || 0, scanned: [], sceaux: {}});
  };
  window.setScanMode = function(mode) {
    V6Scanner.stopQrScanner();
    state.scanMode = mode;
    state.camMode = (mode === 'live');
    V6Engine.render();
    if(mode === 'live') setTimeout(function(){ V6Scanner.startQrScanner(); }, 500);
  };
  window.scanAllExpected = function() {
    var expected = window._pickoffExpected || [];
    if(!expected.length) return;
    var already = state.scanned.map(function(s){ return s.id; });
    var toAdd = expected.filter(function(e){ return !already.includes(e.id); });
    if(!toAdd.length){ V6UI.showToast('\u2713 Tous d\u00E9j\u00E0 scann\u00E9s', 'info'); return; }
    var newItems = toAdd.map(function(e){
      var it = ITEMS.find(function(i){ return i.id === e.id; });
      return it ? Object.assign({}, it, {scanTime: new Date()}) : {id:e.id, name:e.name||e.id, icon:'\uD83D\uDCE6', cat:'', scanTime: new Date()};
    });
    try{ if(navigator.vibrate) navigator.vibrate([100,50,100,50,100]); }catch(e){}
    V6UI.showToast('\uD83D\uDCE6 ' + newItems.length + ' items retourn\u00E9s', 'ok');
    V6Engine.setState({scanned: state.scanned.concat(newItems)});
  };
  window.setVueItems = setVueItems;
  window.toggleScannedGroup = function(groupKey) { V6Engine.toggleScannedGroup(groupKey); };
  window.removeScannedItem = function(idx) { V6Engine.removeScannedItem(idx); };
  window.scanItem = function(id) { V6Engine.scanItem(id); };
  window.scanGroup = function(grp) { V6Engine.scanGroup(grp); };
  window.updateItemResults = function(val) { V6Engine.updateItemResults(val); };
  window.swapCamera = function() { V6Scanner.swapCamera(); };
  window.stopQrScanner = function() { V6Scanner.stopQrScanner(); };

  // ── Pick-Off global ──
  window.startPickOff = function() {
    window._pickoffExpected = null;
    window._pickoffOriginalTx = null;
    V6Engine.setState({step:2, mode:'pickoff', scanned:[], sceaux:{}, depot:null, dest:null, remorques:[], sauvs:[], numProjet:'', personneRessource:'', detailsJob:'', _showAllPickoff:false});
  };

  // ── Modal onclick helper functions ──
  window._scanGroupCheckMissing = _scanGroupCheckMissing;
  window._scanGroupExecute = _scanGroupExecute;
  window._finalizeScanItem = _finalizeScanItem;

  window._execClear = function() {
    var p = window._confirmClearPending || {};
    if(p.key) localStorage.removeItem(p.key);
    V6Engine.setState({showModal: null});
    if(window._confirmClearCb) window._confirmClearCb();
  };

  window._submitPickoffMissing = function() {
    var noteEl = document.getElementById('pickoff-missing-note');
    var noteManquant = noteEl ? noteEl.value.trim() : '';
    if(!noteManquant || noteManquant.length < 10){ V6UI.showToast('\u274C Note obligatoire (min. 10 caract\u00E8res)', 'err'); return; }
    var missing = window._pickoffMissing || [];
    var incident = {
      type: 'MANQUANT_PICK_OFF',
      items: missing.map(function(m){ return m.id; }),
      items_noms: missing.map(function(m){ var it = ITEMS.find(function(i){ return i.id===m.id; }); return it ? it.name : m.id; }),
      note: noteManquant, user: state.pin, timestamp: V6Data.tsNow()
    };
    var incidents = []; try{ incidents = JSON.parse(localStorage.getItem('volo_incidents')||'[]'); }catch(e){}
    incidents.unshift(incident);
    localStorage.setItem('volo_incidents', JSON.stringify(incidents));
    var webhookPayload = {
      type: 'INCIDENT', sous_type: 'MANQUANT_PICK_OFF',
      items_manquants: JSON.stringify(missing.map(function(m){ return m.id; })),
      items_noms: JSON.stringify(missing.map(function(m){ var it = ITEMS.find(function(i){ return i.id===m.id; }); return it ? it.name : m.id; })),
      note: noteManquant, user_pin: state.pin, timestamp: V6Data.tsNow()
    };
    fetch(VOLO_WH_M, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(webhookPayload)}).catch(function(){});
    window._pickoffMissing = null;
    V6Engine.setState({showModal: null});
    V6Engine.doValidation();
  };

  window.doAddItem = function(addType) {
    var nameEl = document.getElementById('add-name');
    var name = nameEl ? nameEl.value.trim() : '';
    if(!name){ V6UI.showToast('\u26A0\uFE0F Nom requis', 'err'); return; }
    var regionEl = document.getElementById('add-region');
    var region = regionEl ? regionEl.value : 'ESTRIE';
    var id = 'CUSTOM-' + Date.now();
    if(addType === 'sauveteur'){
      var voloEl = document.getElementById('add-volo');
      var volo = (voloEl ? voloEl.value.trim() : '').toUpperCase();
      if(!volo){ V6UI.showToast('\u26A0\uFE0F ID VOLO requis', 'err'); return; }
      if(!/^V\d{4}$/.test(volo)){ V6UI.showToast('\u26A0\uFE0F Format invalide \u2014 ex: V0400', 'err'); return; }
      if(PERSONNEL.find(function(p){ return p.volo===volo; })){ V6UI.showToast('\u26A0\uFE0F ID VOLO d\u00E9j\u00E0 existant', 'err'); return; }
      var parts = name.split(' ').filter(Boolean);
      var initials = (parts[0] ? parts[0][0] : 'X') + (parts[1] ? parts[1][0] : 'X');
      var num = volo.replace('V','');
      var sauvId = 'SAUV-' + initials.toUpperCase() + '-' + num;
      PERSONNEL.push({id:sauvId, volo:volo, name:name, role:'SAUVETEUR', type:'SAUVETEUR', region:region, ville:''});
      V6UI.showToast('\u2705 ' + name + ' ajout\u00E9 (' + volo + ')', 'ok');
    } else if(addType === 'remorque'){
      REMORQUES.push({id:id, name:name});
      V6UI.showToast('\u2705 ' + name + ' ajout\u00E9', 'ok');
    } else if(addType === 'depot'){
      DEPOTS.push({id:id, name:name, region:region});
      V6UI.showToast('\u2705 D\u00E9p\u00F4t ajout\u00E9', 'ok');
    } else if(addType === 'destination'){
      DESTINATIONS.push({id:id, name:name, region:region});
      V6UI.showToast('\u2705 Destination ajout\u00E9e', 'ok');
    } else if(addType === 'item'){
      var catEl = document.getElementById('add-cat');
      var cat = catEl ? catEl.value : 'EPI';
      ITEMS.push({id:id, name:name, cat:cat, icon:'\uD83D\uDCE6'});
      V6UI.showToast('\u2705 Item ajout\u00E9', 'ok');
    }
    V6Engine.setState({showModal: null});
  };

  // ── Caisse module globals ──
  window.cmQty = function(grpId, name, newQty, max) {
    if(!window._caisseSelected) window._caisseSelected = {};
    var q = Math.max(0, Math.min(max, newQty));
    if(q === 0) delete window._caisseSelected[name]; else window._caisseSelected[name] = q;
    if(window._renderCaisseItems) window._renderCaisseItems();
  };

  window.cmConfirmDeduction = function(grpId) {
    var selected = window._caisseSelected || {};
    var grouped = window._caisseGroupedItems || [];
    var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
    if(!user){ V6UI.showToast('Utilisateur non identifi\u00E9', 'err'); return; }
    var itemsPris = [];
    Object.keys(selected).forEach(function(name) {
      var qty = selected[name];
      var g = grouped.find(function(x){ return x.name === name; });
      if(!g || qty === 0) return;
      g.availableIds.slice(0, qty).forEach(function(id){ itemsPris.push({id:id, name:g.name, icon:g.icon||'\uD83D\uDCE6', etat:g.etat||'?'}); });
    });
    if(!itemsPris.length){ V6UI.showToast('Aucun item s\u00E9lectionn\u00E9', 'info'); return; }
    var stock = V6Engine.getCaisseStock();
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g2){ return g2.id === grpId; }) : null;
    if(!stock[grpId]){ if(grp) stock[grpId] = [].concat(grp.items); }
    itemsPris.forEach(function(item){ var idx = stock[grpId].indexOf(item.id); if(idx > -1) stock[grpId].splice(idx, 1); });
    V6Engine.saveCaisseStock(stock);
    V6Engine.saveStockHistory(grpId, {ts:new Date().toISOString(), action:'PRISE', sauveteur:user.name, volo:user.volo, items:itemsPris, restant:stock[grpId].length});
    V6Engine.sendStockWebhook({type:'STOCK_DEDUCTION', caisse_id:grpId, caisse_name:grp?grp.name:grpId, sauveteur_id:user.id||user.volo, sauveteur_nom:user.name, sauveteur_volo:user.volo, items_pris:itemsPris.map(function(i){return {id:i.id, name:i.name};}), nb_items:itemsPris.length, stock_restant:stock[grpId].length, stock_total:grp?grp.items.length:0, destination:state.dest||'', projet:state.numProjet||'', timestamp:new Date().toISOString()});
    V6UI.showToast('\u2705 ' + itemsPris.length + ' item' + (itemsPris.length>1?'s':'') + ' d\u00E9duit' + (itemsPris.length>1?'s':''), 'ok');
    cmUpdateSummary(); V6Engine.cmOpenDetail(grpId);
  };

  window.cmOpenEdit = function(grpId) {
    if(!V6Engine.isStockManager()){ V6UI.showToast('Acc\u00E8s refus\u00E9 \u2014 Responsable inventaire requis', 'err'); return; }
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null;
    if(!grp) return;
    var main = document.getElementById('cm-tc-caisses'); if(!main) return;
    var esc = V6Data.escapeHtml;
    var dispoIds = V6Engine.getCaisseItems(grpId);
    main.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">' +
        '<button class="cm-btn cm-out" onclick="V6Engine.cmOpenDetail(\'' + grpId + '\')">\u2190 RETOUR</button>' +
        '<div style="flex:1;font-family:\'Oswald\',sans-serif;font-size:14px;color:#D4A017;letter-spacing:2px">\u270F\uFE0F ' + esc(grp.name) + '</div>' +
      '</div>' +
      '<div class="cm-manager-badge">\uD83D\uDD11 Modifications envoy\u00E9es en temps r\u00E9el vers Google Sheets</div>' +
      '<div class="cm-sec">ITEMS ACTUELS</div>' +
      '<div id="cm-edit-items-' + grpId + '"></div>' +
      '<div class="cm-sec">AJOUTER UN ITEM CATALOGU\u00C9</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<input class="cm-add-input" id="cm-add-id" placeholder="ID item (ex: HAR-001)" list="cm-dl">' +
        '<datalist id="cm-dl">' + ITEMS.slice(0,200).map(function(i){ return '<option value="' + i.id + '">' + esc(i.name) + '</option>'; }).join('') + '</datalist>' +
        '<button class="cm-btn cm-g" onclick="cmAddItem(\'' + grpId + '\')">+ AJOUTER</button>' +
      '</div>' +
      '<div class="cm-sec">CR\u00C9ER UN NOUVEL ITEM</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input class="cm-add-input" id="cm-new-name" placeholder="Nom de l\'item" style="flex:2">' +
        '<input class="cm-add-input" id="cm-new-icon" placeholder="\uD83D\uDD27" style="width:50px;flex:0 0 55px">' +
        '<button class="cm-btn cm-gold" onclick="cmCreateItem(\'' + grpId + '\')">+ CR\u00C9ER</button>' +
      '</div>';
    cmRenderEditItems(grpId);
  };

  function cmUpdateSummary() {
    var grps = typeof GROUPS !== 'undefined' ? GROUPS : [];
    var stock = V6Engine.getCaisseStock();
    var d = 0, t = 0, low = 0;
    grps.forEach(function(g){ var tot = g.items.length; var dis = (stock[g.id]||g.items).length; d += dis; t += tot; if(tot>0 && dis/tot<0.3) low++; });
    var el = document.getElementById('cm-hdr-summary');
    if(el) el.textContent = d + '/' + t + ' items disponibles' + (low ? ' \u00B7 \u26A0\uFE0F ' + low + ' stock bas' : '');
    var dash = document.getElementById('caisse-dashboard-summary');
    if(dash) dash.textContent = d + '/' + t + ' dispo' + (low ? ' \u00B7 \u26A0\uFE0F ' + low + ' bas' : '');
  }

  function cmRenderEditItems(grpId) {
    var el = document.getElementById('cm-edit-items-' + grpId); if(!el) return;
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null; if(!grp) return;
    var dispoIds = V6Engine.getCaisseItems(grpId);
    var esc = V6Data.escapeHtml;
    el.innerHTML = grp.items.map(function(id){
      var item = ITEMS.find(function(i){ return i.id === id; }) || {id:id, name:id, icon:'\uD83D\uDCE6', etat:'?'};
      var dispo = dispoIds.includes(id);
      return '<div class="cm-item-row">' +
        '<span style="font-size:16px">' + (item.icon||'\uD83D\uDCE6') + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;color:#F0F0F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(item.name) + '</div>' +
          '<div style="font-size:9px;color:#444">' + id + '</div>' +
        '</div>' +
        '<span class="cm-tag ' + (dispo?'cm-tag-g':'cm-tag-r') + '" style="font-size:9px">' + (dispo?'DISPO':'SORTI') + '</span>' +
        '<div style="display:flex;gap:4px;margin-left:8px">' +
          (!dispo ? '<button class="cm-btn cm-g" style="padding:5px 9px;font-size:10px" onclick="cmReturnItem(\'' + grpId + '\',\'' + id + '\')">\u21A9</button>' : '') +
          '<button class="cm-btn cm-out" style="padding:5px 9px;font-size:10px;border-color:rgba(192,57,43,.4);color:#C0392B" onclick="cmRemoveItem(\'' + grpId + '\',\'' + id + '\')" aria-label="Retirer l\'item">\u2715</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.cmReturnItem = function(grpId, itemId) {
    var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
    var stock = V6Engine.getCaisseStock();
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(x){ return x.id === grpId; }) : null;
    if(!stock[grpId]){ if(grp) stock[grpId] = [].concat(grp.items); }
    if(!stock[grpId].includes(itemId)) stock[grpId].push(itemId);
    V6Engine.saveCaisseStock(stock);
    var item = ITEMS.find(function(i){ return i.id === itemId; }) || {id:itemId, name:itemId};
    V6Engine.saveStockHistory(grpId, {ts:new Date().toISOString(), action:'RETOUR', sauveteur:user?user.name:'?', volo:user?user.volo:'?', items:[{id:itemId, name:item.name}], restant:stock[grpId].length});
    V6Engine.sendStockWebhook({type:'STOCK_RETURN', caisse_id:grpId, caisse_name:grp?grp.name:grpId, item_id:itemId, item_name:item.name, sauveteur_volo:user?user.volo:'?', timestamp:new Date().toISOString(), stock_restant:stock[grpId].length});
    V6UI.showToast('\u21A9 ' + item.name + ' retourn\u00E9', 'ok');
    cmUpdateSummary(); cmRenderEditItems(grpId);
  };

  window.cmRemoveItem = function(grpId, itemId) {
    window._cmRemovePending = {grpId: grpId, itemId: itemId};
    V6Engine.setState({showModal: 'confirmCmRemove'});
  };

  window._doCmRemoveItem = function() {
    var pending = window._cmRemovePending || {}; if(!pending.grpId) return;
    var grpId = pending.grpId, itemId = pending.itemId;
    var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null; if(!grp) return;
    var item = ITEMS.find(function(i){ return i.id === itemId; }) || {id:itemId, name:itemId};
    var idx = grp.items.indexOf(itemId); if(idx > -1) grp.items.splice(idx, 1); grp.count = grp.items.length;
    var stock = V6Engine.getCaisseStock(); if(stock[grpId]){ var si = stock[grpId].indexOf(itemId); if(si > -1) stock[grpId].splice(si, 1); }
    V6Engine.saveCaisseStock(stock);
    V6Engine.saveStockHistory(grpId, {ts:new Date().toISOString(), action:'SUPPRIM\u00C9', sauveteur:user?user.name:'?', volo:user?user.volo:'?', items:[{id:itemId, name:item.name}], restant:grp.items.length});
    V6Engine.sendStockWebhook({type:'STOCK_REMOVE_ITEM', caisse_id:grpId, caisse_name:grp.name, item_id:itemId, item_name:item.name, sauveteur_volo:user?user.volo:'?', timestamp:new Date().toISOString(), stock_total:grp.items.length});
    V6UI.showToast('\u2715 Retir\u00E9', 'ok'); cmUpdateSummary(); cmRenderEditItems(grpId);
    window._cmRemovePending = null;
  };

  window.cmAddItem = function(grpId) {
    var inp = document.getElementById('cm-add-id');
    var itemId = (inp ? inp.value.trim().toUpperCase() : ''); if(!itemId){ V6UI.showToast('Saisir un ID', 'err'); return; }
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null; if(!grp) return;
    var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
    var item = ITEMS.find(function(i){ return i.id === itemId; });
    if(!item){ V6UI.showToast(itemId + ' non trouv\u00E9 dans le catalogue', 'err'); return; }
    if(grp.items.includes(itemId)){ V6UI.showToast('D\u00E9j\u00E0 dans cette caisse', 'info'); return; }
    grp.items.push(itemId); grp.count = grp.items.length;
    var stock = V6Engine.getCaisseStock(); if(!stock[grpId]) stock[grpId] = [].concat(grp.items.slice(0, -1));
    stock[grpId].push(itemId); V6Engine.saveCaisseStock(stock);
    V6Engine.saveStockHistory(grpId, {ts:new Date().toISOString(), action:'AJOUT', sauveteur:user?user.name:'?', volo:user?user.volo:'?', items:[{id:itemId, name:item.name}], restant:stock[grpId].length});
    V6Engine.sendStockWebhook({type:'STOCK_ADD_ITEM', caisse_id:grpId, caisse_name:grp.name, item_id:itemId, item_name:item.name, sauveteur_volo:user?user.volo:'?', timestamp:new Date().toISOString(), stock_total:grp.items.length});
    if(inp) inp.value = '';
    V6UI.showToast('\u2705 ' + item.name + ' ajout\u00E9', 'ok'); cmUpdateSummary(); cmRenderEditItems(grpId);
  };

  window.cmCreateItem = function(grpId) {
    var nameEl = document.getElementById('cm-new-name');
    var iconEl = document.getElementById('cm-new-icon');
    var name = nameEl ? nameEl.value.trim() : ''; if(!name){ V6UI.showToast('Nom requis', 'err'); return; }
    var icon = iconEl ? iconEl.value.trim() : '\uD83D\uDCE6';
    var newId = 'CUSTOM-' + Date.now();
    var grp = typeof GROUPS !== 'undefined' ? GROUPS.find(function(g){ return g.id === grpId; }) : null; if(!grp) return;
    var user = PERSONNEL.find(function(p){ return p.volo === 'V' + state.pin; });
    ITEMS.push({id:newId, name:name, cat:grp.name||'Custom', icon:icon||'\uD83D\uDCE6', etat:'Bon'});
    grp.items.push(newId); grp.count = grp.items.length;
    var stock = V6Engine.getCaisseStock(); if(!stock[grpId]) stock[grpId] = [].concat(grp.items.slice(0, -1));
    stock[grpId].push(newId); V6Engine.saveCaisseStock(stock);
    V6Engine.saveStockHistory(grpId, {ts:new Date().toISOString(), action:'CR\u00C9\u00C9', sauveteur:user?user.name:'?', volo:user?user.volo:'?', items:[{id:newId, name:name}], restant:stock[grpId].length});
    V6Engine.sendStockWebhook({type:'STOCK_CREATE_ITEM', caisse_id:grpId, caisse_name:grp.name, item_id:newId, item_name:name, sauveteur_volo:user?user.volo:'?', timestamp:new Date().toISOString(), stock_total:grp.items.length});
    if(nameEl) nameEl.value = ''; if(iconEl) iconEl.value = '';
    V6UI.showToast('\u2705 ' + name + ' cr\u00E9\u00E9', 'ok'); cmUpdateSummary(); cmRenderEditItems(grpId);
  };

  // ── History / data helpers ──
  window.getHistory = function() { return V6Data.getHistory(); };
  window.getActiveItems = function() { return V6Data.getActiveItems(); };
  window.getMyActivePickOns = function() { return V6Data.getMyActivePickOns(); };

  // ── Confirmations ──
  window.confirmClear = window.confirmClear || function(k, m, cb) {
    window._confirmClearPending = {key: k, msg: m};
    window._confirmClearCb = cb;
    V6Engine.setState({showModal: 'confirmClear'});
  };

})(window);
