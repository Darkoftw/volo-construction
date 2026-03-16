var admin = require('firebase-admin');
var path = require('path');
admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))),
  projectId: 'volo-sst-prod'
});
var auth = admin.auth();
var db = admin.firestore();

var UIDS = [
  'n0QYtrL64EQhHqWBIxWaZ9HDL3g1',  // v0205@volo-sst.local
  'z02SmIflUrOYsGOhVznvgMkz1pL2'   // jonathan.milone@gmail.com
];

async function main() {
  for (var i = 0; i < UIDS.length; i++) {
    var uid = UIDS[i];
    var user = await auth.getUser(uid);
    console.log('Setting admin for:', user.email || user.displayName, '| uid:', uid);
    await auth.setCustomUserClaims(uid, { role: 'admin' });
    var updated = await auth.getUser(uid);
    console.log('  -> claims:', JSON.stringify(updated.customClaims));
  }
  // Lier le uid principal au doc Firestore V0205
  await db.collection('users').doc('V0205').update({
    uid: UIDS[0],
    role: 'ADMIN',
    authEmail: 'v0205@volo-sst.local',
    linkedAt: new Date().toISOString()
  });
  console.log('Firestore V0205 -> role=ADMIN, uid lié');
  process.exit(0);
}
main().catch(function(e) { console.error(e.message); process.exit(1); });
