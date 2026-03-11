// ══════════════════════════════════════════
//  VOLO SST — Crypto Module (SHA-256)
//  Web Crypto API — zero dependency
//  Provides PIN hashing + migration douce
// ══════════════════════════════════════════

var VoloCrypto = (function() {
  'use strict';

  // Prefix to identify hashed values vs plaintext legacy
  var HASH_PREFIX = 'sha256:';

  // ── SHA-256 hash via Web Crypto API ──
  function sha256(input) {
    if (!input) return Promise.resolve('');
    var encoder = new TextEncoder();
    var data = encoder.encode(input);
    return crypto.subtle.digest('SHA-256', data).then(function(buf) {
      var arr = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, '0');
      }
      return HASH_PREFIX + hex;
    });
  }

  // ── Check if a stored value is already hashed ──
  function isHashed(value) {
    return typeof value === 'string' && value.indexOf(HASH_PREFIX) === 0;
  }

  // ── Compare a plaintext PIN against a stored (possibly hashed) value ──
  // Returns Promise<boolean>
  function verifyPin(plainPin, storedValue) {
    if (!plainPin || !storedValue) return Promise.resolve(false);
    // Legacy plaintext: direct compare
    if (!isHashed(storedValue)) {
      return Promise.resolve(plainPin === storedValue);
    }
    // Hashed: hash the input and compare
    return sha256(plainPin).then(function(hashed) {
      return hashed === storedValue;
    });
  }

  // ── Store a PIN as SHA-256 hash in localStorage ──
  function storePin(key, plainPin) {
    if (!plainPin) return Promise.resolve();
    return sha256(plainPin).then(function(hashed) {
      try { localStorage.setItem(key, hashed); } catch(e) {}
      return hashed;
    });
  }

  // ── Read + migrate: if old plaintext found, re-hash and overwrite ──
  // Returns Promise<{pin: string|null, migrated: boolean}>
  // pin = the plaintext PIN (if recoverable from legacy), null if hashed
  function readAndMigrate(key) {
    var stored;
    try { stored = localStorage.getItem(key); } catch(e) { return Promise.resolve({pin: null, migrated: false}); }
    if (!stored) return Promise.resolve({pin: null, migrated: false});

    if (isHashed(stored)) {
      // Already hashed — cannot recover plaintext
      return Promise.resolve({pin: null, migrated: false, hash: stored});
    }

    // Legacy plaintext detected — migrate
    return sha256(stored).then(function(hashed) {
      try { localStorage.setItem(key, hashed); } catch(e) {}
      return {pin: stored, migrated: true, hash: hashed};
    });
  }

  // ── Verify a plaintext PIN against what's stored in localStorage ──
  // Returns Promise<boolean>
  function verifyStoredPin(key, plainPin) {
    var stored;
    try { stored = localStorage.getItem(key); } catch(e) { return Promise.resolve(false); }
    return verifyPin(plainPin, stored);
  }

  // ── Hash the Team PIN (sync pre-compute for comparison) ──
  var _teamPinHash = null;
  function precomputeTeamPin(teamPin) {
    return sha256(teamPin).then(function(h) {
      _teamPinHash = h;
      return h;
    });
  }
  function getTeamPinHash() {
    return _teamPinHash;
  }

  // ══════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════

  return {
    sha256: sha256,
    isHashed: isHashed,
    verifyPin: verifyPin,
    storePin: storePin,
    readAndMigrate: readAndMigrate,
    verifyStoredPin: verifyStoredPin,
    precomputeTeamPin: precomputeTeamPin,
    getTeamPinHash: getTeamPinHash,
    HASH_PREFIX: HASH_PREFIX
  };

})();
