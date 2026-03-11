/**
 * VOLO SST — Verify Firestore Seed
 *
 * Lit chaque collection et affiche count + 1 exemple de document.
 * Rapport final OK/FAIL par collection.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' scripts/verify-seed.ts
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error('FIREBASE_PROJECT_ID manquant dans .env');
  process.exit(1);
}

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
} else {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

interface CollectionCheck {
  name: string;
  expectedMin: number;
}

const COLLECTIONS: CollectionCheck[] = [
  { name: 'organizations', expectedMin: 1 },
  { name: 'personnel', expectedMin: 11 },
  { name: 'chantiers', expectedMin: 2 },
  { name: 'transactions', expectedMin: 10 },
  { name: 'audit_logs', expectedMin: 20 },
  { name: 'config', expectedMin: 1 },
  { name: 'certifications', expectedMin: 3 },
  { name: 'pointages', expectedMin: 6 },
];

async function verify() {
  console.log('========================================');
  console.log(' VOLO SST — Verification Firestore Seed');
  console.log(`  Projet: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log('========================================');
  console.log('');

  const results: { name: string; count: number; ok: boolean }[] = [];

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col.name).get();
    const count = snap.size;
    const ok = count >= col.expectedMin;

    console.log(`--- ${col.name} ---`);
    console.log(`  Count: ${count} (attendu >= ${col.expectedMin}) ${ok ? 'OK' : 'FAIL'}`);

    if (count > 0) {
      const sample = snap.docs[0];
      const data = sample.data();
      // Truncate long fields for readability
      const display: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string' && v.length > 80) {
          display[k] = v.substring(0, 77) + '...';
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          display[k] = `{${Object.keys(v).join(', ')}}`;
        } else {
          display[k] = v;
        }
      }
      console.log(`  Exemple (${sample.id}):`);
      console.log(`    ${JSON.stringify(display, null, 2).replace(/\n/g, '\n    ')}`);
    }
    console.log('');

    results.push({ name: col.name, count, ok });
  }

  // Final report
  console.log('========================================');
  console.log(' RAPPORT FINAL');
  console.log('========================================');
  let allOk = true;
  for (const r of results) {
    const status = r.ok ? 'OK' : 'FAIL';
    const icon = r.ok ? '[OK]  ' : '[FAIL]';
    console.log(`  ${icon} ${r.name.padEnd(20)} ${String(r.count).padStart(4)} docs`);
    if (!r.ok) allOk = false;
  }
  console.log('----------------------------------------');
  const totalDocs = results.reduce((s, r) => s + r.count, 0);
  console.log(`  TOTAL: ${totalDocs} documents`);
  console.log(`  STATUS: ${allOk ? 'TOUT OK' : 'ECHECS DETECTES'}`);
  console.log('========================================');

  process.exit(allOk ? 0 : 1);
}

verify().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
