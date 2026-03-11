#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Cleanup test docs + Create Auth for chiefs
//
//  1. Supprime USR-001 à USR-005 de Firestore /users (test seed)
//  2. Crée comptes Firebase Auth pour les chefs sans compte
//  3. Lie les UIDs aux docs Firestore + custom claims {role:'chef'}
//
//  USAGE:
//    node scripts/cleanup-and-chiefs.js --dry-run
//    node scripts/cleanup-and-chiefs.js --real
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--real');
if (DRY_RUN) {
  console.log('\n  MODE: --dry-run (preview)\n');
}

const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});
const db = admin.firestore();
const auth = admin.auth();

// ── Test docs à supprimer ──
const TEST_DOCS = ['USR-001', 'USR-002', 'USR-003', 'USR-004', 'USR-005'];

// ── Chefs sans compte Auth (identifiés par link-auth-users.js) ──
// On leur crée un compte avec email pattern: prenom.nom@volosst.com
// Mot de passe temporaire qu'ils changeront au premier login
const CHIEFS_TO_CREATE = [
  { voloId: 'V0077', name: 'Yann-Alexandre Belley', email: 'ybelley@volosst.com' },
  { voloId: 'V0089', name: 'Phillippe Monnier',     email: 'pmonnier@volosst.com' },
  { voloId: 'V0180', name: 'Maxime Boisvert',       email: 'mboisvert@volosst.com' },
  { voloId: 'V0357', name: 'Jean-Nicolas Maisonneuve', email: 'jmaisonneuve@volosst.com' },
];

function generateTempPassword(name) {
  // Volo + 6 chars aléatoires + !
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var pwd = 'Volo';
  for (var i = 0; i < 6; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd + '!';
}

async function main() {
  console.log('  ══════════════════════════════════════');
  console.log('   CLEANUP + CHEFS AUTH');
  console.log('  ══════════════════════════════════════\n');

  // ════════════════════════════════════════
  //  ÉTAPE 1 : Supprimer docs test USR-xxx
  // ════════════════════════════════════════
  console.log('  ── Étape 1 : Cleanup docs test ──');
  var deleted = 0;
  var skipDel = 0;

  for (var i = 0; i < TEST_DOCS.length; i++) {
    var docId = TEST_DOCS[i];
    var doc = await db.collection('users').doc(docId).get();
    if (doc.exists) {
      var d = doc.data();
      console.log('    ' + docId + ' | ' + (d.name || '?').padEnd(22) + ' | uid=' + (d.uid ? d.uid.substring(0, 12) + '...' : 'none'));
      if (!DRY_RUN) {
        await db.collection('users').doc(docId).delete();
        console.log('      \x1b[32m→ supprimé\x1b[0m');
        deleted++;
      }
    } else {
      console.log('    ' + docId + ' — déjà absent');
      skipDel++;
    }
  }
  console.log('  Résultat : ' + deleted + ' supprimés, ' + skipDel + ' absents\n');

  // ════════════════════════════════════════
  //  ÉTAPE 2 : Créer Auth pour les chefs
  // ════════════════════════════════════════
  console.log('  ── Étape 2 : Créer comptes Auth chefs ──');
  var created = 0;
  var errors = [];
  var credentials = [];

  for (var j = 0; j < CHIEFS_TO_CREATE.length; j++) {
    var chief = CHIEFS_TO_CREATE[j];

    // Vérifier si le doc Firestore existe
    var fsDoc = await db.collection('users').doc(chief.voloId).get();
    if (!fsDoc.exists) {
      console.log('    ⚠️  ' + chief.voloId + ' — doc Firestore inexistant, skip');
      continue;
    }

    // Vérifier si un compte Auth existe déjà pour cet email
    var existingAuth = null;
    try {
      existingAuth = await auth.getUserByEmail(chief.email);
    } catch (e) {
      // auth/user-not-found = normal, on va le créer
    }

    if (existingAuth) {
      console.log('    ' + chief.voloId + ' | ' + chief.name.padEnd(28) + ' | Auth existe déjà: ' + chief.email);
      // Lier quand même si pas de uid dans Firestore
      var fsData = fsDoc.data();
      if (!fsData.uid) {
        if (!DRY_RUN) {
          await db.collection('users').doc(chief.voloId).update({
            uid: existingAuth.uid,
            authEmail: chief.email,
            linkedAt: new Date().toISOString()
          });
          await auth.setCustomUserClaims(existingAuth.uid, { role: 'chef' });
          console.log('      \x1b[32m→ lié uid + claims chef\x1b[0m');
        } else {
          console.log('      → serait lié (dry-run)');
        }
      }
      continue;
    }

    var tempPwd = generateTempPassword(chief.name);
    console.log('    ' + chief.voloId + ' | ' + chief.name.padEnd(28) + ' | ' + chief.email);

    if (DRY_RUN) {
      console.log('      → serait créé avec pwd temporaire (dry-run)');
      credentials.push({ voloId: chief.voloId, name: chief.name, email: chief.email, password: tempPwd });
      continue;
    }

    try {
      // Créer le compte Auth
      var userRecord = await auth.createUser({
        email: chief.email,
        password: tempPwd,
        displayName: chief.name,
        emailVerified: false
      });

      // Custom claims
      await auth.setCustomUserClaims(userRecord.uid, { role: 'chef' });

      // Lier dans Firestore
      await db.collection('users').doc(chief.voloId).update({
        uid: userRecord.uid,
        authEmail: chief.email,
        linkedAt: new Date().toISOString()
      });

      // Audit log
      await db.collection('audit_logs').add({
        action: 'AUTH_CREATE_CHEF',
        voloId: chief.voloId,
        uid: userRecord.uid,
        email: chief.email,
        ts: new Date().toISOString(),
        by: 'scripts/cleanup-and-chiefs.js'
      });

      created++;
      credentials.push({ voloId: chief.voloId, name: chief.name, email: chief.email, password: tempPwd });
      console.log('      \x1b[32m✓ créé\x1b[0m uid=' + userRecord.uid.substring(0, 12) + '... | claims={role:chef}');
    } catch (e) {
      errors.push({ voloId: chief.voloId, error: e.message });
      console.log('      \x1b[31m✗ ' + e.message + '\x1b[0m');
    }
  }

  // ════════════════════════════════════════
  //  RAPPORT FINAL
  // ════════════════════════════════════════
  console.log('\n  ══════════════════════════════════════');
  console.log('   RAPPORT');
  console.log('  ══════════════════════════════════════');
  console.log('  Docs test supprimés : ' + deleted);
  console.log('  Comptes Auth créés  : \x1b[32m' + created + '\x1b[0m');
  if (errors.length > 0) {
    console.log('  Erreurs             : \x1b[31m' + errors.length + '\x1b[0m');
    errors.forEach(function(e) { console.log('    → ' + e.voloId + ': ' + e.error); });
  }

  if (credentials.length > 0) {
    console.log('\n  ── Identifiants temporaires (À CHANGER AU PREMIER LOGIN) ──');
    console.log('  ⚠️  CONSERVEZ CES IDENTIFIANTS — ils ne seront pas réaffichés\n');
    credentials.forEach(function(c) {
      console.log('    ' + c.voloId + ' | ' + c.name.padEnd(28) + ' | ' + c.email);
      console.log('           pwd: ' + c.password);
    });
  }

  if (DRY_RUN) {
    console.log('\n  \x1b[33mDRY RUN — aucune écriture. Relancer avec --real\x1b[0m');
  }

  // Count final
  var finalSnap = await db.collection('users').get();
  console.log('\n  Firestore /users final : ' + finalSnap.size + ' documents');
  console.log('  ══════════════════════════════════════\n');

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n  \x1b[31mERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
