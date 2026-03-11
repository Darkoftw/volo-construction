#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Batch Set Custom Claims
//
//  Lit les rôles depuis Firestore /users et
//  assigne les custom claims Firebase Auth
//  { role: 'admin'|'chef'|'sauveteur'|'surveillant' }
//
//  PREREQUIS:
//    service-account-key.json dans volo-deploy/
//
//  USAGE:
//    node scripts/batch-set-claims.js --dry-run   (preview)
//    node scripts/batch-set-claims.js --real       (écriture)
//
//  STRATÉGIE:
//    1. Lire tous les docs Firestore /users
//    2. Lister tous les users Firebase Auth
//    3. Matcher par email ou authUid
//    4. Assigner custom claims { role } pour chaque match
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ── Args ──
const DRY_RUN = !process.argv.includes('--real');
if (DRY_RUN) {
  console.log('\n  MODE: --dry-run (preview, aucune écriture)');
  console.log('  Ajouter --real pour assigner les claims\n');
}

// ── Firebase Admin ──
const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('\x1b[31m  ERREUR: service-account-key.json introuvable\x1b[0m');
  console.error('  Télécharger depuis: Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});
const db = admin.firestore();

// ── Roles valides ──
const VALID_ROLES = ['admin', 'chef', 'sauveteur', 'surveillant', 'rh'];

function normalizeRole(role) {
  if (!role) return 'sauveteur';
  var r = role.toLowerCase().trim();
  // Mapping variantes
  if (r === "chef d'equipe" || r === "chef d'équipe" || r === 'chef_equipe') r = 'chef';
  if (r === 'rescue' || r === 'sauv') r = 'sauveteur';
  if (r === 'surv') r = 'surveillant';
  if (!VALID_ROLES.includes(r)) r = 'sauveteur';
  return r;
}

// ── Progress ──
function progress(current, total, label) {
  var pct = Math.round((current / total) * 100);
  var width = 30;
  var filled = Math.round((current / total) * width);
  var bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  process.stdout.write('\r  [' + bar + '] ' + pct + '% (' + current + '/' + total + ') ' + label + '    ');
}

// ── Main ──
async function main() {
  console.log('  ══════════════════════════════════════════');
  console.log('   VOLO SST — Batch Set Custom Claims');
  console.log('  ══════════════════════════════════════════\n');

  // 1. Lire tous les docs Firestore /users
  console.log('  [1/4] Lecture Firestore /users...');
  var usersSnap = await db.collection('users').get();
  var firestoreUsers = {};
  usersSnap.forEach(function(doc) {
    var d = doc.data();
    firestoreUsers[doc.id] = {
      docId: doc.id,
      name: d.name || d.nom || d.displayName || '',
      role: d.role || 'SAUVETEUR',
      email: d.email || '',
      authUid: d.authUid || null,
      volo: d.volo || d.voloId || doc.id
    };
  });
  console.log('  ✓  ' + Object.keys(firestoreUsers).length + ' docs Firestore\n');

  // 2. Lister tous les users Firebase Auth
  console.log('  [2/4] Listing Firebase Auth users...');
  var authUsers = [];
  var nextPageToken = undefined;
  do {
    var listResult = await admin.auth().listUsers(1000, nextPageToken);
    authUsers = authUsers.concat(listResult.users);
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);
  console.log('  ✓  ' + authUsers.length + ' users Firebase Auth\n');

  // 3. Matcher Auth ↔ Firestore
  console.log('  [3/4] Matching Auth ↔ Firestore...');
  var matches = [];
  var noMatch = [];
  var authByUid = {};
  authUsers.forEach(function(u) { authByUid[u.uid] = u; });

  // Index Auth users par email pour lookup rapide
  var authByEmail = {};
  authUsers.forEach(function(u) {
    if (u.email) authByEmail[u.email.toLowerCase()] = u;
  });

  Object.keys(firestoreUsers).forEach(function(docId) {
    var fsUser = firestoreUsers[docId];
    var authUser = null;

    // Match 1: par authUid stocké dans le doc Firestore
    if (fsUser.authUid && authByUid[fsUser.authUid]) {
      authUser = authByUid[fsUser.authUid];
    }
    // Match 2: par email
    if (!authUser && fsUser.email) {
      authUser = authByEmail[fsUser.email.toLowerCase()] || null;
    }
    // Match 3: chercher un Auth user dont le displayName matche le voloId
    if (!authUser) {
      authUser = authUsers.find(function(u) {
        return u.displayName && u.displayName.includes(docId);
      }) || null;
    }

    if (authUser) {
      matches.push({
        docId: docId,
        authUid: authUser.uid,
        email: authUser.email || '(anonymous)',
        name: fsUser.name,
        currentClaims: authUser.customClaims || {},
        targetRole: normalizeRole(fsUser.role)
      });
    } else {
      noMatch.push({
        docId: docId,
        name: fsUser.name,
        role: fsUser.role
      });
    }
  });

  console.log('  ✓  ' + matches.length + ' matches, ' + noMatch.length + ' sans Auth account\n');

  // Afficher le plan
  console.log('  ── PLAN ──');
  var toUpdate = [];
  var alreadyOk = [];
  var skipped = [];

  matches.forEach(function(m) {
    var currentRole = m.currentClaims.role || '(aucun)';
    if (currentRole === m.targetRole) {
      alreadyOk.push(m);
    } else {
      toUpdate.push(m);
    }
  });

  if (toUpdate.length > 0) {
    console.log('\n  Claims à assigner (' + toUpdate.length + ') :');
    toUpdate.forEach(function(m) {
      var current = m.currentClaims.role || '(aucun)';
      console.log('    ' + m.docId.padEnd(8) + m.name.padEnd(28) + current.padEnd(14) + ' → ' + m.targetRole);
    });
  }

  if (alreadyOk.length > 0) {
    console.log('\n  Déjà OK (' + alreadyOk.length + ') :');
    alreadyOk.slice(0, 5).forEach(function(m) {
      console.log('    ' + m.docId.padEnd(8) + m.name.padEnd(28) + m.targetRole);
    });
    if (alreadyOk.length > 5) {
      console.log('    ... et ' + (alreadyOk.length - 5) + ' autres');
    }
  }

  if (noMatch.length > 0) {
    console.log('\n  Sans compte Auth (' + noMatch.length + ') — claims impossibles :');
    noMatch.slice(0, 10).forEach(function(m) {
      console.log('    ' + m.docId.padEnd(8) + m.name.padEnd(28) + m.role);
    });
    if (noMatch.length > 10) {
      console.log('    ... et ' + (noMatch.length - 10) + ' autres');
    }
  }

  // Dry run → stop
  if (DRY_RUN) {
    console.log('\n  ──────────────────────────────');
    console.log('  \x1b[33mDRY RUN — aucune écriture.\x1b[0m');
    console.log('  ' + toUpdate.length + ' claims à assigner. Relancer avec --real');
    console.log('  ──────────────────────────────\n');
    process.exit(0);
  }

  // 4. Assigner les claims
  if (toUpdate.length === 0) {
    console.log('\n  Rien à faire — tous les claims sont déjà à jour.\n');
    process.exit(0);
  }

  console.log('\n  [4/4] Attribution des custom claims...');
  var success = 0;
  var errors = 0;
  var errorList = [];

  for (var i = 0; i < toUpdate.length; i++) {
    var m = toUpdate[i];
    progress(i + 1, toUpdate.length, m.docId);
    try {
      await admin.auth().setCustomUserClaims(m.authUid, { role: m.targetRole });

      // Mettre à jour le doc Firestore aussi
      await db.collection('users').doc(m.docId).update({
        role: m.targetRole.toUpperCase(),
        claims_updated: admin.firestore.FieldValue.serverTimestamp()
      });

      success++;
    } catch (e) {
      errors++;
      errorList.push({ docId: m.docId, error: e.message });
    }

    // Throttle 100ms entre chaque appel
    if (i < toUpdate.length - 1) {
      await new Promise(function(r) { setTimeout(r, 100); });
    }
  }

  // Rapport
  console.log('\n\n  ══════════════════════════════════════════');
  console.log('   RAPPORT BATCH SET CLAIMS');
  console.log('  ══════════════════════════════════════════');
  console.log('  Firestore docs     : ' + Object.keys(firestoreUsers).length);
  console.log('  Auth users         : ' + authUsers.length);
  console.log('  Matches            : ' + matches.length);
  console.log('  Déjà OK            : ' + alreadyOk.length);
  console.log('  Claims assignés    : \x1b[32m' + success + '\x1b[0m');
  if (errors > 0) {
    console.log('  Erreurs            : \x1b[31m' + errors + '\x1b[0m');
    errorList.forEach(function(e) {
      console.log('    ' + e.docId + ': ' + e.error);
    });
  } else {
    console.log('  Erreurs            : 0');
  }
  console.log('  Sans compte Auth   : ' + noMatch.length + ' (claims non attribués)');
  console.log('  ══════════════════════════════════════════\n');

  if (noMatch.length > 0) {
    console.log('  \x1b[33mNote:\x1b[0m ' + noMatch.length + ' membres Firestore n\'ont pas de compte Auth.');
    console.log('  Pour leur créer un compte :');
    console.log('    node scripts/create-admin.js <email> <password> <name> <voloId> [region] [ville]\n');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n\x1b[31m  ERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
