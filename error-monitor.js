// ══════════════════════════════════════════
//  VOLO SST — Error Monitor
//  Captures unhandled errors + promise rejections
//  Stores in localStorage, optional webhook report
// ══════════════════════════════════════════
(function(){
  var LS_KEY = 'volo_error_log';
  var MAX_ERRORS = 50;
  var WEBHOOK = '/api/webhook-main';
  var THROTTLE_MS = 5000;
  var _lastSent = 0;

  function getPage(){
    try { return location.pathname.split('/').pop() || 'unknown'; } catch(e){ return 'unknown'; }
  }

  function getUser(){
    try { return localStorage.getItem('volo_last_name') || localStorage.getItem('volo_last_volo') || 'anonymous'; } catch(e){ return 'anonymous'; }
  }

  function storeError(entry){
    try {
      var log = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      log.push(entry);
      if(log.length > MAX_ERRORS) log = log.slice(-MAX_ERRORS);
      localStorage.setItem(LS_KEY, JSON.stringify(log));
    } catch(e){}
  }

  function sendToWebhook(entry){
    var now = Date.now();
    if(now - _lastSent < THROTTLE_MS) return;
    _lastSent = now;
    try {
      var payload = {
        type: 'ERROR_LOG',
        page: entry.page,
        user: entry.user,
        message: entry.message,
        source: entry.source || '',
        line: entry.line || 0,
        col: entry.col || 0,
        stack: (entry.stack || '').substring(0, 500),
        timestamp: entry.ts,
        ua: navigator.userAgent.substring(0, 150)
      };
      if(navigator.sendBeacon){
        navigator.sendBeacon(WEBHOOK, JSON.stringify(payload));
      } else {
        fetch(WEBHOOK, { method:'POST', body:JSON.stringify(payload), keepalive:true }).catch(function(){});
      }
    } catch(e){}
  }

  function buildEntry(msg, source, line, col, stack){
    return {
      ts: new Date().toISOString(),
      page: getPage(),
      user: getUser(),
      message: String(msg || 'Unknown error').substring(0, 300),
      source: String(source || '').substring(0, 200),
      line: line || 0,
      col: col || 0,
      stack: String(stack || '').substring(0, 500)
    };
  }

  // Global error handler
  window.addEventListener('error', function(ev){
    var entry = buildEntry(
      ev.message,
      ev.filename,
      ev.lineno,
      ev.colno,
      ev.error && ev.error.stack ? ev.error.stack : ''
    );
    storeError(entry);
    sendToWebhook(entry);
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(ev){
    var reason = ev.reason || {};
    var msg = reason.message || String(reason);
    var stack = reason.stack || '';
    var entry = buildEntry('Promise: ' + msg, '', 0, 0, stack);
    storeError(entry);
    sendToWebhook(entry);
  });

  // Expose utility to view/export errors
  window.voloErrors = {
    get: function(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e){ return []; } },
    clear: function(){ localStorage.removeItem(LS_KEY); },
    count: function(){ return this.get().length; },
    export: function(){
      var log = this.get();
      if(!log.length){ console.log('Aucune erreur enregistree.'); return; }
      var txt = log.map(function(e){ return e.ts + ' | ' + e.page + ' | ' + e.message + (e.line ? ' (L' + e.line + ')' : ''); }).join('\n');
      console.log('=== VOLO ERROR LOG (' + log.length + ') ===\n' + txt);
      return txt;
    }
  };
})();
