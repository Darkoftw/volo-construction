#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Créer le premier compte Admin
//
//  Crée un user Firebase Auth + custom claim {role:'admin'}
//  + document Firestore users/{voloId}
//
//  PREREQUIS:
//    service-account-key.json dans le dossier parent (volo-deploy/)
//
//  USAGE:
//    node scripts/create-admin.js <email> <password> <displayName> <voloId> [region] [ville]
//
//  EXEMPLE:
//    node scripts/create-admin.js admin@voloconstruction.com MonMdp123! "Jonathan Milone" V0205 ESTRIE Sherbrooke
//
//  RESULTAT:
//    1. User Firebase Auth créé (email/password)
//    2. Custom claims assignés: { role: 'admin' }
//    3. Doc Firestore users/{voloId} créé
//    4. Audit log écrit dans audit_logs/
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ── Args CLI ──
const args = process.argv.slice(2);

if (args.length < 4 || args.includes('--help') || args.includes('-h')) {
  console.log('');
  console.log('  VOLO SST — Créer le premier admin Firebase');
  console.log('');
  console.log('  Usage:');
  console.log('    node scripts/create-admin.js <email> <password> <displayName> <voloId> [region] [ville]');
  console.log('');
  console.log('  Exemple:');
  console.log('    node scripts/create-admin.js admin@voloconstruction.com Pass123! "Jonathan Milone" V0205 ESTRIE Sherbrooke');
  console.log('');
  console.log('  Prerequis:');
  console.log('    - service-account-key.json dans volo-deploy/');
  console.log('    - Firebase Auth Email/Password activé dans la console');
  console.log('');
  process.exit(0);
}

const [email, password, displayName, voloId, region, ville] = args;

// ── Validation ──
if (!email.includes('@')) {
  console.error('\n  ERREUR: Email invalide —', email);
  process.exit(1);
}
if (password.length < 6) {
  console.error('\n  ERREUR: Mot de passe trop court (min 6 caractères)');
  process.exit(1);
}
if (!voloId.startsWith('V')) {
  console.error('\n  ERREUR: voloId doit commencer par V (ex: V0205)');
  process.exit(1);
}

// ── Firebase Admin init ──
const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('\n  ERREUR: service-account-key.json introuvable dans volo-deploy/');
  console.error('  Télécharger depuis: Firebase Console > Project Settings > Service Accounts > Generate new private key');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});

const db = admin.firestore();

// ── Main ──
async function createAdmin() {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  VOLO SST — Création compte Admin');
  console.log('══════════════════════════════════════════');
  console.log('');
  console.log('  Email:       ', email);
  console.log('  Nom:         ', displayName);
  console.log('  VOLO ID:     ', voloId);
  console.log('  Rôle:         admin');
  console.log('  Région:      ', region || '(non spécifiée)');
  console.log('  Ville:       ', ville || '(non spécifiée)');
  console.log('');

  // 1. Vérifier si le user existe déjà
  try {
    const existing = await admin.auth().getUserByEmail(email);
    console.log('  ⚠  User Firebase Auth existe déjà: uid=' + existing.uid);
    console.log('     Mise à jour des claims et du profil Firestore...');

    // Mettre à jour les claims
    await admin.auth().setCustomUserClaims(existing.uid, { role: 'admin' });
    console.log('  ✓  Custom claims mis à jour: { role: "admin" }');

    // Mettre à jour Firestore
    await writeFirestoreProfile(existing.uid);
    await writeAuditLog(existing.uid, 'ADMIN_UPDATED');

    printSuccess(existing.uid);
    return;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('  ERREUR inattendue:', e.message);
      process.exit(1);
    }
    // User n'existe pas → on le crée
  }

  // 2. Créer le user Firebase Auth
  console.log('  [1/4] Création user Firebase Auth...');
  var userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      disabled: false
    });
    console.log('  ✓  User créé: uid=' + userRecord.uid);
  } catch (e) {
    console.error('  ERREUR création user:', e.message);
    if (e.code === 'auth/email-already-exists') {
      console.error('  → Cet email est déjà utilisé dans Firebase Auth');
    }
    process.exit(1);
  }

  var uid = userRecord.uid;

  // 3. Assigner custom claims
  console.log('  [2/4] Attribution custom claims { role: "admin" }...');
  try {
    await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    console.log('  ✓  Claims assignés');
  } catch (e) {
    console.error('  ERREUR claims:', e.message);
    console.error('  → Le user existe mais sans rôle admin. Relancer le script.');
    process.exit(1);
  }

  // 4. Écrire le profil Firestore
  await writeFirestoreProfile(uid);

  // 5. Audit log
  await writeAuditLog(uid, 'ADMIN_CREATED');

  printSuccess(uid);
}

async function writeFirestoreProfile(uid) {
  console.log('  [3/4] Écriture profil Firestore users/' + voloId + '...');
  try {
    await db.collection('users').doc(voloId).set({
      id: voloId,
      volo: voloId,
      name: displayName,
      email: email,
      role: 'ADMIN',
      type: 'SAUVETEUR',
      region: region || '',
      ville: ville || '',
      active: true,
      authUid: uid,
      org: 'ORG_VOLO_PROD',
      source: 'create-admin-script',
      created: admin.firestore.FieldValue.serverTimestamp(),
      claims_updated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('  ✓  Profil Firestore écrit');
  } catch (e) {
    console.error('  ⚠  Firestore write failed:', e.message);
    console.error('  → Le user Auth existe, mais pas de profil Firestore.');
  }
}

async function writeAuditLog(uid, action) {
  console.log('  [4/4] Audit log...');
  try {
    await db.collection('audit_logs').add({
      action: action,
      targetUid: uid,
      targetEmail: email,
      targetVolo: voloId,
      role: 'admin',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      org: 'ORG_VOLO_PROD',
      source: 'create-admin-script'
    });
    console.log('  ✓  Audit log écrit');
  } catch (e) {
    // Best-effort
    console.warn('  ⚠  Audit log failed:', e.message);
  }
}

function printSuccess(uid) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  SUCCÈS — Compte admin créé');
  console.log('══════════════════════════════════════════');
  console.log('');
  console.log('  Firebase Auth UID:  ', uid);
  console.log('  Email:              ', email);
  console.log('  VOLO ID:            ', voloId);
  console.log('  Custom Claims:       { role: "admin" }');
  console.log('  Firestore Doc:       users/' + voloId);
  console.log('');
  console.log('  Prochaines étapes:');
  console.log('  1. Vérifier dans Firebase Console > Authentication');
  console.log('  2. Vérifier dans Firebase Console > Firestore > users/' + voloId);
  console.log('  3. Tester le login avec cet email dans l\'app');
  console.log('');
  process.exit(0);
}

createAdmin().catch(function(e) {
  console.error('\n  ERREUR FATALE:', e.message);
  process.exit(1);
});
