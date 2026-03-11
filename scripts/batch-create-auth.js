#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Batch Create Firebase Auth accounts
//
//  Crée un compte Firebase Auth pour chaque doc
//  Firestore /users qui n'a PAS encore de authUid.
//
//  Email : v{voloId}@volo-sst.local (placeholder)
//  Password : Volo{voloId}!2026  (temporaire)
//  Claims : { role } depuis le doc Firestore
//
//  PREREQUIS:
//    service-account-key.json dans volo-deploy/
//    Firebase Auth Email/Password activé dans la console
//
//  USAGE:
//    node scripts/batch-create-auth.js --dry-run   (preview)
//    node scripts/batch-create-auth.js --real       (création)
//
//  APRÈS EXÉCUTION:
//    Chaque doc Firestore /users/{voloId} est mis à jour
//    avec { authUid, authEmail, claims_updated }
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ── Args ──
const DRY_RUN = !process.argv.includes('--real');
if (DRY_RUN) {
  console.log('\n  MODE: --dry-run (preview, aucune création)');
  console.log('  Ajouter --real pour créer les comptes\n');
}

// ── Firebase Admin ──
const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('\x1b[31m  ERREUR: service-account-key.json introuvable\x1b[0m');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});
const db = admin.firestore();

// ── Roles ──
const VALID_ROLES = ['admin', 'chef', 'sauveteur', 'surveillant', 'rh'];

function normalizeRole(role) {
  if (!role) return 'sauveteur';
  var r = role.toLowerCase().trim();
  if (r === "chef d'equipe" || r === "chef d'équipe" || r === 'chef_equipe' || r === 'coordonnateur') r = 'chef';
  if (r === 'rescue' || r === 'sauv') r = 'sauveteur';
  if (r === 'surv') r = 'surveillant';
  if (!VALID_ROLES.includes(r)) r = 'sauveteur';
  return r;
}

// ── Email / Password generators ──
function makeEmail(voloId) {
  // v0205@volo-sst.local
  return voloId.toLowerCase() + '@volo-sst.local';
}

function makePassword(voloId) {
  // Volo0205!2026 — temporaire, à changer au premier login
  return 'Volo' + voloId.replace('V', '') + '!2026';
}

// ── Progress ──
function progress(current, total, label) {
  var pct = Math.round((current / total) * 100);
  var width = 30;
  var filled = Math.round((current / total) * width);
  var bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  process.stdout.write('\r  [' + bar + '] ' + pct + '% (' + current + '/' + total + ') ' + label + '        ');
}

// ── Main ──
async function main() {
  console.log('  ══════════════════════════════════════════');
  console.log('   VOLO SST — Batch Create Auth Accounts');
  console.log('  ══════════════════════════════════════════\n');

  // 1. Lire Firestore /users
  console.log('  [1/3] Lecture Firestore /users...');
  var snap = await db.collection('users').get();
  var allDocs = [];
  snap.forEach(function(doc) {
    var d = doc.data();
    allDocs.push({
      docId: doc.id,
      name: d.name || d.nom || d.displayName || '',
      role: d.role || 'SAUVETEUR',
      volo: d.volo || d.voloId || doc.id,
      authUid: d.authUid || null,
      email: d.email || ''
    });
  });
  console.log('  ✓  ' + allDocs.length + ' docs\n');

  // 2. Filtrer : seulement ceux sans authUid
  var needsAuth = allDocs.filter(function(d) { return !d.authUid; });
  var alreadyHasAuth = allDocs.filter(function(d) { return !!d.authUid; });

  console.log('  [2/3] Analyse...');
  console.log('  ✓  ' + alreadyHasAuth.length + ' ont déjà un compte Auth');
  console.log('  ✓  ' + needsAuth.length + ' à créer\n');

  if (needsAuth.length === 0) {
    console.log('  Rien à faire — tous les membres ont un compte Auth.\n');
    process.exit(0);
  }

  // Stats par rôle
  var roleStats = {};
  needsAuth.forEach(function(d) {
    var r = normalizeRole(d.role);
    roleStats[r] = (roleStats[r] || 0) + 1;
  });
  console.log('  Par rôle :');
  Object.keys(roleStats).sort().forEach(function(r) {
    console.log('    ' + r.padEnd(16) + roleStats[r]);
  });

  // Preview
  console.log('\n  Aperçu (10 premiers) :');
  needsAuth.slice(0, 10).forEach(function(d) {
    console.log('    ' + d.docId.padEnd(8) + d.name.padEnd(26) + normalizeRole(d.role).padEnd(14) + makeEmail(d.volo));
  });
  if (needsAuth.length > 10) {
    console.log('    ... et ' + (needsAuth.length - 10) + ' autres');
  }

  if (DRY_RUN) {
    console.log('\n  ──────────────────────────────');
    console.log('  \x1b[33mDRY RUN — aucune création.\x1b[0m');
    console.log('  ' + needsAuth.length + ' comptes à créer. Relancer avec --real');
    console.log('  ──────────────────────────────\n');
    process.exit(0);
  }

  // 3. Créer les comptes
  console.log('\n  [3/3] Création des comptes Auth + claims...\n');
  var created = 0;
  var skipped = 0;
  var errors = 0;
  var errorList = [];

  for (var i = 0; i < needsAuth.length; i++) {
    var d = needsAuth[i];
    var email = makeEmail(d.volo);
    var password = makePassword(d.volo);
    var role = normalizeRole(d.role);
    progress(i + 1, needsAuth.length, d.docId);

    try {
      // Vérifier si un Auth user avec cet email existe déjà
      var existingUser = null;
      try {
        existingUser = await admin.auth().getUserByEmail(email);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }

      var uid;
      if (existingUser) {
        // User Auth existe — juste lier
        uid = existingUser.uid;
        skipped++;
      } else {
        // Créer le user
        var userRecord = await admin.auth().createUser({
          email: email,
          password: password,
          displayName: d.name,
          disabled: false
        });
        uid = userRecord.uid;
        created++;
      }

      // Assigner claims
      await admin.auth().setCustomUserClaims(uid, { role: role });

      // Mettre à jour Firestore
      await db.collection('users').doc(d.docId).update({
        authUid: uid,
        authEmail: email,
        role: role.toUpperCase(),
        claims_updated: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (e) {
      errors++;
      errorList.push({ docId: d.docId, name: d.name, error: e.code || e.message });
    }

    // Throttle 150ms — éviter rate limit Firebase Auth
    if (i < needsAuth.length - 1) {
      await new Promise(function(r) { setTimeout(r, 150); });
    }
  }

  // Rapport
  console.log('\n\n  ══════════════════════════════════════════');
  console.log('   RAPPORT BATCH CREATE AUTH');
  console.log('  ══════════════════════════════════════════');
  console.log('  Total Firestore    : ' + allDocs.length);
  console.log('  Déjà Auth avant    : ' + alreadyHasAuth.length);
  console.log('  Créés              : \x1b[32m' + created + '\x1b[0m');
  console.log('  Liés (existaient)  : ' + skipped);
  console.log('  Erreurs            : ' + (errors > 0 ? '\x1b[31m' + errors + '\x1b[0m' : '0'));
  console.log('  Total Auth après   : ' + (alreadyHasAuth.length + created + skipped));
  if (errorList.length > 0) {
    console.log('\n  Erreurs détaillées :');
    errorList.forEach(function(e) {
      console.log('    ' + e.docId.padEnd(8) + e.name.padEnd(26) + e.error);
    });
  }
  console.log('  ══════════════════════════════════════════');
  console.log('\n  Email format   : {voloId}@volo-sst.local');
  console.log('  Password format: Volo{pin}!2026');
  console.log('  Exemple        : v0205@volo-sst.local / Volo0205!2026');
  console.log('\n  \x1b[33mATTENTION:\x1b[0m Les mots de passe sont temporaires.');
  console.log('  Chaque membre devra changer son mot de passe au premier login.\n');

  // Relancer batch-set-claims pour vérifier
  if (created > 0 || skipped > 0) {
    console.log('  Prochaine étape : vérifier les claims');
    console.log('    node scripts/batch-set-claims.js --dry-run\n');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n\x1b[31m  ERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
