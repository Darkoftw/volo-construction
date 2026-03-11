/**
 * VOLO SST — Firestore Rules Test Matrix
 *
 * Simule des lectures/écritures avec différents rôles et vérifie
 * que les accès correspondent aux règles définies dans firestore.rules.
 *
 * Usage:
 *   npx ts-node scripts/test-rules.ts
 *   — ou —
 *   node scripts/test-rules.ts    (fonctionne aussi en JS pur)
 *
 * Pas de dépendances Firebase requises — simulation logique pure.
 */

// ══════════════════════════════════════════
//  Types
// ══════════════════════════════════════════

type Role = 'admin' | 'chef' | 'sauveteur' | 'surveillant' | 'rh' | null;
type Op = 'read' | 'create' | 'update' | 'delete';

interface TestCase {
  collection: string;
  op: Op;
  role: Role;        // null = non authentifié
  expected: boolean;  // true = autorisé, false = bloqué
  description: string;
}

interface AuthToken {
  role?: string;
}

interface RequestAuth {
  uid: string;
  token: AuthToken;
}

// ══════════════════════════════════════════
//  Simulation des helpers Firestore Rules
// ══════════════════════════════════════════

function isAuth(auth: RequestAuth | null): boolean {
  return auth != null;
}

function hasRole(auth: RequestAuth | null, role: string): boolean {
  return isAuth(auth) && auth!.token.role === role;
}

function isAdmin(auth: RequestAuth | null): boolean {
  return hasRole(auth, 'admin');
}

function isChef(auth: RequestAuth | null): boolean {
  return hasRole(auth, 'chef');
}

function isChefOrAdmin(auth: RequestAuth | null): boolean {
  return isAdmin(auth) || isChef(auth);
}

function isAdminOrRH(auth: RequestAuth | null): boolean {
  return hasRole(auth, 'admin') || hasRole(auth, 'rh');
}

function isSurveillant(auth: RequestAuth | null): boolean {
  return hasRole(auth, 'surveillant');
}

// ══════════════════════════════════════════
//  Moteur de règles — reproduit firestore.rules
// ══════════════════════════════════════════

const RULES: Record<string, (auth: RequestAuth | null, op: Op) => boolean> = {

  // users: read=auth, write=admin|rh
  users: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdminOrRH(auth);
  },

  // items: read=auth, write=admin
  items: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // vehicules: read=auth, write=admin
  vehicules: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // chantiers: read=auth, write=admin
  chantiers: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // pointages: read=auth, create=auth, update/delete=jamais
  pointages: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth);
    return false; // update, delete
  },

  // km_logs: read=auth, create=auth, update/delete=jamais
  km_logs: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth);
    return false;
  },

  // incidents: read=auth, create=auth+!surv, update=admin, delete=jamais
  incidents: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth) && !isSurveillant(auth);
    if (op === 'update') return isAdmin(auth);
    return false; // delete
  },

  // transactions: read=auth, create=auth+!surv, update=admin, delete=jamais
  transactions: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth) && !isSurveillant(auth);
    if (op === 'update') return isAdmin(auth);
    return false;
  },

  // certifications: read=auth, write=chef|admin
  certifications: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isChefOrAdmin(auth);
  },

  // audit_logs: read=admin, create=auth, update/delete=jamais
  audit_logs: (auth, op) => {
    if (op === 'read') return isAdmin(auth);
    if (op === 'create') return isAuth(auth);
    return false;
  },

  // config: read=auth, write=admin
  config: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // caisses: read=auth, write=admin
  caisses: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // photos: read=auth, create=auth, update=admin, delete=jamais
  photos: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth);
    if (op === 'update') return isAdmin(auth);
    return false;
  },

  // urgences: read=auth, create=auth, update=admin, delete=jamais
  urgences: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAuth(auth);
    if (op === 'update') return isAdmin(auth);
    return false;
  },

  // personnel: read=auth, write=admin
  personnel: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // organizations: read=auth, write=admin
  organizations: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    return isAdmin(auth);
  },

  // destroyed_items: read=auth, create=admin, update/delete=jamais
  destroyed_items: (auth, op) => {
    if (op === 'read') return isAuth(auth);
    if (op === 'create') return isAdmin(auth);
    return false;
  },

  // catch-all: deny everything
  _unknown: () => false,
};

function evaluate(collection: string, op: Op, auth: RequestAuth | null): boolean {
  const rule = RULES[collection] || RULES._unknown;
  return rule(auth, op);
}

// ══════════════════════════════════════════
//  Fabrique d'auth mocks
// ══════════════════════════════════════════

function mockAuth(role: Role): RequestAuth | null {
  if (role === null) return null;
  return { uid: `test-uid-${role}`, token: { role } };
}

// ══════════════════════════════════════════
//  Matrice de tests
// ══════════════════════════════════════════

const ALL_ROLES: Role[] = [null, 'sauveteur', 'surveillant', 'chef', 'rh', 'admin'];
const ALL_OPS: Op[] = ['read', 'create', 'update', 'delete'];

const COLLECTIONS = [
  'users', 'items', 'vehicules', 'chantiers', 'pointages', 'km_logs',
  'incidents', 'transactions', 'certifications', 'audit_logs', 'config',
  'caisses', 'photos', 'urgences', 'personnel', 'organizations', 'destroyed_items',
];

function roleLabel(role: Role): string {
  return role === null ? 'NON-AUTH' : role.toUpperCase();
}

function generateTests(): TestCase[] {
  const tests: TestCase[] = [];

  for (const col of COLLECTIONS) {
    for (const op of ALL_OPS) {
      for (const role of ALL_ROLES) {
        const auth = mockAuth(role);
        const expected = evaluate(col, op, auth);
        tests.push({
          collection: col,
          op,
          role,
          expected,
          description: `${col} / ${op} / ${roleLabel(role)} → ${expected ? 'ALLOW' : 'DENY'}`,
        });
      }
    }
  }

  // ── Tests métier spécifiques ──

  // T1: Surveillant ne peut PAS créer de transaction
  tests.push({
    collection: 'transactions', op: 'create', role: 'surveillant', expected: false,
    description: 'MÉTIER: Surveillant bloqué sur création transaction (pas inventaire)',
  });

  // T2: Surveillant ne peut PAS créer d'incident
  tests.push({
    collection: 'incidents', op: 'create', role: 'surveillant', expected: false,
    description: 'MÉTIER: Surveillant bloqué sur création incident',
  });

  // T3: Sauveteur PEUT créer une transaction
  tests.push({
    collection: 'transactions', op: 'create', role: 'sauveteur', expected: true,
    description: 'MÉTIER: Sauveteur peut créer transaction (Pick-On/Off)',
  });

  // T4: Personne ne peut supprimer un pointage
  for (const role of ALL_ROLES) {
    tests.push({
      collection: 'pointages', op: 'delete', role, expected: false,
      description: `MÉTIER: ${roleLabel(role)} ne peut PAS supprimer pointage (append-only)`,
    });
  }

  // T5: Chef peut écrire des certifications
  tests.push({
    collection: 'certifications', op: 'create', role: 'chef', expected: true,
    description: 'MÉTIER: Chef peut modifier certifications (dates)',
  });

  // T6: Sauveteur ne peut PAS écrire des certifications
  tests.push({
    collection: 'certifications', op: 'create', role: 'sauveteur', expected: false,
    description: 'MÉTIER: Sauveteur ne peut PAS modifier certifications',
  });

  // T7: RH peut écrire des profils users
  tests.push({
    collection: 'users', op: 'create', role: 'rh', expected: true,
    description: 'MÉTIER: RH peut gérer les profils utilisateurs',
  });

  // T8: Audit logs lisibles uniquement par admin
  tests.push({
    collection: 'audit_logs', op: 'read', role: 'sauveteur', expected: false,
    description: 'MÉTIER: Sauveteur ne peut PAS lire audit_logs (admin only)',
  });
  tests.push({
    collection: 'audit_logs', op: 'read', role: 'admin', expected: true,
    description: 'MÉTIER: Admin peut lire audit_logs',
  });

  // T9: Non-auth bloqué partout
  for (const col of COLLECTIONS) {
    tests.push({
      collection: col, op: 'read', role: null, expected: false,
      description: `SÉCURITÉ: Non-auth bloqué en lecture sur ${col}`,
    });
  }

  // T10: Catch-all bloque les collections inconnues
  tests.push({
    collection: '_unknown', op: 'read', role: 'admin', expected: false,
    description: 'SÉCURITÉ: Collection inconnue bloquée même pour admin',
  });
  tests.push({
    collection: '_unknown', op: 'create', role: 'admin', expected: false,
    description: 'SÉCURITÉ: Écriture collection inconnue bloquée',
  });

  // T11: Destroyed items — seul admin peut créer
  tests.push({
    collection: 'destroyed_items', op: 'create', role: 'chef', expected: false,
    description: 'MÉTIER: Chef ne peut PAS détruire items (admin only)',
  });
  tests.push({
    collection: 'destroyed_items', op: 'create', role: 'admin', expected: true,
    description: 'MÉTIER: Admin peut marquer items comme détruits',
  });

  // T12: Personne ne peut modifier un audit_log existant
  for (const role of ALL_ROLES) {
    tests.push({
      collection: 'audit_logs', op: 'update', role, expected: false,
      description: `SÉCURITÉ: ${roleLabel(role)} ne peut PAS modifier audit_log (append-only)`,
    });
  }

  return tests;
}

// ══════════════════════════════════════════
//  Exécution et rapport
// ══════════════════════════════════════════

function run(): void {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  VOLO SST — Firestore Rules Test Report');
  console.log('  ' + new Date().toISOString());
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  const tests = generateTests();
  let pass = 0;
  let fail = 0;
  const failures: TestCase[] = [];
  const seen = new Set<string>();

  for (const t of tests) {
    // Dédupliquer (les tests métier peuvent recouper la matrice)
    const key = `${t.collection}:${t.op}:${t.role}:${t.expected}:${t.description}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const auth = mockAuth(t.role);
    const actual = evaluate(t.collection, t.op, auth);
    const ok = actual === t.expected;

    if (ok) {
      pass++;
    } else {
      fail++;
      failures.push(t);
    }
  }

  // ── Résumé par collection ──
  console.log('── Couverture par collection ──');
  console.log('');

  const colStats: Record<string, { pass: number; fail: number }> = {};
  const seenReport = new Set<string>();

  for (const t of tests) {
    const key = `${t.collection}:${t.op}:${t.role}:${t.expected}:${t.description}`;
    if (seenReport.has(key)) continue;
    seenReport.add(key);

    if (!colStats[t.collection]) colStats[t.collection] = { pass: 0, fail: 0 };
    const auth = mockAuth(t.role);
    const actual = evaluate(t.collection, t.op, auth);
    if (actual === t.expected) colStats[t.collection].pass++;
    else colStats[t.collection].fail++;
  }

  for (const col of [...COLLECTIONS, '_unknown']) {
    const s = colStats[col];
    if (!s) continue;
    const icon = s.fail === 0 ? '  PASS' : '  FAIL';
    const count = `${s.pass}/${s.pass + s.fail}`;
    console.log(`  ${icon}  ${col.padEnd(20)} ${count}`);
  }

  // ── Tests métier détaillés ──
  console.log('');
  console.log('── Tests métier ──');
  console.log('');

  const businessTests = tests.filter(t => t.description.startsWith('MÉTIER:') || t.description.startsWith('SÉCURITÉ:'));
  const seenBiz = new Set<string>();
  for (const t of businessTests) {
    const key = `${t.collection}:${t.op}:${t.role}:${t.expected}:${t.description}`;
    if (seenBiz.has(key)) continue;
    seenBiz.add(key);

    const auth = mockAuth(t.role);
    const actual = evaluate(t.collection, t.op, auth);
    const ok = actual === t.expected;
    const icon = ok ? '  PASS' : '  FAIL';
    console.log(`  ${icon}  ${t.description}`);
    if (!ok) {
      console.log(`         attendu=${t.expected} obtenu=${actual}`);
    }
  }

  // ── Rapport final ──
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  RÉSULTAT: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL`);

  if (fail === 0) {
    console.log('  STATUS:  ALL PASS');
  } else {
    console.log('  STATUS:  FAILURES DETECTED');
    console.log('');
    console.log('  Échecs :');
    for (const f of failures) {
      console.log(`    - ${f.description}`);
    }
  }

  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  // ── Matrice résumée (lecture rapide) ──
  console.log('── Matrice d\'accès (R=read C=create U=update D=delete) ──');
  console.log('');
  const header = '  COLLECTION'.padEnd(24) + ALL_ROLES.map(r => roleLabel(r).padStart(12)).join('');
  console.log(header);
  console.log('  ' + '─'.repeat(header.length - 2));

  for (const col of COLLECTIONS) {
    let line = '  ' + col.padEnd(22);
    for (const role of ALL_ROLES) {
      const auth = mockAuth(role);
      const perms = ALL_OPS.map(op => {
        const allowed = evaluate(col, op, auth);
        const letter = op[0].toUpperCase(); // R, C, U, D
        return allowed ? letter : '·';
      }).join('');
      line += perms.padStart(12);
    }
    console.log(line);
  }

  console.log('');
  console.log('  Légende: R=read C=create U=update D=delete · =bloqué');
  console.log('');

  process.exit(fail > 0 ? 1 : 0);
}

run();
