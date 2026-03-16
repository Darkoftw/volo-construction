var admin = require('firebase-admin');
var path = require('path');
admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))),
  projectId: 'volo-sst-prod'
});
admin.auth().listUsers(1000).then(function(r) {
  console.log('Total Auth users:', r.users.length);
  console.log('---');
  r.users.forEach(function(u) {
    console.log(u.uid, '|', u.email || '(no email)', '|', u.displayName || '(no name)', '| claims:', JSON.stringify(u.customClaims || {}));
  });
  process.exit(0);
});
