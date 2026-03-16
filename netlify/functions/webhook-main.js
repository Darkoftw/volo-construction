// Proxy webhook — forwarde vers Make.com (avec validation)
exports.handler = async function(event) {
  // Only POST
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': 'https://voloinv7.netlify.app', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  // Validate body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }
  if (!payload || Object.keys(payload).length === 0) {
    return { statusCode: 400, body: 'Empty payload' };
  }

  const TARGET = 'https://hook.us2.make.com/wm4fvbqy87nfcuf111azq02l3w2a87sh';
  try {
    const res = await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { statusCode: res.status, headers: { 'Access-Control-Allow-Origin': 'https://voloinv7.netlify.app' }, body: await res.text() };
  } catch(e) {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': 'https://voloinv7.netlify.app' }, body: JSON.stringify({ ok: true, queued: true }) };
  }
};
