#!/usr/bin/env node
// ══════════════════════════════════════════
//  VOLO SST — Migrate Items + Caisses → Firestore
//
//  Pousse les 823 items et 80 caisses de data.js
//  vers Firestore collections items/{id} et caisses/{id}
//
//  PREREQUIS:
//    service-account-key.json dans volo-deploy/
//
//  USAGE:
//    node scripts/migrate-items.js --dry-run   (preview)
//    node scripts/migrate-items.js --real       (écriture)
//
//  APRÈS EXÉCUTION:
//    - 823 docs dans Firestore /items/{itemId}
//    - 80 docs dans Firestore /caisses/{caisseId}
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

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

// ── Load data.js via vm sandbox ──
const vm = require('vm');
const dataPath = path.join(__dirname, '..', 'data.js');
if (!fs.existsSync(dataPath)) {
  console.error('\x1b[31m  ERREUR: data.js introuvable\x1b[0m');
  process.exit(1);
}

// Replace const/let with var so they become sandbox properties
var dataContent = fs.readFileSync(dataPath, 'utf-8');
dataContent = dataContent.replace(/\bconst\s+/g, 'var ').replace(/\blet\s+/g, 'var ');
var sandbox = { Map: Map };
try {
  vm.runInNewContext(dataContent, sandbox);
} catch (e) {
  console.error('\x1b[31m  ERREUR parsing data.js:\x1b[0m', e.message);
  process.exit(1);
}

var ITEMS = sandbox.ITEMS;
var CAISSES = sandbox.CAISSES;

if (!ITEMS || !CAISSES) {
  console.error('\x1b[31m  ERREUR: ITEMS ou CAISSES non trouvés dans data.js\x1b[0m');
  process.exit(1);
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
  console.log('   VOLO SST — Migrate Items + Caisses');
  console.log('  ══════════════════════════════════════════\n');

  console.log('  [1/4] Données lues depuis data.js :');
  console.log('  ✓  ' + ITEMS.length + ' items');
  console.log('  ✓  ' + CAISSES.length + ' caisses\n');

  // Stats par catégorie
  var catStats = {};
  ITEMS.forEach(function(item) {
    var cat = item.cat || '(sans catégorie)';
    catStats[cat] = (catStats[cat] || 0) + 1;
  });
  console.log('  Items par catégorie (top 10) :');
  var catEntries = Object.entries(catStats).sort(function(a, b) { return b[1] - a[1]; });
  catEntries.slice(0, 10).forEach(function(e) {
    console.log('    ' + e[0].padEnd(28) + e[1]);
  });
  if (catEntries.length > 10) {
    console.log('    ... et ' + (catEntries.length - 10) + ' autres catégories');
  }

  // Stats caisses par type
  var typeStats = {};
  CAISSES.forEach(function(c) {
    var t = c.type || 'autre';
    typeStats[t] = (typeStats[t] || 0) + 1;
  });
  console.log('\n  Caisses par type :');
  Object.entries(typeStats).sort().forEach(function(e) {
    console.log('    ' + e[0].padEnd(16) + e[1]);
  });

  // 2. Vérifier Firestore existants
  console.log('\n  [2/4] Vérification Firestore existants...');
  var existingItems = await db.collection('items').get();
  var existingCaisses = await db.collection('caisses').get();
  console.log('  ✓  ' + existingItems.size + ' items déjà dans Firestore');
  console.log('  ✓  ' + existingCaisses.size + ' caisses déjà dans Firestore');

  var existingItemIds = new Set();
  existingItems.forEach(function(doc) { existingItemIds.add(doc.id); });
  var existingCaisseIds = new Set();
  existingCaisses.forEach(function(doc) { existingCaisseIds.add(doc.id); });

  var newItems = ITEMS.filter(function(it) { return !existingItemIds.has(it.id); });
  var updateItems = ITEMS.filter(function(it) { return existingItemIds.has(it.id); });
  var newCaisses = CAISSES.filter(function(c) { return !existingCaisseIds.has(c.id); });
  var updateCaisses = CAISSES.filter(function(c) { return existingCaisseIds.has(c.id); });

  console.log('\n  Plan :');
  console.log('    Items   — ' + newItems.length + ' nouveaux, ' + updateItems.length + ' à mettre à jour');
  console.log('    Caisses — ' + newCaisses.length + ' nouvelles, ' + updateCaisses.length + ' à mettre à jour');

  // Preview
  console.log('\n  Aperçu items (5 premiers) :');
  ITEMS.slice(0, 5).forEach(function(it) {
    console.log('    ' + it.id.padEnd(12) + (it.name || '').substring(0, 30).padEnd(32) + (it.cat || '').substring(0, 20));
  });

  console.log('\n  Aperçu caisses (5 premières) :');
  CAISSES.slice(0, 5).forEach(function(c) {
    console.log('    ' + c.id.padEnd(12) + (c.nom || c.name || '').padEnd(28) + c.count + ' items');
  });

  if (DRY_RUN) {
    console.log('\n  ──────────────────────────────');
    console.log('  \x1b[33mDRY RUN — aucune écriture.\x1b[0m');
    console.log('  ' + ITEMS.length + ' items + ' + CAISSES.length + ' caisses à écrire.');
    console.log('  Relancer avec --real');
    console.log('  ──────────────────────────────\n');
    process.exit(0);
  }

  // 3. Écrire les items (batched writes, 500 max par batch)
  console.log('\n  [3/4] Écriture items dans Firestore...\n');
  var itemErrors = 0;
  var itemErrorList = [];
  var BATCH_SIZE = 400; // safe under Firestore 500 limit

  for (var b = 0; b < ITEMS.length; b += BATCH_SIZE) {
    var batch = db.batch();
    var batchItems = ITEMS.slice(b, b + BATCH_SIZE);

    batchItems.forEach(function(item) {
      var docRef = db.collection('items').doc(item.id);
      var doc = {
        id: item.id,
        name: item.name || '',
        cat: item.cat || '',
        icon: item.icon || '',
        etat: item.etat || null,
        desc: item.desc || '',
        fab: item.fab || '',
        serial: item.serial || '',
        volo_id: item.volo_id || '',
        expiry: item.expiry || null,
        inspBy: item.inspBy || '',
        inspDate: item.inspDate || '',
        notes: item.notes || '',
        migrated_at: admin.firestore.FieldValue.serverTimestamp()
      };
      // Optional fields
      if (item.couleur) doc.couleur = item.couleur;
      if (item.qty) doc.qty = item.qty;

      batch.set(docRef, doc, { merge: true });
    });

    try {
      await batch.commit();
      progress(Math.min(b + BATCH_SIZE, ITEMS.length), ITEMS.length, 'batch ' + Math.floor(b / BATCH_SIZE + 1));
    } catch (e) {
      itemErrors += batchItems.length;
      itemErrorList.push({ batch: Math.floor(b / BATCH_SIZE + 1), error: e.message });
    }
  }

  // 4. Écrire les caisses
  console.log('\n\n  [4/4] Écriture caisses dans Firestore...\n');
  var caisseErrors = 0;
  var caisseErrorList = [];

  var caisseBatch = db.batch();
  CAISSES.forEach(function(c) {
    var docRef = db.collection('caisses').doc(c.id);
    var doc = {
      id: c.id,
      nom: c.nom || c.name || '',
      count: c.count || 0,
      icon: c.icon || '',
      type: c.type || 'autre',
      items_contenus: c.items_contenus || [],
      depot_assigne: c.depot_assigne || null,
      poids_total: c.poids_total || null,
      derniere_verification: c.derniere_verification || null,
      responsable: c.responsable || null,
      statut: c.statut || 'disponible',
      migrated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    if (c.parent_groupe) doc.parent_groupe = c.parent_groupe;

    caisseBatch.set(docRef, doc, { merge: true });
  });

  try {
    await caisseBatch.commit();
    console.log('  ✓  ' + CAISSES.length + ' caisses écrites');
  } catch (e) {
    caisseErrors = CAISSES.length;
    caisseErrorList.push({ error: e.message });
  }

  // Rapport
  console.log('\n  ══════════════════════════════════════════');
  console.log('   RAPPORT MIGRATION ITEMS + CAISSES');
  console.log('  ══════════════════════════════════════════');
  console.log('  Items data.js      : ' + ITEMS.length);
  console.log('  Items écrits       : \x1b[32m' + (ITEMS.length - itemErrors) + '\x1b[0m');
  console.log('  Items erreurs      : ' + (itemErrors > 0 ? '\x1b[31m' + itemErrors + '\x1b[0m' : '0'));
  console.log('  Caisses data.js    : ' + CAISSES.length);
  console.log('  Caisses écrites    : \x1b[32m' + (CAISSES.length - caisseErrors) + '\x1b[0m');
  console.log('  Caisses erreurs    : ' + (caisseErrors > 0 ? '\x1b[31m' + caisseErrors + '\x1b[0m' : '0'));

  if (itemErrorList.length > 0) {
    console.log('\n  Erreurs items :');
    itemErrorList.forEach(function(e) {
      console.log('    Batch ' + e.batch + ': ' + e.error);
    });
  }
  if (caisseErrorList.length > 0) {
    console.log('\n  Erreurs caisses :');
    caisseErrorList.forEach(function(e) {
      console.log('    ' + e.error);
    });
  }

  console.log('  ══════════════════════════════════════════');
  console.log('\n  Prochaine étape : vérifier dans firebase-service.js');
  console.log('  que getItems() lit depuis Firestore en priorité.\n');

  process.exit((itemErrors + caisseErrors) > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n\x1b[31m  ERREUR FATALE:\x1b[0m', err.message);
  process.exit(1);
});
