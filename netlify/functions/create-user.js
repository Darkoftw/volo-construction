// ══════════════════════════════════════════
//  VOLO SST — Create User (Netlify Function)
//  POST { email, password, displayName, role, voloId, region, ville }
//  Header: x-admin-secret: <ADMIN_SECRET>
//  Creates Firebase Auth user + Firestore profile + custom claims
// ══════════════════════════════════════════

const admin = require('firebase-admin');

// --- Init Firebase Admin (singleton) ---
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    admin.initializeApp({ projectId });
  }
}

// --- CORS headers ---
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// --- Valid roles ---
const VALID_ROLES = ['admin', 'chef', 'sauveteur', 'surveillant', 'rh'];

exports.handler = async function(event) {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // POST only
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };
  }

  // Verify admin secret
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ADMIN_SECRET not configured' }) };
  }

  const provided = (event.headers['x-admin-secret'] || '').trim();
  if (!provided || provided !== secret) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, password, displayName, role, voloId, region, ville, type } = body;

  // Validate required fields
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Password required (min 6 chars)' }) };
  }

  if (!displayName || typeof displayName !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'displayName required' }) };
  }

  const normalizedRole = (role || 'sauveteur').toLowerCase();
  if (!VALID_ROLES.includes(normalizedRole)) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Invalid role — valid: ' + VALID_ROLES.join(', ') })
    };
  }

  try {
    // 1. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      disabled: false
    });

    const uid = userRecord.uid;

    // 2. Set custom claims
    await admin.auth().setCustomUserClaims(uid, { role: normalizedRole });

    // 3. Create Firestore profile
    try {
      const db = admin.firestore();
      const docId = voloId || uid;
      await db.collection('users').doc(docId).set({
        id: docId,
        volo: voloId || '',
        name: displayName,
        email: email,
        role: normalizedRole.toUpperCase(),
        type: (type || normalizedRole).toUpperCase(),
        region: region || '',
        ville: ville || '',
        active: true,
        authUid: uid,
        created: admin.firestore.FieldValue.serverTimestamp(),
        claims_updated: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (fsErr) {
      // Auth user created but Firestore failed — log but don't fail
      console.error('[create-user] Firestore write failed:', fsErr.message);
    }

    // 4. Log audit
    try {
      const db = admin.firestore();
      await db.collection('audit_logs').add({
        action: 'USER_CREATED',
        targetUid: uid,
        targetEmail: email,
        role: normalizedRole,
        voloId: voloId || '',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (auditErr) {
      // Best-effort
      console.warn('[create-user] Audit log failed:', auditErr.message);
    }

    return {
      statusCode: 201,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        uid: uid,
        email: email,
        displayName: displayName,
        role: normalizedRole,
        voloId: voloId || uid,
        message: 'User created with custom claims'
      })
    };

  } catch (err) {
    console.error('[create-user] Error:', err);

    // Firebase Auth specific errors
    const errorMap = {
      'auth/email-already-exists': 'Cet email est déjà utilisé',
      'auth/invalid-email': 'Email invalide',
      'auth/invalid-password': 'Mot de passe invalide (min 6 caractères)',
      'auth/uid-already-exists': 'Ce UID existe déjà'
    };

    const friendlyMsg = errorMap[err.code] || err.message;

    return {
      statusCode: err.code === 'auth/email-already-exists' ? 409 : 500,
      headers: CORS,
      body: JSON.stringify({ error: friendlyMsg, code: err.code || 'unknown' })
    };
  }
};
