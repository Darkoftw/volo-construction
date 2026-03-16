// ══════════════════════════════════════════
//  VOLO SST — Firebase Configuration Centralisée
//  Chargé par TOUS les fichiers HTML
//  Les clés sont client-side safe (protégées par Security Rules)
// ══════════════════════════════════════════

(function() {
  'use strict';

  // --- Config Firebase ---
  // Remplacer les valeurs ci-dessous par celles de la console Firebase
  // Firebase Console > Project Settings > General > Your apps > Web app
  var firebaseConfig = {
    apiKey: "AIzaSyCL4KHdek_bTO9EX2YV0K4dQHCGbyspFGw",
    authDomain: "volo-sst-prod.firebaseapp.com",
    databaseURL: "https://volo-sst-prod-default-rtdb.firebaseio.com",
    projectId: "volo-sst-prod",
    storageBucket: "volo-sst-prod.firebasestorage.app",
    messagingSenderId: "205153358536",
    appId: "1:205153358536:web:3070869d38bc2bda870bfd",
    measurementId: "G-WHQ36WDR6D"
  };

  // --- Feature flags (activer progressivement) ---
  window.VOLO_FIREBASE = {
    enabled: false,       // Sera true après init réussi
    firestore: true,      // Lecture/écriture Firestore
    rtdb: true,           // Realtime Database (chat)
    auth: true,           // Firebase Auth — activé Phase 1
    storage: true,        // Firebase Storage photos — activé Phase 1
    dualWrite: true,      // Écrire Firestore + Webhook en parallèle
    firestorePrimary: true  // Phase 3 ACTIVÉ : Firestore source principale
  };

  // --- Environnement ---
  window.VOLO_ENV = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'dev' : 'prod';
  window.VOLO_ORG = 'ORG_VOLO_PROD';

  // --- Init ---
  window.firebaseApp = null;
  window.firebaseDB = null;   // Realtime Database
  window.firebaseFS = null;   // Firestore

  if (typeof firebase === 'undefined') {
    console.warn('[VOLO Firebase] SDK non chargé — scripts CDN manquants');
    return;
  }

  // Vérifier que la config n'est pas un placeholder
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'VOTRE_API_KEY') {
    console.log('[VOLO Firebase] Config placeholder — init skipped. Remplir firebase-config.js avec les vraies clés.');
    return;
  }

  try {
    // Éviter double init
    if (firebase.apps && firebase.apps.length > 0) {
      window.firebaseApp = firebase.apps[0];
    } else {
      window.firebaseApp = firebase.initializeApp(firebaseConfig);
    }

    // Realtime Database
    if (window.VOLO_FIREBASE.rtdb && typeof firebase.database === 'function') {
      window.firebaseDB = firebase.database();
    }

    // Firestore
    if (window.VOLO_FIREBASE.firestore && typeof firebase.firestore === 'function') {
      window.firebaseFS = firebase.firestore();
      // Activer la persistance offline
      window.firebaseFS.enablePersistence({ synchronizeTabs: true })
        .catch(function(err) {
          if (err.code === 'failed-precondition') {
            console.warn('[VOLO Firestore] Persistance désactivée — plusieurs onglets ouverts');
          } else if (err.code === 'unimplemented') {
            console.warn('[VOLO Firestore] Persistance non supportée par ce navigateur');
          }
        });
    }

    // Auth (Phase 2)
    if (window.VOLO_FIREBASE.auth && typeof firebase.auth === 'function') {
      window.firebaseAuth = firebase.auth();
    }

    // Storage (Phase 3)
    if (window.VOLO_FIREBASE.storage && typeof firebase.storage === 'function') {
      window.firebaseStorage = firebase.storage();
    }

    // Messaging / FCM (Push Notifications)
    if (typeof firebase.messaging === 'function') {
      try {
        window.firebaseMessaging = firebase.messaging();
        // VAPID key — générée depuis Firebase Console > Cloud Messaging > Web Push certificates
        // À remplacer par la vraie clé VAPID de volo-sst-prod
        window.VOLO_VAPID_KEY = 'BD4zd0ABIKs4STpmezoDpFBEw9QYfCwOIPOkpoEl9LauHohso7ONDGC0OVtPaqVsqcXQsSYthcLygpnRa0OeByo';
      } catch(e) {
        console.warn('[VOLO Firebase] Messaging init skipped:', e.message);
      }
    }

    window.VOLO_FIREBASE.enabled = true;
    console.log('[VOLO Firebase] Init OK — project:', firebaseConfig.projectId,
      '| FS:', !!window.firebaseFS, '| RTDB:', !!window.firebaseDB, '| MSG:', !!window.firebaseMessaging);

  } catch(e) {
    console.error('[VOLO Firebase] Init error:', e);
  }
})();
