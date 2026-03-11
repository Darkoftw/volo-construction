/**
 * VOLO SST — Firestore Seed Script
 *
 * Peuple Firestore avec des données de test pour démos et tests d'intégration.
 *
 * Usage:
 *   npx ts-node scripts/seed_firestore.ts
 *
 * Prérequis:
 *   - .env configuré avec les variables Firebase
 *   - npm install firebase-admin dotenv
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Config ---
const ORG_ID = 'ORG_TEST_VOLO';

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error('❌ FIREBASE_PROJECT_ID manquant dans .env — voir .env.example');
  process.exit(1);
}

// Init Firebase Admin avec service account ou env vars
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
db.settings({ ignoreUndefinedProperties: true });

// --- Helpers ---
function tsNow(): string {
  return new Date().toISOString();
}

function randomPast(maxDaysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * maxDaysAgo));
  d.setHours(Math.floor(Math.random() * 12) + 6);
  d.setMinutes(Math.floor(Math.random() * 60));
  return d.toISOString();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Seed Data ---

const REGIONS = ['ESTRIE', 'CAPITALE-NATIONALE', 'MAURICIE', 'LANAUDIÈRE', 'MONTRÉAL', 'OUTAOUAIS', 'BAS-ST-LAURENT'];
const DEPOTS = ['DEP-SHE', 'DEP-QC', 'DEP-MTL', 'DEP-GBY', 'DEP-TRV'];
const DESTINATIONS = ['DEST-A1', 'DEST-B2', 'DEST-C3', 'DEST-D4', 'DEST-E5'];

// 3 utilisateurs test
const USERS = [
  {
    voloId: 'V0001',
    name: 'Admin Testeur',
    role: 'CHEF D\'ÉQUIPE',
    type: 'SAUVETEUR',
    region: 'ESTRIE',
    ville: 'Sherbrooke',
    email: 'admin@volo-test.local',
    authLevel: 'admin',
  },
  {
    voloId: 'V0002',
    name: 'Marc Surveillant',
    role: 'SURVEILLANT',
    type: 'SURVEILLANT',
    region: 'CAPITALE-NATIONALE',
    ville: 'Québec',
    email: 'surveillant@volo-test.local',
    authLevel: 'surveillant',
  },
  {
    voloId: 'V0003',
    name: 'Julie RH',
    role: 'RH',
    type: 'BUREAU',
    region: 'MONTRÉAL',
    ville: 'Montréal',
    email: 'rh@volo-test.local',
    authLevel: 'rh',
  },
];

// 2 chantiers avec 5 membres chacun
const CHANTIERS = [
  {
    id: 'CHANTIER-001',
    name: 'Pont Jacques-Cartier — Inspection câbles',
    depot: 'DEP-MTL',
    destination: 'DEST-A1',
    region: 'MONTRÉAL',
    contrat: 'PRJ-2026-001',
    dateDebut: '2026-03-01',
    membres: ['V0001', 'V0010', 'V0011', 'V0012', 'V0013'],
  },
  {
    id: 'CHANTIER-002',
    name: 'Barrage Manic — Sauvetage vertical',
    depot: 'DEP-QC',
    destination: 'DEST-C3',
    region: 'CAPITALE-NATIONALE',
    contrat: 'PRJ-2026-002',
    dateDebut: '2026-03-05',
    membres: ['V0002', 'V0020', 'V0021', 'V0022', 'V0023'],
  },
];

// 10 membres supplémentaires pour les chantiers
const EXTRA_MEMBERS = [
  { voloId: 'V0010', name: 'Pierre Lavoie', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'MONTRÉAL', ville: 'Longueuil' },
  { voloId: 'V0011', name: 'Simon Tremblay', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'MONTRÉAL', ville: 'Laval' },
  { voloId: 'V0012', name: 'Éric Gagnon', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'MONTRÉAL', ville: 'Montréal' },
  { voloId: 'V0013', name: 'Luc Bergeron', role: 'CHEF D\'ÉQUIPE', type: 'SAUVETEUR', region: 'ESTRIE', ville: 'Magog' },
  { voloId: 'V0020', name: 'Jean Côté', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'CAPITALE-NATIONALE', ville: 'Lévis' },
  { voloId: 'V0021', name: 'François Roy', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'MAURICIE', ville: 'Trois-Rivières' },
  { voloId: 'V0022', name: 'Alain Morin', role: 'SURVEILLANT', type: 'SURVEILLANT', region: 'CAPITALE-NATIONALE', ville: 'Québec' },
  { voloId: 'V0023', name: 'Martin Bouchard', role: 'SAUVETEUR', type: 'SAUVETEUR', region: 'LANAUDIÈRE', ville: 'Joliette' },
];

// 10 incidents avec statuts variés
const INCIDENT_STATUSES = ['pending_upload', 'uploaded', 'failed'] as const;
const INCIDENT_TYPES = ['PICK-ON', 'PICK-OFF', 'URGENCE', 'KM_LOG', 'POINTAGE', 'PHOTO_LOG'];

function generateIncidents() {
  const incidents = [];
  for (let i = 1; i <= 10; i++) {
    const status = INCIDENT_STATUSES[i % 3];
    incidents.push({
      id: `INC-${String(i).padStart(3, '0')}`,
      type: pick(INCIDENT_TYPES),
      status,
      chantier: pick(CHANTIERS).id,
      reportedBy: pick([...USERS, ...EXTRA_MEMBERS]).voloId,
      description: `Incident test #${i} — ${status}`,
      timestamp: randomPast(30),
      syncedAt: status === 'uploaded' ? randomPast(7) : null,
      retryCount: status === 'failed' ? Math.floor(Math.random() * 3) + 1 : 0,
      payload: {
        items: [`SAC-00${i % 5 + 1}`, `PAL-00${i % 3 + 1}`],
        note: `Note de test pour incident ${i}`,
      },
    });
  }
  return incidents;
}

// 20 audit log entries
const AUDIT_ACTIONS = [
  'USER_LOGIN', 'USER_LOGOUT', 'PICK_ON', 'PICK_OFF', 'ITEM_SCAN',
  'CERT_UPDATE', 'URGENCE_RAISED', 'URGENCE_LIFTED', 'ANNOUNCEMENT_SET',
  'BACKUP_EXPORT', 'PIN_FAILED', 'CONFIG_CHANGE', 'MEMBER_ADDED',
  'KM_LOGGED', 'POINTAGE_IN', 'POINTAGE_OUT', 'PHOTO_UPLOAD',
  'TRANSACTION_CANCEL', 'ROLE_CHANGE', 'DESTRUCTION',
];

function generateAuditLogs() {
  const logs = [];
  for (let i = 0; i < 20; i++) {
    const user = pick([...USERS, ...EXTRA_MEMBERS]);
    logs.push({
      action: AUDIT_ACTIONS[i],
      userId: user.voloId,
      userName: user.name,
      timestamp: randomPast(60),
      ip: '192.168.1.' + Math.floor(Math.random() * 254 + 1),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      details: `Action ${AUDIT_ACTIONS[i]} par ${user.name}`,
      org: ORG_ID,
    });
  }
  return logs;
}

// --- Main Seed ---
async function seed() {
  console.log('🌱 VOLO SST — Seed Firestore');
  console.log(`   Projet: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`   Org:    ${ORG_ID}`);
  console.log('');

  const batch = db.batch();

  // 1. Organisation
  console.log('📁 Organisation...');
  const orgRef = db.collection('organizations').doc(ORG_ID);
  batch.set(orgRef, {
    name: 'VOLO Construction SST — Test',
    region: 'ESTRIE',
    createdAt: tsNow(),
    plan: 'test',
    active: true,
  });

  // 2. Personnel (3 users principaux + 8 extras)
  console.log('👥 Personnel (11 membres)...');
  const allMembers = [...USERS, ...EXTRA_MEMBERS];
  for (const m of allMembers) {
    const ref = db.collection('personnel').doc(m.voloId);
    batch.set(ref, {
      ...m,
      org: ORG_ID,
      createdAt: tsNow(),
      lastLogin: randomPast(7),
      active: true,
    });
  }

  // 3. Chantiers
  console.log('🏗️  Chantiers (2)...');
  for (const c of CHANTIERS) {
    const ref = db.collection('chantiers').doc(c.id);
    batch.set(ref, {
      ...c,
      org: ORG_ID,
      createdAt: tsNow(),
      status: 'actif',
    });
  }

  // Commit batch 1 (Firestore limit: 500 ops per batch)
  await batch.commit();
  console.log('   ✅ Batch 1 committed (org + personnel + chantiers)');

  const batch2 = db.batch();

  // 4. Incidents (10)
  console.log('⚠️  Incidents (10)...');
  const incidents = generateIncidents();
  for (const inc of incidents) {
    const ref = db.collection('transactions').doc(inc.id);
    batch2.set(ref, {
      ...inc,
      org: ORG_ID,
    });
  }

  // 5. Audit Logs (20)
  console.log('📋 Audit logs (20)...');
  const logs = generateAuditLogs();
  for (const log of logs) {
    const ref = db.collection('audit_logs').doc();
    batch2.set(ref, log);
  }

  // 6. Config
  console.log('⚙️  Config...');
  const configRef = db.collection('config').doc('app');
  batch2.set(configRef, {
    version: 'V10.5',
    announcement: 'Bienvenue sur l\'environnement de test VOLO SST',
    emergencyAlert: null,
    maintenanceMode: false,
    org: ORG_ID,
    updatedAt: tsNow(),
    baremes: {
      SAUVETEUR: { km: 0.68, perdiem: 200, urgence: 64, urgence_perdiem: 0 },
      SURVEILLANT: { km: 0.63, perdiem: 150, urgence: 0 },
    },
  });

  // 7. Sample certifications
  console.log('📜 Certifications (3 membres)...');
  const certDefs = ['RCR', 'PDSB', 'SIMDUT', 'NACELLE', 'CHARIOT', 'ESPACE_CLOS', 'HAUTEUR', 'SAUVETAGE', 'ELECTRICITE', 'PREMIERS_SECOURS'];
  for (const user of USERS) {
    const certs: Record<string, { date: string; status: string }> = {};
    for (const certId of certDefs) {
      const daysAgo = Math.floor(Math.random() * 400);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      certs[certId] = {
        date: d.toISOString().split('T')[0],
        status: daysAgo > 365 ? 'expired' : daysAgo > 335 ? 'warning' : 'ok',
      };
    }
    const ref = db.collection('certifications').doc(user.voloId);
    batch2.set(ref, {
      voloId: user.voloId,
      name: user.name,
      certs,
      org: ORG_ID,
      updatedAt: tsNow(),
    });
  }

  // 8. Sample pointages
  console.log('⏰ Pointages (6)...');
  for (let i = 0; i < 6; i++) {
    const member = pick(allMembers);
    const ref = db.collection('pointages').doc();
    batch2.set(ref, {
      voloId: member.voloId,
      name: member.name,
      type: i % 2 === 0 ? 'ARRIVEE' : 'DEPART',
      chantier: pick(CHANTIERS).id,
      timestamp: randomPast(14),
      org: ORG_ID,
    });
  }

  await batch2.commit();
  console.log('   ✅ Batch 2 committed (incidents + audit + config + certs + pointages)');

  console.log('');
  console.log('🎉 Seed terminé !');
  console.log('');
  console.log('Résumé :');
  console.log('  • 1 organisation (ORG_TEST_VOLO)');
  console.log('  • 11 membres de personnel');
  console.log('  • 2 chantiers avec 5 membres chacun');
  console.log('  • 10 incidents (pending_upload / uploaded / failed)');
  console.log('  • 3 utilisateurs avec certifications');
  console.log('  • 20 entrées audit_logs');
  console.log('  • 6 pointages');
  console.log('  • 1 config app');
  console.log('');
  console.log('💡 Pour vider : npx ts-node scripts/seed_firestore.ts --clean');
}

// --- Clean mode ---
async function clean() {
  console.log('🧹 Nettoyage des données de test...');
  const collections = ['personnel', 'chantiers', 'transactions', 'audit_logs', 'certifications', 'pointages'];

  for (const col of collections) {
    const snap = await db.collection(col).where('org', '==', ORG_ID).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    if (snap.size > 0) {
      await batch.commit();
      console.log(`   ✅ ${col}: ${snap.size} docs supprimés`);
    }
  }

  // Config & org
  await db.collection('config').doc('app').delete().catch(() => {});
  await db.collection('organizations').doc(ORG_ID).delete().catch(() => {});

  console.log('🎉 Nettoyage terminé');
}

// --- Entry point ---
const args = process.argv.slice(2);
if (args.includes('--clean')) {
  clean().catch(console.error);
} else {
  seed().catch(console.error);
}
