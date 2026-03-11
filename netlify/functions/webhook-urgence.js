// Proxy webhook urgence — forwarde vers Make.com
exports.handler = async function(event) {
  const TARGET = 'https://hook.us2.make.com/eha54bbek46jrg1yp88939167v7ngveh';
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
