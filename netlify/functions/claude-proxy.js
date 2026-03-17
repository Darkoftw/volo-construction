// ══════════════════════════════════════════
//  VOLO SST — Claude API Proxy (Netlify Function)
//  Keeps the Anthropic API key server-side
//  Timeout: 26s max on Netlify free plan
// ══════════════════════════════════════════
exports.handler = async function(event, context) {
  const CORS = {
    'Access-Control-Allow-Origin': event.headers.origin && (event.headers.origin.endsWith('.netlify.app') || event.headers.origin === 'https://voloinv7.netlify.app' || event.headers.origin === 'https://volosst.netlify.app') ? event.headers.origin : 'https://voloinv7.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  const API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }
  if (!API_KEY.startsWith('sk-ant-')) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'API key format invalid' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!payload.messages || !Array.isArray(payload.messages)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Cap max_tokens (Netlify Pro: 26s timeout)
  const maxTokens = Math.min(payload.max_tokens || 4096, 4096);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 24000); // 24s safety margin

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: payload.model || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: payload.messages,
        system: payload.system || undefined
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await res.text();

    if (res.status === 401) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Cle API rejetee par Anthropic (401)' }) };
    }
    return { statusCode: res.status, headers: CORS, body: data };
  } catch(e) {
    if (e.name === 'AbortError') {
      return { statusCode: 504, headers: CORS, body: JSON.stringify({ error: 'Claude a pris trop de temps (>24s). Reessayez.' }) };
    }
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Proxy error: ' + e.message }) };
  }
};
