// ══════════════════════════════════════════
//  VOLO SST — Firebase Service Layer
//  Abstraction Firestore avec fallback data.js
//  Requiert : firebase-config.js chargé avant
// ══════════════════════════════════════════

var VoloData = (function() {
  'use strict';

  // --- Helpers ---
  var ORG = window.VOLO_ORG || 'ORG_VOLO_PROD';
  var CACHE_PREFIX = 'volo_fb_';
  var QUEUE_KEY = 'volo_fb_queue';

  function _fs() { return window.firebaseFS; }
  function _enabled() { return !!(window.VOLO_FIREBASE && window.VOLO_FIREBASE.enabled && _fs()); }
  function _primary() { return window.VOLO_FIREBASE && window.VOLO_FIREBASE.firestorePrimary; }

  // --- Circuit Breaker (quota Spark gratuit — 20k writes/jour, usage reel ~200/jour) ---
  var WRITE_LIMIT = 20000;
  var WRITE_WARN_PCT = 0.80;  // 80% = bandeau rouge
  var WRITE_COUNT_KEY = 'volo_write_count';
  var WRITE_DATE_KEY = 'volo_write_date';
  var _circuitOpen = false;
  var _bannerShown = false;

  function _todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function _getWriteCount() {
    try {
      var storedDate = localStorage.getItem(WRITE_DATE_KEY);
      if (storedDate !== _todayStr()) {
        // Nouveau jour — reset
        localStorage.setItem(WRITE_DATE_KEY, _todayStr());
        localStorage.setItem(WRITE_COUNT_KEY, '0');
        _circuitOpen = false;
        _bannerShown = false;
        return 0;
      }
      return parseInt(localStorage.getItem(WRITE_COUNT_KEY) || '0', 10);
    } catch(e) { return 0; }
  }

  function _incrementWrite() {
    try {
      var count = _getWriteCount() + 1;
      localStorage.setItem(WRITE_COUNT_KEY, String(count));
      localStorage.setItem(WRITE_DATE_KEY, _todayStr());
      var pct = count / WRITE_LIMIT;
      if (pct >= 1) {
        _circuitOpen = true;
        _showQuotaBanner('CIRCUIT OUVERT — Quota Firestore atteint (' + count + '/' + WRITE_LIMIT + '). Mode webhook-only.', true);
      } else if (pct >= WRITE_WARN_PCT && !_bannerShown) {
        _showQuotaBanner('⚠ Quota Firestore à ' + Math.round(pct * 100) + '% (' + count + '/' + WRITE_LIMIT + ' writes)', false);
        _bannerShown = true;
      }
      return count;
    } catch(e) { return 0; }
  }

  function _isCircuitOpen() {
    if (_circuitOpen) return true;
    var count = _getWriteCount();
    if (count >= WRITE_LIMIT) {
      _circuitOpen = true;
      return true;
    }
    return false;
  }

  function _showQuotaBanner(msg, critical) {
    // Retire l'ancien bandeau s'il existe
    var old = document.getElementById('voloQuotaBanner');
    if (old) old.remove();
    var banner = document.createElement('div');
    banner.id = 'voloQuotaBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;text-align:center;color:#fff;background:' + (critical ? '#B71C1C' : '#E65100') + ';box-shadow:0 2px 8px rgba(0,0,0,.5);';
    banner.textContent = msg;
    if (!critical) {
      var btn = document.createElement('span');
      btn.textContent = ' ✕';
      btn.style.cssText = 'cursor:pointer;margin-left:12px;opacity:.8;';
      btn.onclick = function() { banner.remove(); };
      banner.appendChild(btn);
    }
    document.body.appendChild(banner);
  }

  function _canWrite() {
    if (_isCircuitOpen()) {
      console.warn('[VoloData] Circuit OPEN — write skipped, queuing for webhook');
      return false;
    }
    return true;
  }

  function _cacheSet(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data: data })); }
    catch(e) { /* quota exceeded — ignore */ }
  }

  function _cacheGet(key, maxAgeMs) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (maxAgeMs && (Date.now() - parsed.ts) > maxAgeMs) return null;
      return parsed.data;
    } catch(e) { return null; }
  }

  function _tsNow() { return new Date().toISOString(); }

  // --- Offline Queue ---
  function _queuePush(operation) {
    try {
      var queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ op: operation, ts: _tsNow() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch(e) { /* ignore */ }
  }

  function _queueFlush() {
    if (!_enabled()) return;
    _ensureAuth().then(function() {
      try {
        var queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        if (!queue.length) return;
        console.log('[VoloData] Flushing', queue.length, 'queued operations');
        var remaining = [];
        queue.forEach(function(entry) {
          try {
            var op = entry.op;
            if (op.collection && op.data) {
              if (op.docId) {
                _fs().collection(op.collection).doc(op.docId).set(op.data, { merge: true });
              } else {
                _fs().collection(op.collection).add(op.data);
              }
            }
          } catch(e) {
            remaining.push(entry);
          }
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      } catch(e) { /* ignore */ }
    });
  }

  // Flush queue quand on revient en ligne
  window.addEventListener('online', function() {
    setTimeout(_queueFlush, 2000);
  });

  // ══════════════════════════════════════════
  //  PERSONNEL
  // ══════════════════════════════════════════

  function getPersonnel() {
    // Retourne PERSONNEL global (peut être stub ou déjà enrichi par Firestore)
    if (typeof PERSONNEL !== 'undefined') return Promise.resolve(PERSONNEL);
    return Promise.resolve([]);
  }

  function _ensureAuth() {
    // Sign-in anonyme si pas encore authentifié (nécessaire pour Security Rules isAuth())
    if (!window.firebaseAuth) return Promise.resolve(false);
    if (window.firebaseAuth.currentUser) return Promise.resolve(true);
    return window.firebaseAuth.signInAnonymously()
      .then(function(cred) {
        console.log('[VoloData] Auth anonyme OK — uid:', cred.user.uid);
        return true;
      })
      .catch(function(e) {
        console.warn('[VoloData] Auth anonyme échoué:', e.code, e.message);
        return false;
      });
  }

  function getPersonnelFromFirestore() {
    if (!_enabled()) {
      console.log('[VoloData] getPersonnelFromFirestore — Firebase désactivé (_enabled=false)');
      return Promise.resolve(null);
    }
    return _ensureAuth().then(function(authed) {
      console.log('[VoloData] getPersonnelFromFirestore — auth:', authed, '| currentUser:', !!(window.firebaseAuth && window.firebaseAuth.currentUser));
      return _fs().collection('users').get()
        .then(function(snap) {
          console.log('[VoloData] getPersonnelFromFirestore — Firestore répondu: empty=' + snap.empty + ', size=' + snap.size);
          if (snap.empty) return null;
          var result = [];
          var firstLogged = false;
          snap.forEach(function(doc) {
            var d = doc.data();
            if (!firstLogged) {
              console.log('[VoloData] SAMPLE DOC id=' + doc.id + ' raw keys:', Object.keys(d).join(', '));
              console.log('[VoloData] SAMPLE DOC values:', JSON.stringify({ name: d.name, nom: d.nom, displayName: d.displayName, volo: d.volo, voloId: d.voloId, role: d.role, type: d.type, region: d.region, ville: d.ville, active: d.active }));
              firstLogged = true;
            }
            // Mapping exhaustif : name > nom > displayName
            var resolvedName = d.name || d.nom || d.displayName || '';
            result.push({
              id: d.id || doc.id,
              volo: d.volo || d.voloId || doc.id,
              name: resolvedName,
              role: (d.role || 'SAUVETEUR').toUpperCase(),
              type: (d.type || d.role || 'SAUVETEUR').toUpperCase(),
              region: d.region || '',
              ville: d.ville || '',
              email: '' // PII protégé côté client
            });
          });
          console.log('[VoloData] getPersonnelFromFirestore — ' + result.length + ' membres chargés (sample name: "' + (result[0] && result[0].name) + '")');
          return result;
        })
        .catch(function(e) {
          console.warn('[VoloData] getPersonnelFromFirestore ERREUR:', e.code || '', e.message);
          return null;
        });
    });
  }

  // Charge PERSONNEL depuis Firestore /users si >= 20 membres, sinon garde le stub local
  // Seuil abaissé de 100 à 20 : le stub a 30 entrées, Firestore en a 161
  function initPersonnel() {
    var localCount = (typeof PERSONNEL !== 'undefined') ? PERSONNEL.length : 0;
    console.log('[VoloData] initPersonnel — _enabled=' + _enabled() + ', PERSONNEL local=' + localCount);
    if (!_enabled()) {
      console.log('[VoloData] → branche FALLBACK (Firebase désactivé)');
      return Promise.resolve(false);
    }
    return getPersonnelFromFirestore().then(function(list) {
      var fsCount = list ? list.length : 0;
      console.log('[VoloData] initPersonnel — Firestore retourné ' + fsCount + ' membres (seuil: 20, local: ' + localCount + ')');
      if (list && fsCount >= 20) {
        window.PERSONNEL = list;
        if (typeof window.SAUVETEURS !== 'undefined') {
          window.SAUVETEURS = list;
        }
        console.log('[VoloData] → branche FIRESTORE (' + fsCount + ' membres remplacent le local)');
        return true;
      }
      console.log('[VoloData] → branche FALLBACK (Firestore ' + fsCount + ' < 20, stub conservé)');
      return false;
    }).catch(function(e) {
      console.warn('[VoloData] initPersonnel ERREUR → branche FALLBACK:', e.code || '', e.message);
      return false;
    });
  }

  function findByVolo(pin) {
    // pin = "0205" → cherche V0205
    var voloId = 'V' + pin;
    if (typeof PERSONNEL !== 'undefined') {
      var local = PERSONNEL.find(function(p) { return p.volo === voloId; });
      if (local) return Promise.resolve(local);
    }
    // Essayer Firestore /users si disponible
    if (_enabled()) {
      return _ensureAuth().then(function() {
        return _fs().collection('users').doc(voloId).get()
          .then(function(doc) {
            if (doc.exists) {
              var d = doc.data();
              console.log('[VoloData] findByVolo doc=' + doc.id + ' raw keys:', Object.keys(d).join(', '));
              return {
                id: d.id || doc.id,
                volo: d.volo || d.voloId || doc.id,
                name: d.name || d.nom || d.displayName || '',
                role: (d.role || 'SAUVETEUR').toUpperCase(),
                type: (d.type || d.role || 'SAUVETEUR').toUpperCase(),
                region: d.region || '',
                ville: d.ville || '',
                email: ''
              };
            }
            return null;
          })
          .catch(function(e) {
            console.warn('[VoloData] findByVolo Firestore error:', e.code || '', e.message);
            return null;
          });
      });
    }
    return Promise.resolve(null);
  }

  // ══════════════════════════════════════════
  //  ITEMS / INVENTAIRE
  // ══════════════════════════════════════════

  var _itemsFromFirestore = null; // cache pour éviter re-fetch

  function getItemsFromFirestore() {
    if (!_enabled()) return Promise.resolve(null);
    if (_itemsFromFirestore) return Promise.resolve(_itemsFromFirestore);
    return _ensureAuth().then(function() {
      return _fs().collection('items').get()
        .then(function(snap) {
          if (snap.empty) return null;
          var result = [];
          snap.forEach(function(doc) {
            var d = doc.data();
            result.push({
              id: d.id || doc.id,
              name: d.name || '',
              cat: d.cat || '',
              icon: d.icon || '',
              etat: d.etat || null,
              desc: d.desc || '',
              fab: d.fab || '',
              serial: d.serial || '',
              volo_id: d.volo_id || '',
              expiry: d.expiry || null,
              inspBy: d.inspBy || '',
              inspDate: d.inspDate || '',
              notes: d.notes || '',
              couleur: d.couleur || undefined,
              qty: d.qty || undefined
            });
          });
          console.log('[VoloData] getItemsFromFirestore — ' + result.length + ' items chargés');
          _itemsFromFirestore = result;
          return result;
        })
        .catch(function(e) {
          console.warn('[VoloData] getItemsFromFirestore ERREUR:', e.code || '', e.message);
          return null;
        });
    });
  }

  function getCaissesFromFirestore() {
    if (!_enabled()) return Promise.resolve(null);
    return _ensureAuth().then(function() {
      return _fs().collection('caisses').get()
        .then(function(snap) {
          if (snap.empty) return null;
          var result = [];
          snap.forEach(function(doc) {
            var d = doc.data();
            result.push({
              id: d.id || doc.id,
              nom: d.nom || d.name || '',
              count: d.count || 0,
              icon: d.icon || '',
              type: d.type || 'autre',
              items_contenus: d.items_contenus || [],
              depot_assigne: d.depot_assigne || null,
              poids_total: d.poids_total || null,
              derniere_verification: d.derniere_verification || null,
              responsable: d.responsable || null,
              statut: d.statut || 'disponible',
              parent_groupe: d.parent_groupe || undefined
            });
          });
          console.log('[VoloData] getCaissesFromFirestore — ' + result.length + ' caisses chargées');
          return result;
        })
        .catch(function(e) {
          console.warn('[VoloData] getCaissesFromFirestore ERREUR:', e.code || '', e.message);
          return null;
        });
    });
  }

  function initItems() {
    var localCount = (typeof ITEMS !== 'undefined') ? ITEMS.length : 0;
    console.log('[VoloData] initItems — _enabled=' + _enabled() + ', ITEMS local=' + localCount);
    if (!_enabled()) return Promise.resolve(false);
    return getItemsFromFirestore().then(function(list) {
      var fsCount = list ? list.length : 0;
      console.log('[VoloData] initItems — Firestore retourné ' + fsCount + ' items (local: ' + localCount + ')');
      if (list && fsCount >= 100) {
        window.ITEMS = list;
        // Rebuild ITEMS_MAP
        if (typeof Map !== 'undefined') {
          window.ITEMS_MAP = new Map();
          list.forEach(function(it) { window.ITEMS_MAP.set(it.id, it); });
        }
        console.log('[VoloData] → branche FIRESTORE (' + fsCount + ' items remplacent le local)');
        return true;
      }
      console.log('[VoloData] → branche FALLBACK (Firestore ' + fsCount + ' < 100, data.js conservé)');
      return false;
    }).catch(function(e) {
      console.warn('[VoloData] initItems ERREUR → branche FALLBACK:', e.code || '', e.message);
      return false;
    });
  }

  function getItems() {
    if (typeof ITEMS !== 'undefined') return Promise.resolve(ITEMS);
    return Promise.resolve([]);
  }

  function getItemById(id) {
    if (typeof ITEMS_MAP !== 'undefined' && ITEMS_MAP.has) {
      return ITEMS_MAP.get(id) || null;
    }
    if (typeof ITEMS !== 'undefined') {
      return ITEMS.find(function(it) { return it.id === id; }) || null;
    }
    return null;
  }

  function getCaisses() {
    if (typeof CAISSES !== 'undefined') return Promise.resolve(CAISSES);
    return Promise.resolve([]);
  }

  // ══════════════════════════════════════════
  //  TRANSACTIONS (dual-write: Webhook + Firestore)
  // ══════════════════════════════════════════

  function saveTransaction(payload) {
    // 1. Enrichir le payload
    var enriched = Object.assign({}, payload, {
      org: ORG,
      savedAt: _tsNow(),
      source: 'web'
    });

    // 2. Écrire dans Firestore (avec circuit breaker + auth)
    if (_enabled() && _canWrite()) {
      var writePromise = _ensureAuth().then(function() {
        var docRef = _fs().collection('transactions').doc();
        enriched._firestoreId = docRef.id;
        _incrementWrite();
        return docRef.set(enriched).catch(function(e) {
          console.warn('[VoloData] Firestore write failed, queuing:', e.message);
          _queuePush({ collection: 'transactions', data: enriched });
          return enriched;
        });
      });
      // Primary mode: await Firestore write before returning
      if (_primary()) return writePromise.then(function() { return enriched; });
    } else {
      _queuePush({ collection: 'transactions', data: enriched });
    }

    // 3. Le webhook est envoyé par le code existant (pas dupliqué ici)
    return enriched;
  }

  function getTransactions(filters) {
    if (!_enabled()) {
      // Fallback localStorage
      var cached = _cacheGet('transactions', 3600000); // 1h
      return Promise.resolve(cached || []);
    }

    var query = _fs().collection('transactions').where('org', '==', ORG);
    if (filters) {
      if (filters.voloId) query = query.where('voloId', '==', filters.voloId);
      if (filters.type) query = query.where('type', '==', filters.type);
      if (filters.chantier) query = query.where('chantier', '==', filters.chantier);
    }
    query = query.orderBy('savedAt', 'desc').limit(filters && filters.limit || 50);

    return query.get().then(function(snap) {
      var results = snap.docs.map(function(d) {
        var data = d.data();
        data._id = d.id;
        return data;
      });
      _cacheSet('transactions', results);
      return results;
    }).catch(function(e) {
      console.warn('[VoloData] Firestore read failed:', e.message);
      return _cacheGet('transactions') || [];
    });
  }

  function cancelTransaction(transactionId) {
    if (!_enabled() || !_canWrite()) return Promise.resolve(false);
    return _ensureAuth().then(function() {
      _incrementWrite();
      return _fs().collection('transactions').doc(transactionId).update({
        status: 'ANNULÉ',
        cancelledAt: _tsNow()
      }).then(function() { return true; })
        .catch(function() { return false; });
    });
  }

  // ══════════════════════════════════════════
  //  CERTIFICATIONS
  // ══════════════════════════════════════════

  function getCerts(voloId) {
    // Fallback localStorage
    var lsKey = 'volo_certs_' + voloId;
    var local = null;
    try { local = JSON.parse(localStorage.getItem(lsKey)); } catch(e) {}

    if (!_enabled()) return Promise.resolve(local || {});

    return _fs().collection('certifications').doc(voloId).get()
      .then(function(doc) {
        if (doc.exists) {
          var data = doc.data();
          _cacheSet('certs_' + voloId, data);
          return data.certs || data;
        }
        return local || {};
      })
      .catch(function() { return local || {}; });
  }

  function setCert(voloId, certId, dateStr, userName) {
    // localStorage (existant)
    var lsKey = 'volo_certs_' + voloId;
    var certs = {};
    try { certs = JSON.parse(localStorage.getItem(lsKey)) || {}; } catch(e) {}
    certs[certId] = { date: dateStr, updatedAt: _tsNow() };
    try { localStorage.setItem(lsKey, JSON.stringify(certs)); } catch(e) {}

    // Firestore (avec circuit breaker + auth)
    if (_enabled() && _canWrite()) {
      var certWrite = _ensureAuth().then(function() {
        _incrementWrite();
        return _fs().collection('certifications').doc(voloId).set(
          { voloId: voloId, name: userName || '', certs: certs, org: ORG, updatedAt: _tsNow() },
          { merge: true }
        ).catch(function(e) {
          _queuePush({ collection: 'certifications', docId: voloId, data: { certs: certs, org: ORG, updatedAt: _tsNow() } });
        });
      });
      if (_primary()) return certWrite.then(function() { return certs; });
    }

    return certs;
  }

  // ══════════════════════════════════════════
  //  POINTAGE
  // ══════════════════════════════════════════

  function savePointage(payload) {
    var enriched = Object.assign({}, payload, {
      org: ORG,
      savedAt: _tsNow(),
      source: 'web'
    });

    if (_enabled() && _canWrite()) {
      var ptWrite = _ensureAuth().then(function() {
        _incrementWrite();
        return _fs().collection('pointages').add(enriched).catch(function(e) {
          _queuePush({ collection: 'pointages', data: enriched });
          return enriched;
        });
      });
      if (_primary()) return ptWrite.then(function() { return enriched; });
    } else {
      _queuePush({ collection: 'pointages', data: enriched });
    }

    return enriched;
  }

  function getPointages(voloId) {
    if (!_enabled()) return Promise.resolve([]);

    return _fs().collection('pointages')
      .where('voloId', '==', voloId)
      .where('org', '==', ORG)
      .orderBy('savedAt', 'desc')
      .limit(30)
      .get()
      .then(function(snap) {
        return snap.docs.map(function(d) { var data = d.data(); data._id = d.id; return data; });
      })
      .catch(function() { return []; });
  }

  // ══════════════════════════════════════════
  //  AUDIT LOG
  // ══════════════════════════════════════════

  function logAudit(action, details) {
    var entry = {
      action: action,
      details: details || '',
      userId: (typeof state !== 'undefined' && state.pin) ? 'V' + state.pin : 'unknown',
      userName: (typeof state !== 'undefined' && state.user) ? state.user : '',
      timestamp: _tsNow(),
      org: ORG,
      userAgent: navigator.userAgent.substring(0, 120),
      url: location.pathname
    };

    if (_enabled() && _canWrite()) {
      _ensureAuth().then(function() {
        _incrementWrite();
        _fs().collection('audit_logs').add(entry).catch(function() {
          // Fire and forget — pas de queue pour les logs
        });
      });
    }

    return entry;
  }

  // ══════════════════════════════════════════
  //  CONFIG APP
  // ══════════════════════════════════════════

  function getConfig() {
    if (!_enabled()) {
      return Promise.resolve(_cacheGet('config') || {
        version: 'V10.5',
        announcement: null,
        emergencyAlert: null,
        maintenanceMode: false
      });
    }

    return _fs().collection('config').doc('app').get()
      .then(function(doc) {
        if (doc.exists) {
          var data = doc.data();
          _cacheSet('config', data);
          return data;
        }
        return _cacheGet('config') || {};
      })
      .catch(function() { return _cacheGet('config') || {}; });
  }

  function getBaremes() {
    if (typeof BAREMES !== 'undefined') return BAREMES;
    var cached = _cacheGet('config');
    return (cached && cached.baremes) || {
      SAUVETEUR: { km: 0.68, perdiem: 200, urgence: 64, urgence_perdiem: 0 },
      SURVEILLANT: { km: 0.63, perdiem: 150, urgence: 0 }
    };
  }

  // ══════════════════════════════════════════
  //  PUSH NOTIFICATIONS (FCM)
  // ══════════════════════════════════════════

  function _getMessaging() { return window.firebaseMessaging; }

  function requestNotificationPermission(voloId, userName, role) {
    if (!_getMessaging() || !window.VOLO_VAPID_KEY) {
      console.warn('[VoloData] FCM non disponible');
      return Promise.resolve(null);
    }
    if (!('Notification' in window)) {
      console.warn('[VoloData] Notifications non supportées');
      return Promise.resolve(null);
    }
    return Notification.requestPermission().then(function(permission) {
      if (permission !== 'granted') {
        console.log('[VoloData] Notification permission refusée');
        return null;
      }
      // Enregistrer le SW FCM
      return navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(function(registration) {
          return _getMessaging().getToken({
            vapidKey: window.VOLO_VAPID_KEY,
            serviceWorkerRegistration: registration
          });
        })
        .then(function(token) {
          if (!token) return null;
          console.log('[VoloData] FCM token obtenu:', token.substring(0, 20) + '...');
          // Sauvegarder le token dans Firestore /fcm_tokens/{voloId}
          if (_enabled() && voloId) {
            _ensureAuth().then(function() {
              _incrementWrite();
              _fs().collection('fcm_tokens').doc(voloId).set({
                token: token,
                voloId: voloId,
                userName: userName || '',
                role: (role || '').toUpperCase(),
                updatedAt: _tsNow(),
                platform: navigator.userAgent.substring(0, 80),
                org: ORG
              }, { merge: true }).catch(function(e) {
                console.warn('[VoloData] FCM token save failed:', e.message);
              });
            });
          }
          return token;
        });
    }).catch(function(e) {
      console.warn('[VoloData] FCM permission error:', e.message);
      return null;
    });
  }

  function onForegroundMessage(callback) {
    if (!_getMessaging()) return function() {};
    return _getMessaging().onMessage(function(payload) {
      console.log('[VoloData] FCM foreground message:', payload);
      if (callback) callback(payload);
    });
  }

  function notifyUrgence(urgencePayload) {
    // Écrit dans Firestore /notifications pour déclencher la Cloud Function
    // qui enverra les push notifications à tous les tokens FCM des chefs
    if (!_enabled() || !_canWrite()) return;
    _ensureAuth().then(function() {
      _incrementWrite();
      _fs().collection('notifications').add({
        type: 'URGENCE',
        title: 'URGENCE TERRAIN',
        body: (urgencePayload.type || 'Alerte') + ' — ' + (urgencePayload.sauveteur || 'Inconnu'),
        data: urgencePayload,
        targetRole: 'chef',
        sent: false,
        createdAt: _tsNow(),
        org: ORG
      }).catch(function(e) {
        console.warn('[VoloData] Notification write failed:', e.message);
      });
    });
  }

  function notifyUrgencyAlert(alertPayload) {
    // Notification broadcast quand un chef déclenche l'alerte urgence générale
    if (!_enabled() || !_canWrite()) return;
    _ensureAuth().then(function() {
      _incrementWrite();
      _fs().collection('notifications').add({
        type: 'URGENCY_ALERT',
        title: 'ALERTE URGENCE GENERALE',
        body: 'Contactez votre chef immédiatement — ' + (alertPayload.author || ''),
        data: alertPayload,
        targetRole: 'all',
        sent: false,
        createdAt: _tsNow(),
        org: ORG
      }).catch(function(e) {
        console.warn('[VoloData] Urgency alert notification failed:', e.message);
      });
    });
  }

  // ══════════════════════════════════════════
  //  PHOTOS (Storage — Phase 3)
  // ══════════════════════════════════════════

  function uploadPhoto(file, path) {
    if (!window.firebaseStorage) {
      console.warn('[VoloData] Firebase Storage non activé');
      return Promise.resolve(null);
    }
    return _ensureAuth().then(function() {
      var ref = window.firebaseStorage.ref(path + '/' + Date.now() + '_' + file.name);
      return ref.put(file).then(function(snap) {
        return snap.ref.getDownloadURL();
      });
    });
  }

  function uploadPhotoBase64(base64Data, storagePath, metadata) {
    // Upload une image base64 compressée vers Firebase Storage
    if (!window.firebaseStorage) {
      console.warn('[VoloData] Firebase Storage non activé');
      return Promise.resolve(null);
    }
    return _ensureAuth().then(function() {
      var fileName = Date.now() + '_photo.jpg';
      var ref = window.firebaseStorage.ref(storagePath + '/' + fileName);
      // Convertir base64 en blob
      var byteString = atob(base64Data.split(',')[1] || base64Data);
      var mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0] || 'image/jpeg';
      var ab = new ArrayBuffer(byteString.length);
      var ia = new Uint8Array(ab);
      for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      var blob = new Blob([ab], { type: mimeString });
      var uploadMeta = { contentType: mimeString };
      if (metadata) {
        uploadMeta.customMetadata = metadata;
      }
      return ref.put(blob, uploadMeta).then(function(snap) {
        return snap.ref.getDownloadURL().then(function(url) {
          return { url: url, path: snap.ref.fullPath, size: snap.totalBytes };
        });
      });
    }).catch(function(e) {
      console.warn('[VoloData] Photo upload failed:', e.message);
      return null;
    });
  }

  function savePhotoMetadata(photoDoc) {
    // Sauvegarde les métadonnées de la photo dans Firestore /photos
    if (!_enabled() || !_canWrite()) return Promise.resolve(null);
    return _ensureAuth().then(function() {
      _incrementWrite();
      return _fs().collection('photos').add(Object.assign({}, photoDoc, {
        org: ORG,
        createdAt: _tsNow()
      })).then(function(ref) {
        return ref.id;
      });
    }).catch(function(e) {
      console.warn('[VoloData] Photo metadata save failed:', e.message);
      return null;
    });
  }

  // ══════════════════════════════════════════
  //  REAL-TIME LISTENERS
  // ══════════════════════════════════════════

  // Helper: subscribe after auth is ensured
  function _authThenListen(setupFn) {
    var unsub = function() {};
    _ensureAuth().then(function() {
      unsub = setupFn() || function() {};
    });
    return function() { unsub(); };
  }

  function onConfigChange(callback) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      return _fs().collection('config').doc('app').onSnapshot(function(doc) {
        if (doc.exists) callback(doc.data());
      }, function(e) { console.warn('[VoloData] Config listener error:', e); });
    });
  }

  function onTransactionsChange(callback, filters) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      var query = _fs().collection('transactions').where('org', '==', ORG);
      if (filters && filters.type) query = query.where('type', '==', filters.type);
      query = query.orderBy('savedAt', 'desc').limit(20);
      return query.onSnapshot(function(snap) {
        var results = snap.docs.map(function(d) { var data = d.data(); data._id = d.id; return data; });
        callback(results);
      }, function(e) { console.warn('[VoloData] Transactions listener error:', e); });
    });
  }

  function onUrgencesChange(callback) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      var since = new Date(Date.now() - 24 * 3600000).toISOString();
      return _fs().collection('urgences')
        .where('org', '==', ORG)
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot(function(snap) {
          var results = snap.docs.map(function(d) { var data = d.data(); data._id = d.id; return data; });
          callback(results);
        }, function(e) { console.warn('[VoloData] Urgences listener error:', e); });
    });
  }

  function onPointagesChange(callback) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      var today = new Date().toISOString().slice(0, 10);
      return _fs().collection('pointages')
        .where('org', '==', ORG)
        .where('savedAt', '>=', today)
        .orderBy('savedAt', 'desc')
        .limit(50)
        .onSnapshot(function(snap) {
          var results = snap.docs.map(function(d) { var data = d.data(); data._id = d.id; return data; });
          callback(results);
        }, function(e) { console.warn('[VoloData] Pointages listener error:', e); });
    });
  }

  function onPhotosChange(callback) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      var since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
      return _fs().collection('photos')
        .where('org', '==', ORG)
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .onSnapshot(function(snap) {
          var results = snap.docs.map(function(d) { var data = d.data(); data._id = d.id; return data; });
          callback(results);
        }, function(e) { console.warn('[VoloData] Photos listener error:', e); });
    });
  }

  // ══════════════════════════════════════════
  //  STOCK STATE — Multi-device sync
  //  Doc unique: stock_state/current
  //  Contient items_sorti[] = IDs actuellement sortis
  // ══════════════════════════════════════════

  var STOCK_DOC = 'current';
  var STOCK_COL = 'stock_state';
  var _stockListenerUnsub = null;

  /**
   * Sauvegarde l'etat stock dans Firestore apres PICK-ON ou PICK-OFF
   * @param {Object} stockMap - getCaisseStock() complet {grpId: [itemIds]}
   * @param {Object} statuts - getCaisseStatuts() {grpId: status}
   * @param {string} voloId - qui a fait la modif
   */
  function saveStockState(stockMap, statuts, voloId) {
    if (!_enabled() || !_canWrite()) return Promise.resolve(false);
    // Extraire la liste des items actuellement sortis
    // Un item est "sorti" s'il n'est plus dans sa caisse stock
    var itemsSorti = [];
    if (typeof CAISSES !== 'undefined') {
      CAISSES.forEach(function(c) {
        var original = c.items_contenus || [];
        var current = stockMap[c.id] || original;
        original.forEach(function(itemId) {
          if (current.indexOf(itemId) === -1) {
            itemsSorti.push(itemId);
          }
        });
      });
    }
    var stateDoc = {
      items_sorti: itemsSorti,
      statuts: statuts || {},
      updatedAt: _tsNow(),
      updatedBy: voloId || 'unknown',
      org: ORG
    };
    return _ensureAuth().then(function() {
      _incrementWrite();
      return _fs().collection(STOCK_COL).doc(STOCK_DOC).set(stateDoc, { merge: true })
        .then(function() {
          console.log('[VoloData] Stock state saved — ' + itemsSorti.length + ' items sorti');
          return true;
        })
        .catch(function(e) {
          console.warn('[VoloData] Stock state save failed:', e.message);
          _queuePush({ collection: STOCK_COL, docId: STOCK_DOC, data: stateDoc });
          return false;
        });
    });
  }

  /**
   * Charge l'etat stock depuis Firestore au startup
   * Applique items_sorti au localStorage volo_caisse_stock
   * @returns {Promise<Object|null>} items_sorti array ou null
   */
  function loadStockState() {
    if (!_enabled()) return Promise.resolve(null);
    return _ensureAuth().then(function() {
      return _fs().collection(STOCK_COL).doc(STOCK_DOC).get()
        .then(function(doc) {
          if (!doc.exists) {
            console.log('[VoloData] loadStockState — no state doc yet');
            return null;
          }
          var data = doc.data();
          console.log('[VoloData] loadStockState — ' + (data.items_sorti ? data.items_sorti.length : 0) + ' items sorti, updated by ' + data.updatedBy + ' at ' + data.updatedAt);
          return data;
        })
        .catch(function(e) {
          console.warn('[VoloData] loadStockState error:', e.message);
          return null;
        });
    });
  }

  /**
   * Applique un stock_state Firestore au localStorage
   * Reconstruit volo_caisse_stock a partir de items_sorti
   * @param {Object} stateData - doc Firestore {items_sorti:[], statuts:{}}
   */
  function applyStockState(stateData) {
    if (!stateData || !stateData.items_sorti) return;
    if (typeof CAISSES === 'undefined') return;
    var sorti = new Set(stateData.items_sorti);
    var stockMap = {};
    CAISSES.forEach(function(c) {
      var original = c.items_contenus || [];
      // Garder seulement les items qui ne sont PAS sortis
      stockMap[c.id] = original.filter(function(itemId) {
        return !sorti.has(itemId);
      });
    });
    try {
      localStorage.setItem('volo_caisse_stock', JSON.stringify(stockMap));
      if (stateData.statuts) {
        localStorage.setItem('volo_caisse_statuts', JSON.stringify(stateData.statuts));
      }
      console.log('[VoloData] applyStockState — ' + sorti.size + ' items sorti appliques au localStorage');
    } catch(e) {
      console.warn('[VoloData] applyStockState localStorage error:', e.message);
    }
  }

  /**
   * Listener temps reel sur stock_state/current
   * Quand un autre device fait un PICK-ON/PICK-OFF, on recoit le changement
   * @param {Function} callback - recoit stateData a chaque changement
   * @returns {Function} unsubscribe
   */
  function onStockChange(callback) {
    if (!_enabled()) return function() {};
    return _authThenListen(function() {
      return _fs().collection(STOCK_COL).doc(STOCK_DOC).onSnapshot(function(doc) {
        if (!doc.exists) return;
        var data = doc.data();
        console.log('[VoloData] onStockChange — update from ' + data.updatedBy + ' at ' + data.updatedAt);
        if (callback) callback(data);
      }, function(e) {
        console.warn('[VoloData] Stock listener error:', e);
      });
    });
  }

  // ══════════════════════════════════════════
  //  STATUS
  // ══════════════════════════════════════════

  function getStatus() {
    return {
      firebaseEnabled: !!(_enabled()),
      firestoreReady: !!_fs(),
      rtdbReady: !!window.firebaseDB,
      queueLength: (JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')).length,
      online: navigator.onLine
    };
  }

  function getQuotaStatus() {
    var count = _getWriteCount();
    var pct = WRITE_LIMIT > 0 ? (count / WRITE_LIMIT) * 100 : 0;
    return {
      writesToday: count,
      writeLimit: WRITE_LIMIT,
      circuitOpen: _isCircuitOpen(),
      percentUsed: Math.round(pct * 100) / 100
    };
  }

  // ══════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════

  return {
    // Personnel
    getPersonnel: getPersonnel,
    getPersonnelFromFirestore: getPersonnelFromFirestore,
    initPersonnel: initPersonnel,
    findByVolo: findByVolo,

    // Inventory
    getItems: getItems,
    getItemById: getItemById,
    getCaisses: getCaisses,
    getItemsFromFirestore: getItemsFromFirestore,
    getCaissesFromFirestore: getCaissesFromFirestore,
    initItems: initItems,

    // Transactions
    saveTransaction: saveTransaction,
    getTransactions: getTransactions,
    cancelTransaction: cancelTransaction,

    // Certifications
    getCerts: getCerts,
    setCert: setCert,

    // Pointage
    savePointage: savePointage,
    getPointages: getPointages,

    // Audit
    logAudit: logAudit,

    // Config
    getConfig: getConfig,
    getBaremes: getBaremes,

    // Photos
    uploadPhoto: uploadPhoto,
    uploadPhotoBase64: uploadPhotoBase64,
    savePhotoMetadata: savePhotoMetadata,

    // Push Notifications (FCM)
    requestNotificationPermission: requestNotificationPermission,
    onForegroundMessage: onForegroundMessage,
    notifyUrgence: notifyUrgence,
    notifyUrgencyAlert: notifyUrgencyAlert,

    // Stock State (multi-device sync)
    saveStockState: saveStockState,
    loadStockState: loadStockState,
    applyStockState: applyStockState,
    onStockChange: onStockChange,

    // Listeners
    onConfigChange: onConfigChange,
    onTransactionsChange: onTransactionsChange,
    onUrgencesChange: onUrgencesChange,
    onPointagesChange: onPointagesChange,
    onPhotosChange: onPhotosChange,

    // Status
    getStatus: getStatus,
    getQuotaStatus: getQuotaStatus,

    // Queue
    flushQueue: _queueFlush
  };
})();
