# AGENT 4 — INTEGRATEUR Report

## What Changed Between index.html and v6/index.html

### Main Change: Inline JS Replaced by Module Imports
- **Removed**: Lines 1127-8702 of the original (two `<script>` blocks containing ~7576 lines of inline JavaScript)
  - Block 1 (lines 1127-1415): VOLO_WH constants, Team PIN gate, backup, weather, localStorage helpers, JOB 7 dead code cleanup
  - Block 2 (lines 1416-8702): LOGO constant, state management, all render functions, scanner, certs, KM, urgences, gains, formation, chef dashboard, onboarding tour, theme toggle
- **Replaced with**: 9 external `<script src="modules/v6-*.js">` tags

### Asset Path Updates (v6/ is a subdirectory)
All local file references updated from relative-to-root to `../` prefix:

| Original Path | Updated Path |
|---|---|
| `manifest.json` | `../manifest.json` |
| `firebase-config.js` | `../firebase-config.js` |
| `firebase-service.js` | `../firebase-service.js` |
| `volo-crypto.js` | `../volo-crypto.js` |
| `volo-network.js` | `../volo-network.js` |
| `eagle_crown.jpg` (splash) | `../eagle_crown.jpg` |
| `eagle_crown.jpg` (PWA banner) | `../eagle_crown.jpg` |
| `eagle.mp3` | `../eagle.mp3` |
| `error-monitor.js?v=20` | `../error-monitor.js?v=20` |
| `data-inventory.js?v=20` | `../data-inventory.js?v=20` |
| `data-personnel-stub.js?v=20` | `../data-personnel-stub.js?v=20` |
| `logo.js?v=20` | `../logo.js?v=20` |
| `/sw.js` | `/sw.js` (kept absolute) |

### Preserved Intact
- All CSS styles (lines 16-865, two `<style>` blocks)
- CDN script tags (jsQR, html2pdf, Firebase compat x6)
- Splash screen HTML (lines 880-963)
- Splash canvas IIFE script (lines 965-1111)
- Body HTML elements: `#splashOverlay`, `#eaglecry`, `#photoInput`, `#teamPinGate`, `#app`, `#lock-screen`
- Theme toggle HTML (lines 1142-1145)
- PWA/VoloNetwork bottom script (lines 1146-1159, paths updated)

## Script Load Order (v6/index.html)

1. `jsQR@1.4.0` (CDN) — QR code scanning
2. `html2pdf.js@0.10.1` (CDN) — PDF export
3. `firebase-app-compat.js` (CDN) — Firebase core
4. `firebase-auth-compat.js` (CDN) — Firebase auth
5. `firebase-firestore-compat.js` (CDN) — Firestore
6. `firebase-database-compat.js` (CDN) — Realtime DB
7. `firebase-storage-compat.js` (CDN) — Storage
8. `firebase-messaging-compat.js` (CDN) — Messaging
9. `../firebase-config.js` — Firebase config
10. `../firebase-service.js` — Firebase service layer
11. `../volo-crypto.js` — Encryption utilities
12. `../volo-network.js` — Network/offline handling
13. *(inline)* Splash session check (lines 886-892)
14. *(inline)* Splash canvas IIFE (lines 965-1111)
15. `../error-monitor.js` — Error monitoring
16. `../data-inventory.js` — Items, caisses, categories, depots, etc.
17. `../data-personnel-stub.js` — Personnel array (156 members)
18. `../logo.js` — VOLO_LOGO_B64 constant
19. `modules/v6-data-bridge.js` — Data bridge (ITEMS_MAP, helpers)
20. `modules/v6-auth.js` — PIN auth, Team PIN gate
21. `modules/v6-scanner.js` — QR scanner (getUserMedia + jsQR)
22. `modules/v6-certs.js` — Certifications CRUD
23. `modules/v6-km.js` — Kilom module
24. `modules/v6-urgences.js` — Urgences module
25. `modules/v6-ui.js` — UI rendering (toasts, modals, etc.)
26. `modules/v6-engine.js` — State machine, render dispatch
27. `modules/v6-index.js` — Main orchestrator, init
28. *(inline)* VoloNetwork.init + SW register + PWA banner (lines 1146-1159)

## File Size Comparison

| Metric | Original index.html | v6/index.html |
|---|---|---|
| Lines | 8,723 | 1,161 |
| File size | 903,010 bytes (882 KB) | 84,120 bytes (82 KB) |
| Reduction | — | **90.7% smaller** |
| CSS lines | ~849 | ~849 (identical) |
| Inline JS lines | ~7,576 | 0 (moved to 9 modules) |
| Module scripts | 0 | 9 |

## Risk Points

1. **Global variable scope**: All modules use plain `<script>` tags (not ES modules), so they share the global scope. Load order is critical — `v6-data-bridge.js` must load first, `v6-index.js` must load last.

2. **Cross-module dependencies**: Functions like `render()`, `setState()`, `showToast()`, `escapeHtml()` must be globally available. If any module defines a function that another module calls, the defining module must load first.

3. **Asset paths in JS strings**: The modules contain hardcoded references to assets like `eagle_crown.jpg`, `eagle_tactic.png`, `photos/team/*`, `caisses-stock.html`, `pointage.html`, etc. These paths are relative to the HTML file's location (v6/), so they need `../` prefix inside the module JS code. **This must be verified in each v6-*.js module.**

4. **Splash script intact**: The splash canvas IIFE (lines 965-1111) and `dismissSplash()` function are kept inline. The `dismissSplash` function must remain global since it's called from an `onclick` attribute.

5. **Service Worker path**: `/sw.js` uses an absolute path which will work regardless of subdirectory, but the SW scope will be `/` not `/v6/`.

6. **PWA manifest path**: Updated to `../manifest.json` but the manifest's `start_url` and `scope` may point to `/index.html` rather than `/v6/index.html`.

7. **Theme toggle**: `toggleThemeMain()` function was in the removed inline JS block. It must be defined in one of the v6 modules (likely `v6-ui.js` or `v6-index.js`), otherwise the theme button will throw a ReferenceError.

8. **`unlockScreen()` function**: Referenced in `onclick` on line 1121. Must be defined in a module.

9. **`handlePhoto(this)` function**: Referenced in `onchange` on line 1114. Must be defined in a module.
