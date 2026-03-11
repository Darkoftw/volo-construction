#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Migrate PERSONNEL → Firestore /users
//  Lit data.js et écrit chaque membre dans /users/{voloId}
//
//  USAGE:
//    node scripts/migrate-personnel.js --dry-run   (preview)
//    node scripts/migrate-personnel.js --real       (écriture)
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ── Args ──
const DRY_RUN = !process.argv.includes('--real');
if (DRY_RUN) {
  console.log('\n  MODE: --dry-run (preview, aucune écriture)');
  console.log('  Ajouter --real pour écrire dans Firestore\n');
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

// ── Load PERSONNEL from data.js ──
function loadPersonnel() {
  const filePath = path.join(__dirname, '..', 'data.js');
  const code = fs.readFileSync(filePath, 'utf-8');
  const converted = code.replace(/^(let|const)\s+/gm, 'var ');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(converted, sandbox);
  if (!sandbox.PERSONNEL || !Array.isArray(sandbox.PERSONNEL)) {
    console.error('\x1b[31m  ERREUR: PERSONNEL non trouvé dans data.js\x1b[0m');
    process.exit(1);
  }
  return sandbox.PERSONNEL;
}

// ── Progress bar ──
function progressBar(current, total, errors) {
  const width = 40;
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  const errStr = errors > 0 ? ` \x1b[31m${errors} err\x1b[0m` : '';
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total})${errStr}`);
}

// ── Main ──
async function migrate() {
  const personnel = loadPersonnel();
  console.log(`  Source: data.js — ${personnel.length} membres`);
  console.log(`  Destination: Firestore /users/{voloId}`);
  console.log('');

  if (DRY_RUN) {
    console.log('  Apercu (10 premiers) :');
    personnel.slice(0, 10).forEach(function(p) {
      console.log(`    ${p.volo} | ${p.name.padEnd(28)} | ${p.role.padEnd(16)} | ${p.region}`);
    });
    if (personnel.length > 10) {
      console.log(`    ... et ${personnel.length - 10} autres`);
    }
    console.log('\n  \x1b[33mDRY RUN — aucune écriture. Relancer avec --real\x1b[0m\n');

    // Stats
    var roles = {};
    var regions = {};
    personnel.forEach(function(p) {
      roles[p.role] = (roles[p.role] || 0) + 1;
      regions[p.region] = (regions[p.region] || 0) + 1;
    });
    console.log('  Roles :');
    Object.keys(roles).sort().forEach(function(r) { console.log('    ' + r.padEnd(20) + roles[r]); });
    console.log('\n  Regions :');
    Object.keys(regions).sort().forEach(function(r) { console.log('    ' + r.padEnd(24) + regions[r]); });
    console.log('');
    process.exit(0);
  }

  // ── Real write ──
  var written = 0;
  var errors = 0;
  var errorList = [];
  var BATCH_SIZE = 400; // Firestore limit 500 ops per batch

  for (var i = 0; i < personnel.length; i += BATCH_SIZE) {
    var chunk = personnel.slice(i, i + BATCH_SIZE);
    var batch = db.batch();

    chunk.forEach(function(p) {
      var docId = p.volo; // e.g. "V0205"
      var ref = db.collection('users').doc(docId);
      batch.set(ref, {
        id: p.id || '',
        volo: p.volo || '',
        voloId: p.volo || '',
        name: p.name || '',
        role: p.role || 'SAUVETEUR',
        type: p.type || 'SAUVETEUR',
        region: p.region || '',
        ville: p.ville || '',
        email: '',          // PII retiré — Loi 25
        active: true,
        org: 'ORG_VOLO_PROD',
        migratedAt: new Date().toISOString()
      }, { merge: true });  // merge: true pour ne pas écraser les champs existants (uid, certs, etc.)
    });

    try {
      await batch.commit();
      written += chunk.length;
    } catch (e) {
      errors += chunk.length;
      errorList.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: e.message });
    }
    progressBar(i + chunk.length, personnel.length, errors);
  }

  // ── Rapport final ──
  console.log('\n');
  console.log('  ══════════════════════════════════');
  console.log('   RAPPORT MIGRATION PERSONNEL');
  console.log('  ══════════════════════════════════');
  console.log('  Total membres : ' + personnel.length);
  console.log('  Ecrits        : \x1b[32m' + written + '\x1b[0m');
  if (errors > 0) {
    console.log('  Erreurs       : \x1b[31m' + errors + '\x1b[0m');
    errorList.forEach(function(e) {
      console.log('    Batch ' + e.batch + ': ' + e.error);
    });
  } else {
    console.log('  Erreurs       : 0');
  }
  console.log('  Collection    : /users');
  console.log('  Merge mode    : true (champs existants preserves)');
  console.log('  ══════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

migrate().catch(function(err) {
  console.error('\n\x1b[31m  ERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
