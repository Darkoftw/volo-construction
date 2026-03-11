#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Nettoyage Firestore
//  Retire dateInspection / dateFinInspection des items MSQ, PAL, SAC
//
//  PREREQUIS:
//    service-account-key.json dans le dossier parent
//
//  USAGE:
//    node scripts/clean-inspection-fields.js
//    node scripts/clean-inspection-fields.js --dry-run   (preview sans modifier)
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');

if (!fs.existsSync(SA_PATH)) {
  console.error('\n\x1b[31m ERREUR: service-account-key.json introuvable\x1b[0m');
  console.error('  Voir set-claims.js pour les instructions.\n');
  process.exit(1);
}

const serviceAccount = require(SA_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'volo-sst-prod'
});

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PREFIXES = ['MSQ', 'PAL', 'SAC'];
const FIELDS_TO_REMOVE = ['dateInspection', 'dateFinInspection', 'inspDate', 'inspBy', 'expiry'];

async function cleanItems() {
  console.log(`\n\x1b[33m══ VOLO SST — Clean Inspection Fields ══\x1b[0m`);
  console.log(`Mode: ${DRY_RUN ? '\x1b[34mDRY RUN (preview)\x1b[0m' : '\x1b[31mLIVE (modifications)\x1b[0m'}\n`);

  const snap = await db.collection('items').get();
  console.log(`  Items en Firestore: ${snap.size}`);

  let cleaned = 0, skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const id = data.id || doc.id;
    const prefix = id.split('-')[0];

    if (!SKIP_PREFIXES.includes(prefix)) {
      skipped++;
      continue;
    }

    // Check if any inspection fields exist
    const updates = {};
    for (const field of FIELDS_TO_REMOVE) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
        updates[field] = admin.firestore.FieldValue.delete();
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    const removedFields = Object.keys(updates).join(', ');
    console.log(`  ${DRY_RUN ? '\x1b[34mWOULD CLEAN\x1b[0m' : '\x1b[32mCLEANED\x1b[0m'}  ${id} — remove: ${removedFields}`);

    if (!DRY_RUN) {
      await doc.ref.update(updates);
    }
    cleaned++;
  }

  console.log(`\n\x1b[33m══ RESULTATS ══\x1b[0m`);
  console.log(`  Items nettoyés: ${cleaned}`);
  console.log(`  Items ignorés:  ${skipped}`);
  if (DRY_RUN && cleaned > 0) {
    console.log(`\n  Relancer sans --dry-run pour appliquer les modifications.`);
  }
  console.log('');
}

(async () => {
  try {
    await cleanItems();
  } catch (e) {
    console.error('\x1b[31mErreur fatale:\x1b[0m', e.message);
  }
  process.exit(0);
})();
