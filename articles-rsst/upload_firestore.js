/**
 * Upload 50 articles RSST/CSTC vers Firestore
 * Uses Firebase CLI cached credentials (refresh token → access token)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'volo-sst-prod';
const ARTICLES_FILE = path.join(__dirname, 'all_articles_rsst.json');

// Read Firebase CLI cached token
function getRefreshToken() {
  const p = path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return config.tokens.refresh_token;
}

// Exchange refresh token for access token
function getAccessToken(refreshToken) {
  return new Promise((resolve, reject) => {
    const data = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const j = JSON.parse(body);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error(body));
      });
    });
    req.write(data);
    req.end();
  });
}

// Upload one doc via REST API
function uploadDoc(token, article) {
  return new Promise((resolve, reject) => {
    const fields = {};
    for (const [key, value] of Object.entries(article)) {
      if (Array.isArray(value)) {
        fields[key] = { arrayValue: { values: value.map(v => ({ stringValue: String(v) })) } };
      } else {
        fields[key] = { stringValue: String(value) };
      }
    }
    fields.created_at = { timestampValue: new Date().toISOString() };
    fields.updated_at = { timestampValue: new Date().toISOString() };

    const body = JSON.stringify({ fields });
    const docPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles_rsst/${article.id}`;

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: docPath + '?updateMask.fieldPaths=' + Object.keys(fields).join('&updateMask.fieldPaths='),
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else reject(new Error(`${res.statusCode}: ${data.substring(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const articles = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf-8'));
  console.log(`${articles.length} articles to upload`);

  console.log('Getting access token...');
  const refreshToken = getRefreshToken();
  const accessToken = await getAccessToken(refreshToken);
  console.log('Token OK');

  let ok = 0, fail = 0;
  for (const article of articles) {
    try {
      await uploadDoc(accessToken, article);
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${articles.length}`);
    } catch (err) {
      fail++;
      console.error(`  FAIL ${article.id}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${ok} uploaded, ${fail} failed`);
}

main();
