/**
 * @module v6-auth.js
 * @description Authentication, PIN gate, session management, auto-login, lock screen, onboarding tour
 * @version 6.0.0
 * @depends v6-data-bridge.js (safeGetLS, safeSetLS, appendAuditLog)
 * @depends data.js (PERSONNEL)
 */
(function(window) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var TEAM_PIN = '5555';
  var TEAM_PIN_MAX_ATTEMPTS = 3;
  var TEAM_PIN_EXPIRY_DAYS = 30;
  var LOCK_DELAY = 300000; // 5 min

  // ── Private variables ──────────────────────────────────────
  var _lockTimeout = null;
  var _tourStep = 0;

  var TOUR_STEPS = [
    {title:'Bienvenue',icon:'\uD83E\uDD85',body:''},
    {title:'Ton agenda',icon:'\uD83D\uDCC5',body:'S\u00E9lectionne tes disponibilit\u00E9s en 2 clics sur le calendrier. Jour, nuit ou les deux \u2014 c\'est toi qui d\u00E9cides. Remplis les 7 prochains jours pour commencer.'},
    {title:'Le chat',icon:'\uD83D\uDCAC',body:'Le canal g\u00E9n\u00E9ral te connecte \u00E0 toute l\'\u00E9quipe. Les sauveteurs ont aussi leur canal priv\u00E9. Utilise @ pour mentionner quelqu\'un.'},
    {title:'C\'est parti !',icon:'\uD83D\uDE80',body:'Tu es pr\u00EAt. Tu peux revoir ce tour dans les param\u00E8tres \u00E0 tout moment. Bonne mission !'}
  ];

  // ── Private functions ──────────────────────────────────────

  /**
   * @private
   * Render dots and keypad for team PIN gate
   */
  function _tpRender() {
    // This is called inside showTeamPinGate closure — see showTeamPinGate
    // Actual implementation is inlined inside showTeamPinGate as a closure
  }

  /**
   * @private
   * Render current tour step overlay
   */
  function _renderTourStep() {
    var s = TOUR_STEPS[_tourStep];
    var isLast = _tourStep === TOUR_STEPS.length - 1;
    var overlay = document.getElementById('tourOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tourOverlay';
      overlay.className = 'tour-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<div class="tour-card">' +
      '<div class="tour-step">\u00C9TAPE ' + (_tourStep + 1) + '/' + TOUR_STEPS.length + '</div>' +
      '<div style="font-size:2.5rem;margin-bottom:8px">' + s.icon + '</div>' +
      '<div class="tour-title">' + s.title + '</div>' +
      '<div class="tour-body">' + s.body + '</div>' +
      '<div class="tour-dots">' + TOUR_STEPS.map(function(_, i) { return '<div class="tour-dot' + (i === _tourStep ? ' active' : '') + '"></div>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
        '<button class="tour-btn tour-btn-skip" onclick="V6Auth.closeTour()">PASSER</button>' +
        '<button class="tour-btn tour-btn-primary" onclick="' + (isLast ? 'V6Auth.completeTour()' : 'V6Auth.nextTourStep()') + '">' + (isLast ? 'COMMENCER' : 'SUIVANT \u2192') + '</button>' +
      '</div>' +
    '</div>';
  }

  // ── Public API ─────────────────────────────────────────────
  window.V6Auth = {

    /** Constants exposed for other modules */
    TEAM_PIN: TEAM_PIN,
    LOCK_DELAY: LOCK_DELAY,

    /**
     * Check if team PIN is still valid (30-day window)
     * @returns {boolean}
     */
    isTeamPinValid: function() {
      try {
        var d = localStorage.getItem('volo_team_pin_ts');
        if (!d) return false;
        var age = Date.now() - parseInt(d, 10);
        return age < TEAM_PIN_EXPIRY_DAYS * 86400000;
      } catch(e) { return false; }
    },

    /**
     * Display the team PIN keypad gate
     */
    showTeamPinGate: function() {
      var g = document.getElementById('teamPinGate');
      if (!g) return;
      g.style.display = 'flex';
      var attempts = 0;
      var code = '';
      window.tpInput = function(n) { if (code.length < 4) { code += n; renderPad(); } };
      window.tpClear = function() { code = code.slice(0, -1); renderPad(); };
      window.tpSubmit = function() {
        if (code.length !== 4) return;
        if (code === TEAM_PIN) {
          try { localStorage.setItem('volo_team_pin_ts', String(Date.now())); } catch(e) {}
          g.style.display = 'none';
          // After successful PIN, init engine
          if (window.V6Engine && V6Engine.init) V6Engine.init();
          return;
        }
        attempts++;
        code = '';
        if (attempts >= TEAM_PIN_MAX_ATTEMPTS) {
          V6Auth.logUnauthorizedAccess('PIN_MAX_ATTEMPTS');
          g.innerHTML = '<div class="team-pin-card"><div style="font-size:2rem;margin-bottom:12px">\uD83D\uDD12</div><div style="color:var(--red);font-weight:700">Acc\u00E8s bloqu\u00E9</div><div style="font-size:.7rem;color:var(--muted);margin-top:8px">Trop de tentatives. Rechargez la page.</div></div>';
          return;
        }
        renderPad();
        var e = document.getElementById('tpErr');
        if (e) { e.textContent = 'Code incorrect'; e.style.display = 'block'; }
      };
      function renderPad() {
        var dots = '';
        for (var i = 0; i < 4; i++) dots += '<div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--gold);display:inline-block;margin:0 6px;' + (i < code.length ? 'background:var(--gold)' : '') + '"></div>';
        g.innerHTML = '<div class="team-pin-card">' +
          '<div style="font-size:2.2rem;margin-bottom:6px">\uD83E\uDD85</div>' +
          '<div style="font-family:Oswald,sans-serif;font-size:1.1rem;color:var(--gold);letter-spacing:2px;margin-bottom:18px">GOLDEN EAGLES</div>' +
          '<div style="font-size:.72rem;color:var(--muted);margin-bottom:14px">Entrez le code d\u0027\u00E9quipe</div>' +
          '<div style="display:flex;justify-content:center;margin-bottom:16px">' + dots + '</div>' +
          '<div id="tpErr" style="color:var(--red);font-size:.72rem;margin-bottom:10px;min-height:18px;display:none"></div>' +
          '<div class="team-pin-pad">' +
          '<button onclick="tpInput(\'1\')">1</button><button onclick="tpInput(\'2\')">2</button><button onclick="tpInput(\'3\')">3</button>' +
          '<button onclick="tpInput(\'4\')">4</button><button onclick="tpInput(\'5\')">5</button><button onclick="tpInput(\'6\')">6</button>' +
          '<button onclick="tpInput(\'7\')">7</button><button onclick="tpInput(\'8\')">8</button><button onclick="tpInput(\'9\')">9</button>' +
          '<button onclick="tpClear()" style="font-size:.7rem">\u232B</button><button onclick="tpInput(\'0\')">0</button>' +
          '<button onclick="tpSubmit()" style="font-size:.7rem;background:var(--gold);color:var(--bg)">OK</button>' +
          '</div>' +
          '<div style="font-size:.55rem;color:var(--muted);margin-top:12px">' + (TEAM_PIN_MAX_ATTEMPTS - attempts) + ' tentative(s)</div>' +
        '</div>';
      }
      renderPad();
    },

    /**
     * Log unauthorized access attempt to localStorage + Firebase
     * @param {string} reason - Reason for unauthorized access
     */
    logUnauthorizedAccess: function(reason) {
      var entry = { ts: new Date().toISOString(), reason: reason, ua: navigator.userAgent };
      try {
        var log = JSON.parse(localStorage.getItem('volo_unauth_log') || '[]');
        log.push(entry);
        if (log.length > 100) log.splice(0, log.length - 100);
        localStorage.setItem('volo_unauth_log', JSON.stringify(log));
      } catch(e) {}
      // Firebase log si disponible
      try {
        if (typeof firebase !== 'undefined' && firebase.database) {
          firebase.database().ref('security/unauthorized').push(entry);
        }
      } catch(e) {}
    },

    /**
     * Check if current user is SURVEILLANT
     * @returns {boolean}
     */
    isUserSurv: function() {
      var r = localStorage.getItem('volo_last_role');
      return r === 'SURVEILLANT';
    },

    /**
     * Check if current user is CHEF D'EQUIPE
     * @returns {boolean}
     */
    isUserChef: function() {
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      return user && (user.role || '').toUpperCase().indexOf('CHEF') !== -1;
    },

    /**
     * Reset the inactivity lock timer (5 min)
     */
    resetLockTimer: function() {
      if (_lockTimeout) clearTimeout(_lockTimeout);
      var state = V6Engine.getState();
      if (state.step > 0) {
        _lockTimeout = setTimeout(function() {
          var st = V6Engine.getState();
          if (st.loggedIn) {
            V6Engine.setState({ step: 0 });
            V6Auth.lockScreen();
          }
        }, LOCK_DELAY);
      }
    },

    /**
     * Show the lock screen overlay
     */
    lockScreen: function() {
      V6Scanner.stopQrScanner();
      var el = document.getElementById('lock-screen');
      if (el) el.style.display = 'flex';
      try { navigator.vibrate && navigator.vibrate([100, 50, 100]); } catch(e) {}
    },

    /**
     * Hide the lock screen overlay and reset timer
     */
    unlockScreen: function() {
      var el = document.getElementById('lock-screen');
      if (el) el.style.display = 'none';
      var state = V6Engine.getState();
      if (!state.loggedIn) { V6Engine.render(); }
      V6Auth.resetLockTimer();
    },

    /**
     * Check rate limiting for PIN brute-force prevention
     * @returns {boolean} true if allowed, false if locked
     */
    checkRateLimit: function() {
      try {
        var fails = parseInt(localStorage.getItem('volo_failed_attempts') || '0');
        var lockUntil = parseInt(localStorage.getItem('volo_lock_until') || '0');
        if (Date.now() < lockUntil) {
          var secs = Math.ceil((lockUntil - Date.now()) / 1000);
          V6UI.showToast('Bloqu\u00E9 \u2014 r\u00E9essayer dans ' + secs + 's', 'err');
          return false;
        }
        if (fails >= 3) {
          localStorage.setItem('volo_lock_until', String(Date.now() + 60000));
          localStorage.setItem('volo_failed_attempts', '0');
          V6UI.showToast('Trop de tentatives \u2014 bloqu\u00E9 60s', 'err');
          return false;
        }
      } catch(e) {}
      return true;
    },

    /**
     * Complete PIN login, set session in localStorage
     * @param {Object} profile - Personnel profile object
     */
    completePinLogin: function(profile) {
      var state = V6Engine.getState();
      try {
        localStorage.setItem('volo_failed_attempts', '0');
        localStorage.setItem('volo_last_role', profile.type || profile.role || 'SAUVETEUR');
        localStorage.setItem('volo_last_user', profile.name || '');
        localStorage.setItem('volo_last_id', profile.id || '');
        localStorage.setItem('volo_pin', state.pin);
        localStorage.setItem('volo_session_ts', Date.now().toString());
      } catch(e) {}
      // Si login initial (pas encore loggé) → accueil conditionnel
      if (!state.loggedIn) {
        V6Engine.setState({ step: 0, loggedIn: true });
        try { V6Engine.chatStartBackgroundListener(); } catch(e) {}
        try { V6Urgences.loadAnnouncement(); } catch(e) {}
        return;
      }
      // Sinon, routing action spécifique
      var nextStep = state.gainsMode ? 15 : state.photoMode ? 11 : state.kmMode ? 12 : 2;
      V6Engine.setState({ step: nextStep });
    },

    /**
     * Handle failed PIN login attempt
     */
    failPinLogin: function() {
      try {
        var fails = parseInt(localStorage.getItem('volo_failed_attempts') || '0');
        localStorage.setItem('volo_failed_attempts', String(fails + 1));
      } catch(e) {}
      V6UI.showToast('PIN invalide', 'err');
      V6Engine.setState({ pin: '' });
    },

    /**
     * Handler for PIN submission from keypad
     */
    onPinContinue: function() {
      var state = V6Engine.getState();
      if (!V6Auth.checkRateLimit()) { V6Engine.setState({ pin: '' }); return; }
      if (state.pin.length !== 4) return;

      // ── Route 1 : VoloAuth.loginPin() → Firestore users/{voloId}
      if (typeof VoloAuth !== 'undefined' && typeof VoloAuth.loginPin === 'function') {
        VoloAuth.loginPin(state.pin).then(function(profile) {
          if (profile) {
            var voloId = 'V' + state.pin;
            if (typeof PERSONNEL !== 'undefined' && !PERSONNEL.find(function(p) { return p.volo === voloId; })) {
              PERSONNEL.push({ id: profile.id || '', volo: voloId, name: profile.name || '', role: profile.role || 'SAUVETEUR', type: profile.type || profile.role || 'SAUVETEUR', region: profile.region || '', ville: profile.ville || '', email: '' });
            } else if (typeof PERSONNEL !== 'undefined') {
              var local = PERSONNEL.find(function(p) { return p.volo === voloId; });
              if (local && profile.name) { local.name = profile.name; local.role = profile.role || local.role; local.type = profile.type || profile.role || local.type; local.region = profile.region || local.region; local.ville = profile.ville || local.ville; }
            }
            V6Auth.completePinLogin(profile);
          } else {
            var u = typeof PERSONNEL !== 'undefined' ? PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; }) : null;
            if (u) { V6Auth.completePinLogin(u); } else { V6Auth.failPinLogin(); }
          }
        }).catch(function() {
          var u = typeof PERSONNEL !== 'undefined' ? PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; }) : null;
          if (u) { V6Auth.completePinLogin(u); } else { V6Auth.failPinLogin(); }
        });
        return;
      }

      // ── Route 2 : PERSONNEL local + fallback Firestore /users
      var u = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (u) { V6Auth.completePinLogin(u); return; }
      // Pas trouvé localement → essayer Firestore /users
      if (typeof VoloData !== 'undefined' && typeof VoloData.findByVolo === 'function') {
        VoloData.findByVolo(state.pin).then(function(profile) {
          if (profile) {
            var voloId = 'V' + state.pin;
            if (typeof PERSONNEL !== 'undefined' && !PERSONNEL.find(function(p) { return p.volo === voloId; })) {
              PERSONNEL.push(profile);
            }
            V6Auth.completePinLogin(profile);
          } else { V6Auth.failPinLogin(); }
        }).catch(function() { V6Auth.failPinLogin(); });
        return;
      }
      V6Auth.failPinLogin();
    },

    /**
     * Reset wizard state while keeping PIN session
     */
    resetAll: function() {
      V6Scanner.stopQrScanner();
      window._pickoffExpected = null;
      window._pickoffOriginalTx = null;
      var state = V6Engine.getState();
      var keepPin = state.pin;
      V6Engine.setState({
        step: 0, pin: keepPin, depot: null, remorques: [], dest: null,
        numProjet: '', personneRessource: '', personneRessourceTel: '', personneRessourceEmail: '',
        detailsJob: '', sauvs: [], scanned: [], sceaux: {}, mode: 'pickon', showModal: null,
        camMode: true, searchQ: '', filterType: 'all', itemQ: '', catFilter: 'all',
        photoMode: false, setupPhotos: [], photoLieu: '', photoContrat: '',
        kmMode: false, kmFromGains: false, kmAllerRetour: true,
        kmDebut: '', kmDest: '', kmProjet: '', kmPerso: '',
        kmTab: 'vehicule', kmVehicle: '', kmTrailer: null, kmOdoStart: '', kmOdoEnd: '',
        gainsMode: false, loggedIn: true
      });
    },

    /**
     * Full logout - clear session and stop listeners
     */
    doLogout: function() {
      V6Scanner.stopQrScanner();
      try { V6Engine.chatStopListening(); } catch(e) {}
      try { V6Urgences.stopAnnouncementListeners(); } catch(e) {}
      window._pickoffExpected = null;
      window._pickoffOriginalTx = null;
      // Efface les clés de session du localStorage
      try {
        localStorage.removeItem('volo_last_role');
        localStorage.removeItem('volo_last_user');
        localStorage.removeItem('volo_pin');
      } catch(e) {}
      // Reset COMPLET du state
      V6Engine.setState({
        step: 1, pin: '', loggedIn: false, depot: null, remorques: [], dest: null,
        numProjet: '', personneRessource: '', personneRessourceTel: '', personneRessourceEmail: '',
        detailsJob: '', sauvs: [], scanned: [], sceaux: {}, mode: 'pickon', showModal: null,
        camMode: true, searchQ: '', filterType: 'all', itemQ: '', catFilter: 'all',
        photoMode: false, setupPhotos: [], photoLieu: '', photoContrat: '',
        kmMode: false, kmFromGains: false, kmAllerRetour: true,
        kmDebut: '', kmDest: '', kmProjet: '', kmPerso: '',
        kmTab: 'vehicule', kmVehicle: '', kmTrailer: null, kmOdoStart: '', kmOdoEnd: '',
        gainsMode: false, addType: null
      });
    },

    /**
     * Check if onboarding tour should be shown
     * @returns {boolean}
     */
    shouldShowTour: function() {
      var state = V6Engine.getState();
      if (!state.loggedIn) return false;
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (!user) return false;
      var key = 'volo_onboarding_' + user.id;
      return !localStorage.getItem(key);
    },

    /**
     * Start the onboarding tour
     */
    showTour: function() {
      _tourStep = 0;
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (!user) return;
      TOUR_STEPS[0].body = 'Ton r\u00F4le : <strong>' + (user.role || user.type) + '</strong><br>Ta r\u00E9gion : <strong>' + (user.region || '\u2014') + '</strong><br>Ton num\u00E9ro : <strong>' + user.volo + '</strong>';
      _renderTourStep();
    },

    /**
     * Advance to next tour step
     */
    nextTourStep: function() {
      _tourStep++;
      if (_tourStep >= TOUR_STEPS.length) { V6Auth.completeTour(); return; }
      _renderTourStep();
    },

    /**
     * Mark tour as completed in localStorage + Firebase
     */
    completeTour: function() {
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (user) {
        localStorage.setItem('volo_onboarding_' + user.id, 'true');
        try {
          if (typeof firebase !== 'undefined' && firebase.database) {
            firebase.database().ref('users/' + user.id + '/onboardingDone').set(true).catch(function() {});
          }
        } catch(e) {}
      }
      V6Auth.closeTour();
    },

    /**
     * Close tour without completing
     */
    closeTour: function() {
      var overlay = document.getElementById('tourOverlay');
      if (overlay) overlay.remove();
      var state = V6Engine.getState();
      var user = PERSONNEL.find(function(p) { return p.volo === 'V' + state.pin; });
      if (user) localStorage.setItem('volo_onboarding_' + user.id, 'true');
    }
  };

})(window);
