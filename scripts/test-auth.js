#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Test Auth + Firestore /users + loginPin
//
//  USAGE:  node scripts/test-auth.js
//
//  Tests :
//    1. Firebase Admin init
//    2. Lister les comptes Auth (@voloconstruction.com)
//    3. Lire Firestore /users (count + sample)
//    4. Simuler loginPin("0205") → lookup /users/V0205
//    5. Cross-check : Auth UIDs dans /users
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ── Config ──
const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
const PROJECT_ID = 'volo-sst-prod';
const TEST_PIN = '0205';       // Jonathan Milone — V0205
const TEST_VOLO_ID = 'V0205';
const DOMAIN = '@voloconstruction.com';

// ── Results tracker ──
const results = [];
function pass(name, detail) {
  results.push({ name, status: 'PASS', detail });
  console.log('  \x1b[32m✓ PASS\x1b[0m  ' + name + (detail ? ' — ' + detail : ''));
}
function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
  console.log('  \x1b[31m✗ FAIL\x1b[0m  ' + name + (detail ? ' — ' + detail : ''));
}

// ══════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════
async function main() {
  console.log('\n  ══════════════════════════════════════');
  console.log('   VOLO SST — TEST AUTH & FIRESTORE');
  console.log('  ══════════════════════════════════════\n');

  // ── Test 1 : Firebase Admin init ──
  if (!fs.existsSync(SA_PATH)) {
    fail('Firebase Admin init', 'service-account-key.json introuvable');
    printReport();
    process.exit(1);
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(SA_PATH)),
      projectId: PROJECT_ID
    });
    pass('Firebase Admin init', 'project=' + PROJECT_ID);
  } catch (e) {
    fail('Firebase Admin init', e.message);
    printReport();
    process.exit(1);
  }

  const db = admin.firestore();
  const auth = admin.auth();

  // ── Test 2 : Lister comptes Auth ──
  try {
    var listResult = await auth.listUsers(1000);
    var allUsers = listResult.users;
    var voloUsers = allUsers.filter(function(u) {
      return u.email && u.email.endsWith(DOMAIN);
    });
    var otherUsers = allUsers.filter(function(u) {
      return !u.email || !u.email.endsWith(DOMAIN);
    });

    if (allUsers.length > 0) {
      pass('Auth — comptes totaux', allUsers.length + ' comptes');
    } else {
      fail('Auth — comptes totaux', '0 comptes trouvés');
    }

    if (voloUsers.length > 0) {
      pass('Auth — comptes ' + DOMAIN, voloUsers.length + ' comptes');
      // Afficher les 5 premiers
      console.log('');
      console.log('    Échantillon ' + DOMAIN + ' (' + Math.min(5, voloUsers.length) + '/' + voloUsers.length + ') :');
      voloUsers.slice(0, 5).forEach(function(u) {
        console.log('      ' + (u.email || '').padEnd(40) + ' uid=' + u.uid.substring(0, 12) + '...');
      });
      if (otherUsers.length > 0) {
        console.log('    + ' + otherUsers.length + ' autres comptes (non ' + DOMAIN + ')');
      }
      console.log('');
    } else {
      fail('Auth — comptes ' + DOMAIN, '0 comptes ' + DOMAIN + ' (total: ' + allUsers.length + ')');
    }
  } catch (e) {
    fail('Auth — listUsers', e.message);
  }

  // ── Test 3 : Firestore /users count + sample ──
  try {
    var usersSnap = await db.collection('users').get();
    var usersCount = usersSnap.size;

    if (usersCount >= 100) {
      pass('Firestore /users count >= 100', usersCount + ' documents');
    } else if (usersCount > 0) {
      fail('Firestore /users count >= 100', 'seulement ' + usersCount + ' documents (besoin >= 100)');
    } else {
      fail('Firestore /users', 'collection vide');
    }

    if (usersCount > 0) {
      // Stats par rôle
      var roles = {};
      var regions = {};
      usersSnap.forEach(function(doc) {
        var d = doc.data();
        var role = d.role || 'UNKNOWN';
        var region = d.region || 'UNKNOWN';
        roles[role] = (roles[role] || 0) + 1;
        regions[region] = (regions[region] || 0) + 1;
      });
      console.log('    Rôles : ' + Object.keys(roles).map(function(r) { return r + '=' + roles[r]; }).join(', '));
      console.log('    Régions : ' + Object.keys(regions).map(function(r) { return r + '=' + regions[r]; }).join(', '));
      console.log('');
    }
  } catch (e) {
    fail('Firestore /users', e.message);
  }

  // ── Test 4 : loginPin("0205") → /users/V0205 ──
  try {
    var doc = await db.collection('users').doc(TEST_VOLO_ID).get();
    if (doc.exists) {
      var data = doc.data();
      var profile = {
        id: data.id || doc.id,
        volo: data.volo || data.voloId || doc.id,
        name: data.name || '',
        role: data.role || 'SAUVETEUR',
        type: data.type || data.role || 'SAUVETEUR',
        region: data.region || '',
        ville: data.ville || ''
      };
      if (profile.name && profile.volo === TEST_VOLO_ID) {
        pass('loginPin("' + TEST_PIN + '") → /users/' + TEST_VOLO_ID,
          profile.name + ' | ' + profile.role + ' | ' + profile.region);
      } else {
        fail('loginPin("' + TEST_PIN + '") — données incomplètes',
          JSON.stringify(profile));
      }
    } else {
      fail('loginPin("' + TEST_PIN + '")', '/users/' + TEST_VOLO_ID + ' document inexistant');
    }
  } catch (e) {
    fail('loginPin("' + TEST_PIN + '")', e.message);
  }

  // ── Test 5 : Cross-check Auth UIDs dans /users ──
  try {
    var usersWithUid = [];
    var usersWithoutUid = [];
    var usersSnap2 = await db.collection('users').get();
    usersSnap2.forEach(function(doc) {
      var d = doc.data();
      if (d.uid) {
        usersWithUid.push({ volo: doc.id, uid: d.uid, name: d.name });
      } else {
        usersWithoutUid.push(doc.id);
      }
    });

    if (usersWithUid.length > 0) {
      // Vérifier que ces UIDs existent dans Auth
      var validUids = 0;
      var invalidUids = [];
      for (var i = 0; i < usersWithUid.length; i++) {
        try {
          await auth.getUser(usersWithUid[i].uid);
          validUids++;
        } catch (e) {
          invalidUids.push(usersWithUid[i].volo);
        }
      }
      if (invalidUids.length === 0) {
        pass('Cross-check Auth↔Firestore', usersWithUid.length + '/' + usersWithUid.length + ' UIDs valides');
      } else {
        fail('Cross-check Auth↔Firestore', invalidUids.length + ' UIDs invalides: ' + invalidUids.join(', '));
      }
      console.log('    Avec UID Auth : ' + usersWithUid.length);
      console.log('    Sans UID Auth : ' + usersWithoutUid.length + ' (migrés depuis data.js, pas encore de compte Auth)');
      console.log('');
    } else {
      pass('Cross-check Auth↔Firestore', 'Aucun user avec UID — normal si Auth pas encore lié');
    }
  } catch (e) {
    fail('Cross-check Auth↔Firestore', e.message);
  }

  // ── Test 6 : Lookup par PIN aléatoire (non existant) ──
  try {
    var fakeDoc = await db.collection('users').doc('V9999').get();
    if (!fakeDoc.exists) {
      pass('loginPin("9999") rejeté', '/users/V9999 inexistant → PIN invalide correct');
    } else {
      fail('loginPin("9999")', '/users/V9999 existe alors qu\'il ne devrait pas');
    }
  } catch (e) {
    fail('loginPin("9999") rejection', e.message);
  }

  printReport();
}

function printReport() {
  var passed = results.filter(function(r) { return r.status === 'PASS'; }).length;
  var failed = results.filter(function(r) { return r.status === 'FAIL'; }).length;
  var total = results.length;

  console.log('  ══════════════════════════════════════');
  console.log('   RAPPORT TEST AUTH');
  console.log('  ══════════════════════════════════════');
  console.log('  Total  : ' + total);
  console.log('  \x1b[32mPASS\x1b[0m   : ' + passed);
  if (failed > 0) {
    console.log('  \x1b[31mFAIL\x1b[0m   : ' + failed);
    results.filter(function(r) { return r.status === 'FAIL'; }).forEach(function(r) {
      console.log('    → ' + r.name + ': ' + r.detail);
    });
  } else {
    console.log('  FAIL   : 0');
  }
  console.log('  Résultat: ' + (failed === 0 ? '\x1b[32m✓ ALL PASS\x1b[0m' : '\x1b[31m✗ ' + failed + ' ÉCHEC(S)\x1b[0m'));
  console.log('  ══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n  \x1b[31mERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
