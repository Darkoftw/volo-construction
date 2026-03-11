#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Link Firebase Auth ↔ Firestore /users
//  Matches Auth accounts to Firestore docs by name/email
//  Updates Firestore docs with Auth UID + custom claims
//
//  USAGE:
//    node scripts/link-auth-users.js --dry-run   (preview)
//    node scripts/link-auth-users.js --real       (écriture)
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--real');
if (DRY_RUN) {
  console.log('\n  MODE: --dry-run (preview, aucune écriture)');
  console.log('  Ajouter --real pour écrire dans Firestore\n');
}

const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('  ERREUR: service-account-key.json introuvable');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});
const db = admin.firestore();
const auth = admin.auth();

// ── Manual mappings — Auth email → Firestore voloId ──
// For accounts that can't be matched by name automatically
const MANUAL_MAP = {
  'agendreau@voloconstruction.com': 'V0075',    // Alexandre Gendreau — CHEF
  'depot_antoine@hotmail.com': 'V0076',          // Antoine Dépôt — COORDO
  'jonathan.milone@gmail.com': 'V0205',          // Jonathan Milone — SAUVETEUR
};

async function main() {
  console.log('  ══════════════════════════════════════');
  console.log('   LINK AUTH ↔ FIRESTORE /users');
  console.log('  ══════════════════════════════════════\n');

  // 1. Load all Auth accounts
  var lr = await auth.listUsers(1000);
  var authUsers = lr.users;
  console.log('  Auth accounts: ' + authUsers.length);

  // 2. Load all Firestore /users
  var snap = await db.collection('users').get();
  var fsUsers = [];
  snap.forEach(function(doc) {
    var d = doc.data();
    fsUsers.push({
      docId: doc.id,
      name: d.name || '',
      volo: d.volo || d.voloId || doc.id,
      role: d.role || '',
      uid: d.uid || null,
      email: d.email || ''
    });
  });
  console.log('  Firestore /users: ' + fsUsers.length);
  console.log('');

  // 3. Match Auth → Firestore
  var linked = 0;
  var skipped = 0;
  var notFound = [];
  var alreadyLinked = 0;
  var actions = [];

  for (var i = 0; i < authUsers.length; i++) {
    var au = authUsers[i];
    var email = au.email || '';
    var displayName = au.displayName || '';
    var uid = au.uid;
    var claims = au.customClaims || {};

    // Skip test/generic accounts without displayName and no manual mapping
    if (!displayName && !MANUAL_MAP[email]) {
      skipped++;
      continue;
    }

    // Find matching Firestore doc
    var match = null;

    // Strategy 1: Manual mapping
    if (MANUAL_MAP[email]) {
      match = fsUsers.find(function(u) { return u.docId === MANUAL_MAP[email] || u.volo === MANUAL_MAP[email]; });
    }

    // Strategy 2: Match by exact name
    if (!match && displayName) {
      match = fsUsers.find(function(u) {
        return u.name.toLowerCase() === displayName.toLowerCase();
      });
    }

    // Strategy 3: Match by last name (for @voloconstruction.com)
    if (!match && displayName && email.endsWith('@voloconstruction.com')) {
      var nameParts = displayName.toLowerCase().split(' ');
      var lastName = nameParts[nameParts.length - 1];
      var candidates = fsUsers.filter(function(u) {
        return u.name.toLowerCase().includes(lastName);
      });
      if (candidates.length === 1) {
        match = candidates[0];
      }
    }

    if (!match) {
      notFound.push({ email: email, name: displayName, uid: uid.substring(0, 12) });
      continue;
    }

    // Check if already linked with same UID
    if (match.uid === uid) {
      alreadyLinked++;
      continue;
    }

    // Determine role claim to set
    var roleClaim = claims.role || null;
    if (!roleClaim) {
      // Infer from Firestore role
      var fsRole = match.role.toUpperCase();
      if (fsRole.includes('CHEF')) roleClaim = 'chef';
      else if (fsRole.includes('COORDO')) roleClaim = 'chef'; // coordo = chef-level access
      else if (fsRole.includes('SURVEILLANT')) roleClaim = 'surveillant';
      else roleClaim = 'sauveteur';
    }

    actions.push({
      email: email,
      name: displayName || match.name,
      uid: uid,
      voloId: match.docId,
      fsName: match.name,
      roleClaim: roleClaim,
      hadUid: match.uid
    });
  }

  // 4. Display plan
  console.log('  ── Plan ──');
  console.log('  À lier      : ' + actions.length);
  console.log('  Déjà liés   : ' + alreadyLinked);
  console.log('  Sans match  : ' + notFound.length);
  console.log('  Skippés     : ' + skipped + ' (sans displayName ni mapping)');
  console.log('');

  if (actions.length > 0) {
    console.log('  Actions :');
    actions.forEach(function(a) {
      var status = a.hadUid ? '⚠️  OVERWRITE uid' : '✚  NEW link';
      console.log('    ' + status + ' | ' + a.voloId.padEnd(10) + ' | ' + a.fsName.padEnd(28) + ' | ' + a.email.padEnd(35) + ' | role=' + a.roleClaim);
    });
    console.log('');
  }

  if (notFound.length > 0) {
    console.log('  Sans match Firestore :');
    notFound.forEach(function(n) {
      console.log('    ✗  ' + n.email.padEnd(35) + ' | ' + n.name.padEnd(20) + ' | uid=' + n.uid);
    });
    console.log('');
  }

  if (DRY_RUN) {
    console.log('  \x1b[33mDRY RUN — aucune écriture. Relancer avec --real\x1b[0m\n');
    process.exit(0);
  }

  // 5. Execute
  console.log('  ── Écriture ──');
  var errors = [];

  for (var j = 0; j < actions.length; j++) {
    var act = actions[j];
    try {
      // Update Firestore /users doc with Auth UID
      await db.collection('users').doc(act.voloId).update({
        uid: act.uid,
        authEmail: act.email,
        linkedAt: new Date().toISOString()
      });

      // Set custom claims if not already set
      try {
        await auth.setCustomUserClaims(act.uid, { role: act.roleClaim });
      } catch (e) {
        console.warn('    ⚠️  Claims error for ' + act.email + ': ' + e.message);
      }

      // Audit log
      await db.collection('audit_logs').add({
        action: 'AUTH_LINK',
        voloId: act.voloId,
        uid: act.uid,
        email: act.email,
        role: act.roleClaim,
        ts: new Date().toISOString(),
        by: 'scripts/link-auth-users.js'
      });

      linked++;
      console.log('    \x1b[32m✓\x1b[0m ' + act.voloId + ' ← ' + act.email + ' (role=' + act.roleClaim + ')');
    } catch (e) {
      errors.push({ voloId: act.voloId, error: e.message });
      console.log('    \x1b[31m✗\x1b[0m ' + act.voloId + ': ' + e.message);
    }
  }

  // 6. Report
  console.log('\n  ══════════════════════════════════════');
  console.log('   RAPPORT LINK AUTH');
  console.log('  ══════════════════════════════════════');
  console.log('  Liés          : \x1b[32m' + linked + '\x1b[0m');
  console.log('  Déjà liés     : ' + alreadyLinked);
  console.log('  Erreurs       : ' + (errors.length > 0 ? '\x1b[31m' + errors.length + '\x1b[0m' : '0'));
  console.log('  Sans match    : ' + notFound.length);
  console.log('  ══════════════════════════════════════\n');

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n  \x1b[31mERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
