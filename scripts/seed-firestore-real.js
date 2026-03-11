#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Seed Firestore avec données réelles
//  Pousse les 823 items, 80 caisses, personnel, config vers Firestore
//
//  PREREQUIS:
//    service-account-key.json dans le dossier parent
//
//  USAGE:
//    node scripts/seed-firestore-real.js
//    node scripts/seed-firestore-real.js --dry-run     (preview)
//    node scripts/seed-firestore-real.js --items-only  (items seulement)
//    node scripts/seed-firestore-real.js --clear-first (efface avant d'écrire)
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// --- Firebase Admin ---
const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('\n\x1b[31m ERREUR: service-account-key.json introuvable\x1b[0m');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SA_PATH)),
  projectId: 'volo-sst-prod'
});

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const ITEMS_ONLY = process.argv.includes('--items-only');
const CLEAR_FIRST = process.argv.includes('--clear-first');
const ORG = 'ORG_VOLO_PROD';

// --- Load data from JS files ---
function loadDataFile(filename) {
  const filePath = path.join(__dirname, '..', filename);
  const code = fs.readFileSync(filePath, 'utf-8');
  // Convert let/const to var so vm sandbox captures them as globals
  const converted = code.replace(/^(let|const)\s+/gm, 'var ');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(converted, sandbox);
  return sandbox;
}

// --- Batch write helper (Firestore max 500 per batch) ---
async function batchWrite(collection, docs, idField) {
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      const docId = idField ? doc[idField] : undefined;
      const ref = docId ? db.collection(collection).doc(docId) : db.collection(collection).doc();
      batch.set(ref, doc, { merge: true });
    }
    if (!DRY_RUN) {
      await batch.commit();
    }
    written += chunk.length;
    process.stdout.write(`\r  ${collection}: ${written}/${docs.length}`);
  }
  console.log(` ✅`);
  return written;
}

// --- Clear collection ---
async function clearCollection(name) {
  if (DRY_RUN) { console.log(`  \x1b[34mWOULD CLEAR\x1b[0m ${name}`); return; }
  const snap = await db.collection(name).get();
  if (!snap.size) return;
  const BATCH_SIZE = 400;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  \x1b[33mCLEARED\x1b[0m ${name}: ${snap.size} docs`);
}

// ══════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════
async function main() {
  console.log(`\n\x1b[33m══ VOLO SST — Seed Firestore (données réelles) ══\x1b[0m`);
  console.log(`Mode: ${DRY_RUN ? '\x1b[34mDRY RUN\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}`);
  console.log(`Options: ${ITEMS_ONLY ? 'items-only' : 'full'} ${CLEAR_FIRST ? '+ clear-first' : ''}\n`);

  // Load data
  console.log('Chargement des données...');
  const inv = loadDataFile('data-inventory.js');
  const ITEMS = inv.ITEMS || [];
  const CAISSES = inv.CAISSES || [];
  const DEPOTS = inv.DEPOTS || [];
  const DESTINATIONS = inv.DESTINATIONS || [];
  const REMORQUES = inv.REMORQUES || [];
  const CERTS_LIST = inv.CERTS_LIST || [];
  const BAREMES = inv.BAREMES || {};

  console.log(`  ITEMS: ${ITEMS.length}`);
  console.log(`  CAISSES: ${CAISSES.length}`);
  console.log(`  DEPOTS: ${DEPOTS.length}`);
  console.log(`  DESTINATIONS: ${DESTINATIONS.length}`);
  console.log(`  REMORQUES: ${REMORQUES.length}\n`);

  // Load personnel (from data.js — has PII but needed for Firestore)
  let PERSONNEL = [];
  try {
    const dataJs = loadDataFile('data.js');
    PERSONNEL = dataJs.PERSONNEL || [];
    console.log(`  PERSONNEL: ${PERSONNEL.length}`);
  } catch (e) {
    console.warn('  PERSONNEL: skip (data.js not loadable)');
  }

  // Clear if requested
  if (CLEAR_FIRST) {
    console.log('\nNettoyage collections...');
    await clearCollection('items');
    if (!ITEMS_ONLY) {
      await clearCollection('caisses');
      await clearCollection('personnel');
      await clearCollection('config');
    }
  }

  // --- ITEMS ---
  console.log('\nSeed items...');
  const itemDocs = ITEMS.map(item => ({
    ...item,
    org: ORG,
    status: item.status || 'disponible',
    seedAt: new Date().toISOString()
  }));
  await batchWrite('items', itemDocs, 'id');

  if (ITEMS_ONLY) {
    console.log('\n\x1b[33m══ DONE (items-only) ══\x1b[0m\n');
    return;
  }

  // --- CAISSES ---
  console.log('Seed caisses...');
  const caisseDocs = CAISSES.map(c => ({
    ...c,
    org: ORG,
    seedAt: new Date().toISOString()
  }));
  await batchWrite('caisses', caisseDocs, 'id');

  // --- PERSONNEL (sans emails — Loi 25) ---
  if (PERSONNEL.length) {
    console.log('Seed personnel...');
    const personnelDocs = PERSONNEL.map(p => ({
      id: p.id,
      volo: p.volo,
      name: p.name,
      role: p.role,
      type: p.type,
      region: p.region,
      ville: p.ville,
      // PAS d'email — Loi 25
      org: ORG,
      seedAt: new Date().toISOString()
    }));
    await batchWrite('personnel', personnelDocs, 'id');
  }

  // --- CONFIG ---
  console.log('Seed config...');
  const configDoc = {
    org: ORG,
    depots: DEPOTS,
    destinations: DESTINATIONS,
    remorques: REMORQUES,
    certs_list: CERTS_LIST,
    baremes: BAREMES,
    version: 'V10.5',
    seedAt: new Date().toISOString()
  };
  if (!DRY_RUN) {
    await db.collection('config').doc('app').set(configDoc, { merge: true });
  }
  console.log('  config/app ✅');

  // --- ORGANIZATION ---
  console.log('Seed organization...');
  const orgDoc = {
    id: ORG,
    name: 'VOLO Construction SST',
    team: 'Golden Eagles',
    region: 'Estrie',
    itemCount: ITEMS.length,
    personnelCount: PERSONNEL.length,
    caisseCount: CAISSES.length,
    seedAt: new Date().toISOString()
  };
  if (!DRY_RUN) {
    await db.collection('organizations').doc(ORG).set(orgDoc, { merge: true });
  }
  console.log('  organizations/' + ORG + ' ✅');

  // --- RÉSUMÉ ---
  console.log(`\n\x1b[33m══ RÉSUMÉ ══\x1b[0m`);
  console.log(`  Items:      ${ITEMS.length}`);
  console.log(`  Caisses:    ${CAISSES.length}`);
  console.log(`  Personnel:  ${PERSONNEL.length}`);
  console.log(`  Config:     1 doc`);
  console.log(`  Org:        1 doc`);
  console.log(`  Total:      ${ITEMS.length + CAISSES.length + PERSONNEL.length + 2} documents`);
  if (DRY_RUN) {
    console.log(`\n  \x1b[34mRelancer sans --dry-run pour appliquer.\x1b[0m`);
  }
  console.log('');
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error('\x1b[31mErreur fatale:\x1b[0m', e.message);
    console.error(e.stack);
  }
  process.exit(0);
})();
