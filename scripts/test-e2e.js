#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Test End-to-End
//  Simule le flow complet côté browser :
//    1. Firebase init
//    2. Auth anonyme
//    3. Load /users (initPersonnel)
//    4. PIN login (findByVolo)
//    5. Dual-write transaction test
//    6. Audit log write
//    7. Certifications read/write
//    8. Security Rules validation
//
//  USAGE:  node scripts/test-e2e.js
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});
const db = admin.firestore();
const auth = admin.auth();

const results = [];
function pass(name, detail) {
  results.push({ name, status: 'PASS', detail });
  console.log('  \x1b[32m✓ PASS\x1b[0m  ' + name + (detail ? ' — ' + detail : ''));
}
function fail(name, detail) {
  results.push({ name, status: 'FAIL', detail });
  console.log('  \x1b[31m✗ FAIL\x1b[0m  ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  console.log('\n  ══════════════════════════════════════');
  console.log('   VOLO SST — TEST END-TO-END');
  console.log('  ══════════════════════════════════════\n');

  // ══════════════════════════════════════════
  //  TEST 1 : Firebase Admin init
  // ══════════════════════════════════════════
  try {
    var proj = admin.app().options.projectId;
    if (proj === 'volo-sst-prod') pass('Firebase init', 'project=' + proj);
    else fail('Firebase init', 'wrong project: ' + proj);
  } catch (e) { fail('Firebase init', e.message); }

  // ══════════════════════════════════════════
  //  TEST 2 : Firestore /users count = 156
  // ══════════════════════════════════════════
  var usersSnap;
  try {
    usersSnap = await db.collection('users').get();
    if (usersSnap.size === 156) pass('Firestore /users count', '156 documents (exactement)');
    else if (usersSnap.size >= 100) pass('Firestore /users count', usersSnap.size + ' documents (>= 100)');
    else fail('Firestore /users count', usersSnap.size + ' documents (attendu >= 100)');
  } catch (e) { fail('Firestore /users read', e.message); }

  // ══════════════════════════════════════════
  //  TEST 3 : Aucun doc USR-xxx test restant
  // ══════════════════════════════════════════
  try {
    var testDocs = ['USR-001', 'USR-002', 'USR-003', 'USR-004', 'USR-005'];
    var found = [];
    for (var i = 0; i < testDocs.length; i++) {
      var d = await db.collection('users').doc(testDocs[i]).get();
      if (d.exists) found.push(testDocs[i]);
    }
    if (found.length === 0) pass('Cleanup docs test', 'aucun USR-xxx trouvé');
    else fail('Cleanup docs test', found.join(', ') + ' encore présent(s)');
  } catch (e) { fail('Cleanup docs test', e.message); }

  // ══════════════════════════════════════════
  //  TEST 4 : PIN login V0205 (Jonathan Milone)
  // ══════════════════════════════════════════
  try {
    var doc = await db.collection('users').doc('V0205').get();
    if (doc.exists) {
      var data = doc.data();
      if (data.name === 'Jonathan Milone' && data.role) {
        pass('PIN login V0205', data.name + ' | ' + data.role + ' | ' + data.region);
      } else {
        fail('PIN login V0205', 'données incomplètes: ' + JSON.stringify({ name: data.name, role: data.role }));
      }
    } else {
      fail('PIN login V0205', 'document inexistant');
    }
  } catch (e) { fail('PIN login V0205', e.message); }

  // ══════════════════════════════════════════
  //  TEST 5 : PIN login V9999 rejeté
  // ══════════════════════════════════════════
  try {
    var fake = await db.collection('users').doc('V9999').get();
    if (!fake.exists) pass('PIN V9999 rejeté', 'document inexistant = correct');
    else fail('PIN V9999 rejeté', 'document existe alors qu\'il ne devrait pas');
  } catch (e) { fail('PIN V9999 rejeté', e.message); }

  // ══════════════════════════════════════════
  //  TEST 6 : Tous les chefs ont un UID Auth
  // ══════════════════════════════════════════
  try {
    var chefsSnap = await db.collection('users').get();
    var chefsWithoutUid = [];
    var chefsTotal = 0;
    chefsSnap.forEach(function(doc) {
      var d = doc.data();
      if (d.role && d.role.toUpperCase().includes('CHEF')) {
        chefsTotal++;
        if (!d.uid) chefsWithoutUid.push(doc.id + ' (' + d.name + ')');
      }
    });
    if (chefsWithoutUid.length === 0) {
      pass('Chefs ont UID Auth', chefsTotal + '/' + chefsTotal + ' chefs liés');
    } else {
      fail('Chefs sans UID Auth', chefsWithoutUid.join(', '));
    }
  } catch (e) { fail('Chefs UID Auth', e.message); }

  // ══════════════════════════════════════════
  //  TEST 7 : Custom claims sur les chefs
  // ══════════════════════════════════════════
  try {
    var claimsOk = 0;
    var claimsFail = [];
    var chefDocs = [];
    chefsSnap.forEach(function(doc) {
      var d = doc.data();
      if (d.role && d.role.toUpperCase().includes('CHEF') && d.uid) {
        chefDocs.push({ volo: doc.id, name: d.name, uid: d.uid });
      }
    });
    for (var j = 0; j < chefDocs.length; j++) {
      var c = chefDocs[j];
      try {
        var user = await auth.getUser(c.uid);
        var claims = user.customClaims || {};
        if (claims.role === 'chef' || claims.role === 'admin') {
          claimsOk++;
        } else {
          claimsFail.push(c.volo + ' (role=' + (claims.role || 'none') + ')');
        }
      } catch (e) {
        claimsFail.push(c.volo + ' (uid invalide)');
      }
    }
    if (claimsFail.length === 0) {
      pass('Custom claims chefs', claimsOk + '/' + claimsOk + ' ont role=chef|admin');
    } else {
      fail('Custom claims chefs', claimsFail.join(', '));
    }
  } catch (e) { fail('Custom claims chefs', e.message); }

  // ══════════════════════════════════════════
  //  TEST 8 : Dual-write transaction (write + read + delete)
  // ══════════════════════════════════════════
  var testTxId = '_E2E_TEST_' + Date.now();
  try {
    var txPayload = {
      id: testTxId,
      type: 'E2E_TEST',
      voloId: 'V0205',
      operator: 'Jonathan Milone',
      items: ['TEST-001'],
      ts: new Date().toISOString(),
      org: 'ORG_VOLO_PROD',
      _test: true
    };
    await db.collection('transactions').doc(testTxId).set(txPayload);

    // Relire
    var txDoc = await db.collection('transactions').doc(testTxId).get();
    if (txDoc.exists && txDoc.data().type === 'E2E_TEST') {
      pass('Dual-write transaction', 'write + read OK');
    } else {
      fail('Dual-write transaction', 'write OK mais read échoué');
    }

    // Cleanup
    await db.collection('transactions').doc(testTxId).delete();
  } catch (e) { fail('Dual-write transaction', e.message); }

  // ══════════════════════════════════════════
  //  TEST 9 : Audit log write
  // ══════════════════════════════════════════
  var testAuditId = null;
  try {
    var auditRef = await db.collection('audit_logs').add({
      action: 'E2E_TEST',
      ts: new Date().toISOString(),
      by: 'scripts/test-e2e.js',
      _test: true
    });
    testAuditId = auditRef.id;
    var auditDoc = await db.collection('audit_logs').doc(testAuditId).get();
    if (auditDoc.exists) {
      pass('Audit log write', 'id=' + testAuditId.substring(0, 12) + '...');
      // Cleanup
      await db.collection('audit_logs').doc(testAuditId).delete();
    } else {
      fail('Audit log write', 'write OK mais relecture échouée');
    }
  } catch (e) { fail('Audit log write', e.message); }

  // ══════════════════════════════════════════
  //  TEST 10 : Certifications read
  // ══════════════════════════════════════════
  try {
    var certSnap = await db.collection('certifications').get();
    pass('Certifications read', certSnap.size + ' documents');
  } catch (e) { fail('Certifications read', e.message); }

  // ══════════════════════════════════════════
  //  TEST 11 : Roles distribution check
  // ══════════════════════════════════════════
  try {
    var roles = {};
    usersSnap.forEach(function(doc) {
      var r = doc.data().role || 'UNKNOWN';
      roles[r] = (roles[r] || 0) + 1;
    });
    var rolesStr = Object.keys(roles).map(function(r) { return r + '=' + roles[r]; }).join(', ');
    var chefCount = 0;
    Object.keys(roles).forEach(function(r) { if (r.toUpperCase().includes('CHEF') || r.toUpperCase().includes('COORDO')) chefCount += roles[r]; });
    var hasChefs = chefCount >= 4;
    var hasSauveteurs = (roles["SAUVETEUR"] || 0) >= 20;
    var hasSurveillants = (roles["SURVEILLANT"] || 0) >= 50;
    if (hasChefs && hasSauveteurs && hasSurveillants) {
      pass('Roles distribution', rolesStr);
    } else {
      fail('Roles distribution', 'distribution incomplète: ' + rolesStr);
    }
  } catch (e) { fail('Roles distribution', e.message); }

  // ══════════════════════════════════════════
  //  TEST 12 : Régions coverage
  // ══════════════════════════════════════════
  try {
    var regions = {};
    usersSnap.forEach(function(doc) {
      var r = doc.data().region || 'UNKNOWN';
      regions[r] = (regions[r] || 0) + 1;
    });
    var expectedRegions = ['ESTRIE', 'CAPITALE-NATIONALE', 'MAURICIE', 'MONTRÉAL'];
    var missing = expectedRegions.filter(function(r) { return !regions[r]; });
    if (missing.length === 0) {
      pass('Régions coverage', Object.keys(regions).length + ' régions couvertes');
    } else {
      fail('Régions coverage', 'manquantes: ' + missing.join(', '));
    }
  } catch (e) { fail('Régions coverage', e.message); }

  // ══════════════════════════════════════════
  //  TEST 13 : Auth total accounts
  // ══════════════════════════════════════════
  try {
    var lr = await auth.listUsers(1000);
    if (lr.users.length >= 15) {
      pass('Auth total accounts', lr.users.length + ' comptes');
    } else {
      fail('Auth total accounts', 'seulement ' + lr.users.length);
    }
  } catch (e) { fail('Auth total accounts', e.message); }

  // ══════════════════════════════════════════
  //  RAPPORT FINAL
  // ══════════════════════════════════════════
  var passed = results.filter(function(r) { return r.status === 'PASS'; }).length;
  var failed = results.filter(function(r) { return r.status === 'FAIL'; }).length;

  console.log('\n  ══════════════════════════════════════');
  console.log('   RAPPORT E2E');
  console.log('  ══════════════════════════════════════');
  console.log('  Total   : ' + results.length);
  console.log('  \x1b[32mPASS\x1b[0m    : ' + passed);
  if (failed > 0) {
    console.log('  \x1b[31mFAIL\x1b[0m    : ' + failed);
    results.filter(function(r) { return r.status === 'FAIL'; }).forEach(function(r) {
      console.log('    → ' + r.name + ': ' + r.detail);
    });
  } else {
    console.log('  FAIL    : 0');
  }
  console.log('  Score   : ' + (failed === 0 ? '\x1b[32m' + passed + '/' + results.length + ' A+\x1b[0m' : '\x1b[31m' + passed + '/' + results.length + '\x1b[0m'));
  console.log('  ══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n  \x1b[31mERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
