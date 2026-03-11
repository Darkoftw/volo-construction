// ══════════════════════════════════════════
//  VOLO SST — Firebase Auth Module
//  Requiert : firebase-config.js chargé avant
//  Gère : login email/password, PIN terrain, session, rôles
// ══════════════════════════════════════════

var VoloAuth = (function() {
  'use strict';

  // --- State ---
  var _currentUser = null;    // Firebase Auth user
  var _voloProfile = null;    // Personnel profile from Firestore
  var _authListeners = [];
  var _ready = false;

  function _auth() { return window.firebaseAuth; }
  function _fs() { return window.firebaseFS; }
  function _enabled() { return _auth() && window.VOLO_FIREBASE && window.VOLO_FIREBASE.enabled; }

  // ══════════════════════════════════════════
  //  INIT — Auth state observer
  // ══════════════════════════════════════════

  function init() {
    if (!_enabled()) {
      console.log('[VoloAuth] Firebase Auth non disponible — mode offline/stub');
      _ready = true;
      _notifyListeners(null);
      return;
    }

    _auth().onAuthStateChanged(function(user) {
      _currentUser = user;
      if (user) {
        console.log('[VoloAuth] Connecté:', user.email || user.uid);
        // Charger le profil Firestore
        _loadProfile(user).then(function(profile) {
          _voloProfile = profile;
          _ready = true;
          _notifyListeners(user, profile);
        });
      } else {
        console.log('[VoloAuth] Déconnecté');
        _voloProfile = null;
        _ready = true;
        _notifyListeners(null, null);
      }
    });
  }

  // ══════════════════════════════════════════
  //  LOGIN — Email/Password (bureau)
  // ══════════════════════════════════════════

  function loginEmail(email, password) {
    if (!_enabled()) {
      return Promise.reject(new Error('Firebase Auth non activé'));
    }
    return _auth().signInWithEmailAndPassword(email, password)
      .then(function(cred) {
        _logAudit('USER_LOGIN', { method: 'email', email: email });
        return cred.user;
      })
      .catch(function(err) {
        _logAudit('LOGIN_FAILED', { method: 'email', email: email, error: err.code });
        throw _translateError(err);
      });
  }

  // ══════════════════════════════════════════
  //  LOGIN — PIN terrain (VOLO ID)
  // ══════════════════════════════════════════

  function loginPin(pin) {
    // pin = "0205" → cherche dans PERSONNEL puis Firestore
    var voloId = 'V' + pin;

    // 1. Chercher dans le PERSONNEL local (stub ou chargé)
    var localMatch = null;
    if (typeof PERSONNEL !== 'undefined' && PERSONNEL.length) {
      localMatch = PERSONNEL.find(function(p) { return p.volo === voloId; });
    }

    // 2. Si Firestore dispo, vérifier aussi
    if (_fs() && window.VOLO_FIREBASE && window.VOLO_FIREBASE.enabled) {
      return _fs().collection('users').doc(voloId).get()
        .then(function(doc) {
          if (doc.exists) {
            var profile = doc.data();
            profile._id = doc.id;
            _voloProfile = profile;
            // Sign in anonymously pour avoir un uid Firebase
            return _ensureAnonymousAuth().then(function() {
              _logAudit('USER_LOGIN', { method: 'pin', voloId: voloId });
              return profile;
            });
          }
          // Fallback au local
          if (localMatch) {
            _voloProfile = localMatch;
            return _ensureAnonymousAuth().then(function() {
              return localMatch;
            });
          }
          return null;
        })
        .catch(function() {
          // Offline — fallback local
          if (localMatch) {
            _voloProfile = localMatch;
            return localMatch;
          }
          return null;
        });
    }

    // 3. Pas de Firestore — local seulement
    if (localMatch) {
      _voloProfile = localMatch;
      return Promise.resolve(localMatch);
    }
    return Promise.resolve(null);
  }

  function _ensureAnonymousAuth() {
    if (!_enabled()) return Promise.resolve();
    if (_currentUser) return Promise.resolve();
    return _auth().signInAnonymously().catch(function(e) {
      console.warn('[VoloAuth] Anonymous auth failed:', e.message);
    });
  }

  // ══════════════════════════════════════════
  //  REGISTER — Créer un compte email (admin)
  // ══════════════════════════════════════════

  function register(email, password, displayName) {
    if (!_enabled()) {
      return Promise.reject(new Error('Firebase Auth non activé'));
    }
    return _auth().createUserWithEmailAndPassword(email, password)
      .then(function(cred) {
        if (displayName) {
          return cred.user.updateProfile({ displayName: displayName }).then(function() {
            return cred.user;
          });
        }
        return cred.user;
      })
      .catch(function(err) {
        throw _translateError(err);
      });
  }

  // ══════════════════════════════════════════
  //  LOGOUT
  // ══════════════════════════════════════════

  function logout() {
    _logAudit('USER_LOGOUT', {});
    _voloProfile = null;
    _currentUser = null;

    // Nettoyer session localStorage
    try {
      localStorage.removeItem('volo_last_pin');
      localStorage.removeItem('volo_last_role');
      localStorage.removeItem('volo_last_name');
      localStorage.removeItem('volo_last_volo');
      localStorage.removeItem('volo_pin');
    } catch(e) {}

    if (_enabled()) {
      return _auth().signOut();
    }
    return Promise.resolve();
  }

  // ══════════════════════════════════════════
  //  PASSWORD RESET
  // ══════════════════════════════════════════

  function resetPassword(email) {
    if (!_enabled()) {
      return Promise.reject(new Error('Firebase Auth non activé'));
    }
    return _auth().sendPasswordResetEmail(email)
      .catch(function(err) {
        throw _translateError(err);
      });
  }

  // ══════════════════════════════════════════
  //  PROFILE
  // ══════════════════════════════════════════

  function _loadProfile(authUser) {
    if (!_fs()) return Promise.resolve(null);

    // Chercher par email d'abord
    if (authUser.email) {
      return _fs().collection('users')
        .where('email', '==', authUser.email)
        .limit(1)
        .get()
        .then(function(snap) {
          if (!snap.empty) {
            var data = snap.docs[0].data();
            data._id = snap.docs[0].id;
            return data;
          }
          return null;
        })
        .catch(function() { return null; });
    }
    return Promise.resolve(null);
  }

  function getProfile() {
    return _voloProfile;
  }

  function getUser() {
    return _currentUser;
  }

  function isLoggedIn() {
    return !!_currentUser || !!_voloProfile;
  }

  function getRole() {
    if (_voloProfile) return _voloProfile.role || 'SAUVETEUR';
    return null;
  }

  function isChef() {
    var role = getRole();
    return role && role.toUpperCase().includes('CHEF');
  }

  function isAdmin() {
    // Custom claims check
    if (_currentUser && _currentUser.getIdTokenResult) {
      // Async — use hasAdminClaim() for sync
    }
    var role = getRole();
    return role && (role.toUpperCase().includes('CHEF') || role.toUpperCase().includes('COORDONNATEUR'));
  }

  function isSurveillant() {
    var role = getRole();
    return role && role.toUpperCase() === 'SURVEILLANT';
  }

  // ══════════════════════════════════════════
  //  LISTENERS
  // ══════════════════════════════════════════

  function onAuthChange(callback) {
    _authListeners.push(callback);
    // Si déjà prêt, notifier immédiatement
    if (_ready) {
      callback(_currentUser, _voloProfile);
    }
    return function() {
      _authListeners = _authListeners.filter(function(cb) { return cb !== callback; });
    };
  }

  function _notifyListeners(user, profile) {
    _authListeners.forEach(function(cb) {
      try { cb(user, profile); } catch(e) { console.error('[VoloAuth] Listener error:', e); }
    });
  }

  // ══════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════

  function _translateError(err) {
    var msg = {
      'auth/user-not-found': 'Aucun compte avec cet email',
      'auth/wrong-password': 'Mot de passe incorrect',
      'auth/invalid-email': 'Email invalide',
      'auth/email-already-in-use': 'Cet email est déjà utilisé',
      'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum)',
      'auth/too-many-requests': 'Trop de tentatives — réessayer plus tard',
      'auth/network-request-failed': 'Erreur réseau — vérifier la connexion',
      'auth/invalid-credential': 'Email ou mot de passe incorrect'
    };
    err.friendlyMessage = msg[err.code] || err.message;
    return err;
  }

  function _logAudit(action, details) {
    if (typeof VoloData !== 'undefined' && VoloData.logAudit) {
      VoloData.logAudit(action, details);
    }
  }

  // ══════════════════════════════════════════
  //  POPULATE PERSONNEL FROM FIRESTORE
  //  Charge les 156 membres dans le tableau PERSONNEL
  // ══════════════════════════════════════════

  function loadPersonnelFromFirestore() {
    if (!_fs() || !window.VOLO_FIREBASE || !window.VOLO_FIREBASE.enabled) {
      return Promise.resolve(false);
    }

    return _fs().collection('users')
      .where('active', '!=', false)
      .get()
      .then(function(snap) {
        if (snap.empty) {
          console.log('[VoloAuth] Aucun personnel dans Firestore — utilise le stub local');
          return false;
        }
        var members = snap.docs.map(function(d) {
          var data = d.data();
          // Mapper vers le format attendu par l'app
          return {
            id: data.id || d.id,
            volo: data.volo || data.voloId || d.id,
            name: data.name || '',
            role: data.role || 'SAUVETEUR',
            type: data.type || 'SAUVETEUR',
            region: data.region || '',
            ville: data.ville || '',
            email: '' // On ne stocke pas les emails côté client
          };
        });

        // Remplacer le PERSONNEL global
        if (typeof window.PERSONNEL !== 'undefined') {
          window.PERSONNEL.length = 0;
          members.forEach(function(m) { window.PERSONNEL.push(m); });
        } else {
          window.PERSONNEL = members;
        }
        window.SAUVETEURS = window.PERSONNEL;

        console.log('[VoloAuth] Personnel chargé depuis Firestore:', members.length, 'membres');
        return true;
      })
      .catch(function(e) {
        console.warn('[VoloAuth] Erreur chargement personnel Firestore:', e.message);
        return false;
      });
  }

  // ══════════════════════════════════════════
  //  AUTO-INIT
  // ══════════════════════════════════════════

  // Init dès le chargement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      init();
      loadPersonnelFromFirestore();
    });
  } else {
    init();
    loadPersonnelFromFirestore();
  }

  // ══════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════

  return {
    // Login
    loginEmail: loginEmail,
    loginPin: loginPin,
    register: register,
    logout: logout,
    resetPassword: resetPassword,

    // State
    getUser: getUser,
    getProfile: getProfile,
    isLoggedIn: isLoggedIn,
    getRole: getRole,
    isChef: isChef,
    isAdmin: isAdmin,
    isSurveillant: isSurveillant,

    // Listeners
    onAuthChange: onAuthChange,

    // Data
    loadPersonnelFromFirestore: loadPersonnelFromFirestore,

    // Init
    init: init
  };
})();
