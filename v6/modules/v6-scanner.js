/**
 * @module v6-scanner.js
 * @description QR scanner using getUserMedia + jsQR, camera management, quick scan modal
 * @version 6.0.0
 * @depends jsQR (CDN: https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js)
 * @depends v6-engine.js (scanItem, scanGroup)
 * @depends data.js (ITEMS)
 */
(function(window) {
  'use strict';

  // ── Private variables ──────────────────────────────────────
  var _mainStream = null;
  var _mainAnimFrame = null;
  var _mainVideo = null;
  var _camFacing = 'environment';
  var _rearDeviceId = null;
  var _frontDeviceId = null;
  var _jsqrLoop = null;
  var _activeVideoTrack = null;
  var _qrCooldown = false;
  var _qrFrameCount = 0;

  // Quick scan modal variables
  var _qsStream = null;
  var _qsAnimFrame = null;
  var _qsVideo = null;
  var _qsFound = false;

  // ── Private functions ──────────────────────────────────────

  /**
   * @private
   * Start camera for quick scan modal
   */
  function _qsStartCamera() {
    _qsFound = false;
    var constraints = [
      { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: 'environment' } },
      { video: true }
    ];
    var tryConstraint = function(idx) {
      if (idx >= constraints.length) {
        var st = document.getElementById('qs-status');
        if (st) st.innerHTML = '<span style="color:#C0392B">\u26A0\uFE0F Cam\u00E9ra non disponible</span><br><span style="font-size:11px">Autorise la cam\u00E9ra dans ton navigateur</span>';
        return;
      }
      navigator.mediaDevices.getUserMedia(constraints[idx]).then(function(stream) {
        _qsStream = stream;
        var video = document.getElementById('qs-video');
        _qsVideo = video;
        video.srcObject = stream;
        video.play().then(function() {
          var st = document.getElementById('qs-status');
          if (st) st.textContent = '';
          var canvas = document.getElementById('qs-canvas');
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          function loop() {
            if (_qsFound || !_qsStream || !video || video.readyState < 2) {
              if (!_qsFound) _qsAnimFrame = requestAnimationFrame(loop);
              return;
            }
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.drawImage(video, 0, 0);
            if (typeof jsQR !== 'undefined') {
              var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
              if (code && code.data) {
                var box = document.getElementById('qs-box');
                if (box) box.style.borderColor = '#27AE60';
                _qsFound = true;
                _qsOnDetect(code.data);
                return;
              }
            }
            _qsAnimFrame = requestAnimationFrame(loop);
          }
          _qsAnimFrame = requestAnimationFrame(loop);
        });
      }).catch(function() {
        tryConstraint(idx + 1);
      });
    };
    tryConstraint(0);
  }

  /**
   * @private
   * Stop camera for quick scan modal
   */
  function _qsStopCamera() {
    if (_qsAnimFrame) { cancelAnimationFrame(_qsAnimFrame); _qsAnimFrame = null; }
    if (_qsStream) { _qsStream.getTracks().forEach(function(t) { t.stop(); }); _qsStream = null; }
    if (_qsVideo) { _qsVideo.srcObject = null; _qsVideo = null; }
  }

  /**
   * @private
   * Handle QR detection in quick scan modal
   * @param {string} decoded - Decoded QR string
   */
  function _qsOnDetect(decoded) {
    _qsStopCamera();
    var itemId = decoded.trim();
    if (itemId.startsWith('VOLO|ITEM|')) itemId = itemId.split('|')[2];
    else if (itemId.indexOf('?id=') !== -1) itemId = itemId.split('?id=')[1].split('&')[0].trim();
    itemId = decodeURIComponent(itemId);

    var found = null;
    if (typeof ITEMS !== 'undefined') found = ITEMS.find(function(it) { return it.id === itemId; });
    var foundCaisse = null;
    if (!found && typeof CAISSES !== 'undefined') {
      foundCaisse = CAISSES.find(function(c) { return c.id === itemId; });
      if (!foundCaisse && itemId.startsWith('CAT-')) {
        var catName = itemId.replace(/^CAT-/, '').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
        foundCaisse = CAISSES.find(function(c) {
          var cnom = (c.nom || c.name || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
          return cnom === catName;
        });
      }
    }

    var esc = V6Data.escapeHtml;
    var result = document.getElementById('qs-result');
    var again = document.getElementById('qs-again-btn');
    if (found) {
      var html = '<div style="padding:14px;background:rgba(39,174,96,.1);border:1px solid #27AE60;border-radius:12px;text-align:left">';
      html += '<div style="font-family:Oswald,sans-serif;font-size:16px;color:#F5F0EB;margin-bottom:4px">' + esc(found.name) + '</div>';
      html += '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(230,81,0,.15);color:#FF6D00;font-size:12px;font-weight:600;margin-right:4px">' + esc(found.id) + '</span>';
      if (found.cat) html += '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(212,160,23,.15);color:#D4A017;font-size:12px;font-weight:600;margin-right:4px">' + esc(found.cat) + '</span>';
      if (found.etat) html += '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(59,130,246,.15);color:#3B82F6;font-size:12px;font-weight:600">' + esc(found.etat) + '</span>';
      if (found.fab) html += '<div style="font-size:12px;color:#C9BAA9;margin-top:6px">Fabricant: ' + esc(found.fab) + '</div>';
      if (found.serial) html += '<div style="font-size:12px;color:#C9BAA9">Serial: ' + esc(found.serial) + '</div>';
      html += '</div>';
      result.innerHTML = html;
    } else if (foundCaisse) {
      var html2 = '<div style="padding:14px;background:rgba(39,174,96,.1);border:1px solid #27AE60;border-radius:12px;text-align:left">';
      html2 += '<div style="font-family:Oswald,sans-serif;font-size:16px;color:#F5F0EB;margin-bottom:4px">' + esc(foundCaisse.nom || foundCaisse.name || foundCaisse.id) + '</div>';
      html2 += '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(230,81,0,.15);color:#FF6D00;font-size:12px;font-weight:600">' + esc(foundCaisse.id) + '</span>';
      var cnt = foundCaisse.count || (foundCaisse.items_contenus ? foundCaisse.items_contenus.length : '?');
      html2 += '<div style="font-size:12px;color:#C9BAA9;margin-top:6px">Items: ' + cnt + '</div>';
      html2 += '</div>';
      result.innerHTML = html2;
    } else {
      result.innerHTML = '<div style="padding:14px;background:rgba(212,160,23,.1);border:1px solid #D4A017;border-radius:12px;color:#D4A017;font-weight:600">\u26A0\uFE0F QR non trouv\u00E9 \u2014 ID: ' + esc(itemId) + '</div>';
    }
    if (again) again.style.display = 'block';
  }

  /**
   * @private
   * Reset quick scan for another scan
   */
  function _qsAgain() {
    var r = document.getElementById('qs-result');
    if (r) r.innerHTML = '';
    var a = document.getElementById('qs-again-btn');
    if (a) a.style.display = 'none';
    var box = document.getElementById('qs-box');
    if (box) box.style.borderColor = '#D4A017';
    _qsStartCamera();
  }

  /**
   * @private
   * Close the quick scan modal
   */
  function _closeQuickScan() {
    _qsStopCamera();
    var el = document.getElementById('quickScanOverlay');
    if (el) el.remove();
  }

  // ── Public API ─────────────────────────────────────────────
  window.V6Scanner = {

    /**
     * Start the secondary jsQR detection loop (for inverted QR codes)
     */
    startJsQrLoop: function() {
      if (_jsqrLoop) return;
      if (typeof jsQR === 'undefined') return;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      function loop() {
        if (_qrCooldown) { _jsqrLoop = requestAnimationFrame(loop); return; }
        _qrFrameCount++;
        if (_qrFrameCount % 3 !== 0) { _jsqrLoop = requestAnimationFrame(loop); return; }
        var video = document.querySelector('#qr-reader video');
        if (!video || video.readyState < 2) { _jsqrLoop = requestAnimationFrame(loop); return; }
        if (!_activeVideoTrack && video.srcObject) {
          var tracks = video.srcObject.getVideoTracks();
          if (tracks.length) _activeVideoTrack = tracks[0];
        }
        var w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) { _jsqrLoop = requestAnimationFrame(loop); return; }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        var imageData = ctx.getImageData(0, 0, w, h);
        var code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          V6Scanner.onQrSuccess(code.data);
        }
        _jsqrLoop = requestAnimationFrame(loop);
      }
      _jsqrLoop = requestAnimationFrame(loop);
    },

    /**
     * Stop the secondary jsQR detection loop
     */
    stopJsQrLoop: function() {
      if (_jsqrLoop) { cancelAnimationFrame(_jsqrLoop); _jsqrLoop = null; }
      _activeVideoTrack = null;
    },

    /**
     * Enumerate camera devices, identify rear/front cameras
     * @returns {Promise<void>}
     */
    detectCameraDevices: function() {
      if (_rearDeviceId) return Promise.resolve();
      return navigator.mediaDevices.enumerateDevices().then(function(devices) {
        var cams = devices.filter(function(d) { return d.kind === 'videoinput'; });
        var rear = cams.find(function(d) { return /(back|rear|environment|arri\u00E8re|0)/i.test(d.label); });
        var front = cams.find(function(d) { return /(front|user|facing|selfie|1)/i.test(d.label); });
        if (rear) _rearDeviceId = rear.deviceId;
        if (front) _frontDeviceId = front.deviceId;
        if (!_rearDeviceId && cams.length >= 2) _rearDeviceId = cams[cams.length - 1].deviceId;
        if (!_frontDeviceId && cams.length >= 1) _frontDeviceId = cams[0].deviceId;
      }).catch(function() {});
    },

    /**
     * Start main QR scanner with getUserMedia + jsQR loop
     * @returns {Promise<void>}
     */
    startQrScanner: function() {
      if (_mainStream) return Promise.resolve();
      var el = document.getElementById('qr-reader');
      if (!el) return Promise.resolve();

      el.innerHTML =
        '<div style="position:relative;width:100%;aspect-ratio:1;background:var(--bg);border-radius:12px;overflow:hidden">' +
          '<video id="main-scan-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block;' + (_camFacing === 'user' ? 'transform:scaleX(-1)' : '') + '"></video>' +
          '<canvas id="main-scan-canvas" style="display:none"></canvas>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div id="main-scan-box" style="width:72%;max-width:260px;aspect-ratio:1;border:3px solid var(--gold);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.4);position:relative">' +
              '<div style="position:absolute;top:-3px;left:-3px;width:24px;height:24px;border-top:4px solid var(--rescue);border-left:4px solid var(--rescue);border-radius:4px 0 0 0"></div>' +
              '<div style="position:absolute;top:-3px;right:-3px;width:24px;height:24px;border-top:4px solid var(--rescue);border-right:4px solid var(--rescue);border-radius:0 4px 0 0"></div>' +
              '<div style="position:absolute;bottom:-3px;left:-3px;width:24px;height:24px;border-bottom:4px solid var(--rescue);border-left:4px solid var(--rescue);border-radius:0 0 0 4px"></div>' +
              '<div style="position:absolute;bottom:-3px;right:-3px;width:24px;height:24px;border-bottom:4px solid var(--rescue);border-right:4px solid var(--rescue);border-radius:0 0 4px 0"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="main-scan-status" style="font-size:12px;color:var(--muted);text-align:center;margin-top:6px">Activation cam\u00E9ra...</div>';

      var video = document.getElementById('main-scan-video');
      var status = document.getElementById('main-scan-status');
      _mainVideo = video;

      var constraints = [
        { video: { facingMode: { exact: _camFacing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: _camFacing } },
        { video: true }
      ];

      var tryStream = function(idx) {
        if (idx >= constraints.length) {
          _mainStream = null;
          el.innerHTML = '<div style="padding:30px;text-align:center"><div style="color:var(--red);font-size:15px;margin-bottom:10px">\u26A0\uFE0F Cam\u00E9ra non disponible</div><div style="color:var(--muted);font-size:13px">Autorise la cam\u00E9ra dans ton navigateur<br>ou utilise le mode manuel</div></div>';
          return;
        }
        navigator.mediaDevices.getUserMedia(constraints[idx]).then(function(stream) {
          _mainStream = stream;
          _activeVideoTrack = stream.getVideoTracks()[0] || null;
          video.srcObject = stream;
          video.play().then(function() {
            if (status) status.textContent = '';
            var canvas = document.getElementById('main-scan-canvas');
            var ctx = canvas.getContext('2d', { willReadFrequently: true });
            function scanLoop() {
              if (!_mainStream || !video || video.readyState < 2) { _mainAnimFrame = requestAnimationFrame(scanLoop); return; }
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
              ctx.drawImage(video, 0, 0);
              if (typeof jsQR !== 'undefined' && !_qrCooldown) {
                var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
                if (code && code.data) {
                  var box = document.getElementById('main-scan-box');
                  if (box) { box.style.borderColor = 'var(--green)'; setTimeout(function() { if (box) box.style.borderColor = 'var(--gold)'; }, 400); }
                  V6Scanner.onQrSuccess(code.data);
                }
              }
              _mainAnimFrame = requestAnimationFrame(scanLoop);
            }
            _mainAnimFrame = requestAnimationFrame(scanLoop);
          });
        }).catch(function() {
          tryStream(idx + 1);
        });
      };
      tryStream(0);
    },

    /**
     * Swap between front and rear cameras
     */
    swapCamera: function() {
      _camFacing = (_camFacing === 'environment' ? 'user' : 'environment');
      V6Scanner.stopQrScanner();
      setTimeout(function() { V6Scanner.startQrScanner(); }, 300);
    },

    /**
     * Stop all scanner streams and animation frames
     */
    stopQrScanner: function() {
      if (_mainAnimFrame) { cancelAnimationFrame(_mainAnimFrame); _mainAnimFrame = null; }
      if (_mainStream) { _mainStream.getTracks().forEach(function(t) { t.stop(); }); _mainStream = null; }
      if (_mainVideo) { _mainVideo.srcObject = null; _mainVideo = null; }
      _activeVideoTrack = null;
      V6Scanner.stopJsQrLoop();
    },

    /**
     * Handle successful QR decode - match against ITEMS, trigger scanItem/scanGroup
     * @param {string} decoded - Decoded QR code data
     */
    onQrSuccess: function(decoded) {
      if (_qrCooldown) {
        var qrBox = document.getElementById('qr-reader');
        if (qrBox) { qrBox.style.outline = '3px solid var(--rescue)'; setTimeout(function() { qrBox.style.outline = ''; }, 200); }
        return;
      }
      _qrCooldown = true;
      var qrBoxOk = document.getElementById('qr-reader');
      if (qrBoxOk) { qrBoxOk.style.outline = '3px solid var(--green)'; setTimeout(function() { qrBoxOk.style.outline = ''; }, 350); }
      setTimeout(function() { _qrCooldown = false; }, 400);
      var itemId = decoded.trim();
      if (itemId.startsWith('VOLO|ITEM|')) itemId = itemId.split('|')[2];
      else if (itemId.indexOf('?id=') !== -1) itemId = itemId.split('?id=')[1].split('&')[0].trim();

      // Resolve CAT-xxx → GRP-xxx
      if (itemId.startsWith('CAT-') && typeof CAISSES !== 'undefined') {
        var _catName = itemId.replace(/^CAT-/, '').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
        var _resolved = CAISSES.find(function(c) {
          return (c.nom || c.name || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim() === _catName;
        });
        if (_resolved) itemId = _resolved.id;
      }
      if (itemId.startsWith('GRP-') || itemId.startsWith('CSURV-')) {
        var grp = typeof CAISSES !== 'undefined' ? CAISSES.find(function(g) { return g.id === itemId; }) : null;
        if (!grp) { V6UI.showToast('\u274C Groupe inconnu: ' + itemId, 'err'); return; }
        V6Scanner.stopQrScanner();
        if (window._caisseQrMode) {
          window._caisseQrMode = false;
          V6Engine.cmOpenDetail(grp.id);
          return;
        }
        V6Engine.scanGroup(grp);
        return;
      }

      var state = V6Engine.getState();
      var item = ITEMS.find(function(i) { return i.id === itemId; });
      if (item && !state.scanned.find(function(s) { return s.id === itemId; })) {
        V6Scanner.stopQrScanner();
        V6Engine.scanItem(itemId);
      }
    },

    /**
     * Open the quick scan test modal from home screen
     */
    openQuickScan: function() {
      if (document.getElementById('quickScanOverlay')) return;
      var overlay = document.createElement('div');
      overlay.id = 'quickScanOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:999;display:flex;flex-direction:column;align-items:center;padding:12px;overflow-y:auto;-webkit-overflow-scrolling:touch';
      overlay.innerHTML =
        '<div style="font-family:Oswald,sans-serif;font-size:16px;color:#E65100;letter-spacing:3px;margin:8px 0">\uD83D\uDCF7 SCANNER QR RAPIDE</div>' +
        '<div style="width:100%;max-width:350px;aspect-ratio:1;background:#111;border-radius:12px;overflow:hidden;position:relative;margin-bottom:8px">' +
          '<video id="qs-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>' +
          '<canvas id="qs-canvas" style="display:none"></canvas>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div id="qs-box" style="width:72%;max-width:260px;aspect-ratio:1;border:3px solid #D4A017;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.4);position:relative">' +
              '<div style="position:absolute;top:-3px;left:-3px;width:24px;height:24px;border-top:4px solid #E65100;border-left:4px solid #E65100;border-radius:4px 0 0 0"></div>' +
              '<div style="position:absolute;top:-3px;right:-3px;width:24px;height:24px;border-top:4px solid #E65100;border-right:4px solid #E65100;border-radius:0 4px 0 0"></div>' +
              '<div style="position:absolute;bottom:-3px;left:-3px;width:24px;height:24px;border-bottom:4px solid #E65100;border-left:4px solid #E65100;border-radius:0 0 0 4px"></div>' +
              '<div style="position:absolute;bottom:-3px;right:-3px;width:24px;height:24px;border-bottom:4px solid #E65100;border-right:4px solid #E65100;border-radius:0 0 4px 0"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="qs-status" style="font-size:12px;color:#C9BAA9;text-align:center;margin-bottom:8px">Activation cam\u00E9ra\u2026</div>' +
        '<div id="qs-result" style="width:100%;max-width:350px;text-align:center;margin-bottom:8px"></div>' +
        '<button id="qs-again-btn" onclick="V6Scanner.openQuickScan._again()" style="display:none;width:100%;max-width:350px;padding:12px;border-radius:10px;border:2px solid #E65100;background:rgba(230,81,0,.1);color:#E65100;font-family:Oswald,sans-serif;font-size:14px;cursor:pointer;min-height:48px;margin-bottom:8px">\uD83D\uDCF7 SCANNER UN AUTRE</button>' +
        '<button onclick="V6Scanner.openQuickScan._close()" style="padding:10px 24px;border-radius:10px;border:1px solid #555;background:transparent;color:#C9BAA9;font-size:14px;cursor:pointer;min-height:48px;margin-bottom:20px">FERMER</button>';
      document.body.appendChild(overlay);
      // Expose closures for onclick
      window._qsAgain = _qsAgain;
      window._closeQuickScan = _closeQuickScan;
      _qsStartCamera();
    },

    /**
     * Start QR scanner for caisse module
     * @returns {Promise<void>}
     */
    startCaisseQrScan: function() {
      window._caisseQrMode = true;
      return V6Scanner.startQrScanner();
    }
  };

  // Expose private helpers as global functions for onclick handlers in generated HTML
  window._qsAgain = _qsAgain;
  window._closeQuickScan = _closeQuickScan;

})(window);
