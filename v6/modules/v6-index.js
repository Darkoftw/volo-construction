/**
 * @module v6-index.js
 * @description Orchestrator - wires all V6 modules together and initializes the app
 * @version 6.0.0
 * @depends data.js
 * @depends v6-auth.js
 * @depends v6-data-bridge.js
 * @depends v6-scanner.js
 * @depends v6-ui.js
 * @depends v6-engine.js
 * @depends v6-km.js
 * @depends v6-certs.js
 * @depends v6-urgences.js
 *
 * Load order in HTML:
 *   1. data.js
 *   2. v6-data-bridge.js
 *   3. v6-auth.js
 *   4. v6-scanner.js
 *   5. v6-ui.js
 *   6. v6-km.js
 *   7. v6-certs.js
 *   8. v6-urgences.js
 *   9. v6-engine.js
 *  10. v6-index.js (this file — last)
 */
(function(window) {
  'use strict';

  /**
   * Bootstrap the V6 application
   * - Validates all modules are loaded
   * - Registers global event listeners
   * - Checks team PIN gate
   * - Initializes the engine
   */
  function bootstrap() {
    // 1. Verify all modules are loaded
    var modules = ['V6Data', 'V6Auth', 'V6Scanner', 'V6UI', 'V6Engine', 'V6Km', 'V6Certs', 'V6Urgences'];
    for (var i = 0; i < modules.length; i++) {
      if (!window[modules[i]]) {
        console.error('[V6] Missing module: ' + modules[i]);
        return;
      }
    }
    console.log('[V6] All modules loaded.');

    // 2. Register global event listeners
    registerEventListeners();

    // 3. Team PIN gate check
    if (!V6Auth.isTeamPinValid()) {
      V6Auth.showTeamPinGate();
      return;
    }

    // 4. Initialize engine (main entry point)
    V6Engine.init();

    console.log('[V6] App initialized — ' + V6UI.VOLO_VERSION);
  }

  /**
   * Register all global event listeners
   */
  function registerEventListeners() {
    // Inactivity lock
    var lockEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    for (var i = 0; i < lockEvents.length; i++) {
      document.addEventListener(lockEvents[i], V6Auth.resetLockTimer, { passive: true });
    }

    // Online/offline
    window.addEventListener('online', function() {
      V6Data.updateNetBadge();
      V6Data.flushQueue();
    });
    window.addEventListener('offline', function() {
      V6Data.updateNetBadge();
    });

    // PWA install
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      V6UI.setDeferredInstall(e);
    });
  }

  // ── Expose global convenience aliases for onclick handlers ──
  // These map HTML onclick="functionName()" to module methods.
  // Only expose what is actually called from HTML attributes.

  window.V6Boot = {
    bootstrap: bootstrap
  };

  // Auto-bootstrap on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})(window);
