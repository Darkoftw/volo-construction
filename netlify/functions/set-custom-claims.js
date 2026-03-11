// ══════════════════════════════════════════
//  VOLO SST — Set Custom Claims (Netlify Function)
//  POST { uid, role }
//  Header: x-admin-secret: <ADMIN_SECRET>
//  Sets Firebase Auth custom claims { role } on user
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

  const { uid, role } = body;

  if (!uid || typeof uid !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'uid required (string)' }) };
  }

  if (!role || !VALID_ROLES.includes(role.toLowerCase())) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'role required — valid: ' + VALID_ROLES.join(', ') })
    };
  }

  // Set custom claims
  try {
    const normalizedRole = role.toLowerCase();
    await admin.auth().setCustomUserClaims(uid, { role: normalizedRole });

    // Also update Firestore user doc if it exists
    try {
      const db = admin.firestore();
      const userRef = db.collection('users').doc(uid);
      const doc = await userRef.get();
      if (doc.exists) {
        await userRef.update({ role: normalizedRole, claims_updated: admin.firestore.FieldValue.serverTimestamp() });
      }
    } catch (fsErr) {
      // Firestore update is best-effort — claims are the priority
      console.warn('[set-custom-claims] Firestore update failed:', fsErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        uid: uid,
        role: normalizedRole,
        message: 'Custom claims set — user must re-login or refresh token'
      })
    };

  } catch (err) {
    console.error('[set-custom-claims] Error:', err);

    if (err.code === 'auth/user-not-found') {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'User not found: ' + uid }) };
    }

    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Failed to set claims: ' + err.message })
    };
  }
};
