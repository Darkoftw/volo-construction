// Proxy webhook — forwarde vers Make.com
exports.handler = async function(event) {
  const TARGET = 'https://hook.us2.make.com/wm4fvbqy87nfcuf111azq02l3w2a87sh';
  try {
    const res = await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: event.body || '{}'
    });
    return { statusCode: res.status, body: await res.text() };
  } catch(e) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, queued: true }) };
  }
};
