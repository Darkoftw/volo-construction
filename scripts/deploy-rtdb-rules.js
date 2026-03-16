#!/usr/bin/env node
// ══════════════════════════════════════════
//  Deploy RTDB Rules via REST API
// ══════════════════════════════════════════

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const https = require('https');

const SA_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('\x1b[31m  ERREUR: service-account-key.json introuvable\x1b[0m');
  process.exit(1);
}

var sa = require(SA_PATH);

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: 'volo-sst-prod'
});

var rulesPath = path.join(__dirname, '..', 'database.rules.json');
var rulesContent = fs.readFileSync(rulesPath, 'utf-8');

console.log('  Deploying RTDB rules via REST API...');

admin.credential.cert(sa).getAccessToken().then(function(tokenObj) {
  var data = rulesContent;
  var options = {
    hostname: 'volo-sst-prod-default-rtdb.firebaseio.com',
    path: '/.settings/rules.json?access_token=' + tokenObj.access_token,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  var req = https.request(options, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      if (res.statusCode === 200) {
        console.log('\x1b[32m  ✓ RTDB rules deployed successfully\x1b[0m');
        process.exit(0);
      } else {
        console.error('\x1b[31m  ERREUR ' + res.statusCode + ':\x1b[0m', body);
        process.exit(1);
      }
    });
  });

  req.on('error', function(err) {
    console.error('\x1b[31m  ERREUR:', err.message, '\x1b[0m');
    process.exit(1);
  });

  req.write(data);
  req.end();
}).catch(function(e) {
  console.error('\x1b[31m  ERREUR auth:', e.message, '\x1b[0m');
  process.exit(1);
});
