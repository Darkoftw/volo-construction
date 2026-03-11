# AGENT 2 — ARCHITECTE — Rapport Complet
> VOLO SST V6 Migration — Module Skeletons — 2026-03-10

---

## Fichiers crees

| Fichier | Lignes | Taille | Description |
|---------|--------|--------|-------------|
| `v6-auth.js` | 196 | 5.6 KB | PIN gate, session, lock screen, onboarding tour |
| `v6-data-bridge.js` | 178 | 5.1 KB | localStorage helpers, backup, offline queue, history |
| `v6-scanner.js` | 159 | 4.3 KB | getUserMedia + jsQR scanner, quick scan modal |
| `v6-ui.js` | 300 | 9.2 KB | Dashboard, profil, photos, meteo, theme, PDF, chat FAB |
| `v6-engine.js` | 964 | 28.1 KB | State machine, wizard, Pick-On/Off, caisses, usage, chat |
| `v6-km.js` | 216 | 5.9 KB | Kilometrage, odometre, routing, gains |
| `v6-certs.js` | 160 | 5.7 KB | Certifications, formation, member history/stats |
| `v6-urgences.js` | 109 | 3.1 KB | Urgences, annonces, Firebase listeners |
| `v6-index.js` | 104 | 2.8 KB | Orchestrateur, bootstrap, event listeners |
| **TOTAL** | **2386** | **69.8 KB** | |

---

## Fonctions par module

### v6-auth.js — 21 fonctions

**Public (V6Auth):** 19 fonctions
- `isTeamPinValid()`, `showTeamPinGate()`, `logUnauthorizedAccess(reason)`
- `isUserSurv()`, `isUserChef()`
- `resetLockTimer()`, `lockScreen()`, `unlockScreen()`
- `checkRateLimit()`, `completePinLogin(profile)`, `failPinLogin()`, `onPinContinue()`
- `resetAll()`, `doLogout()`
- `shouldShowTour()`, `showTour()`, `nextTourStep()`, `completeTour()`, `closeTour()`

**Private:** 2 fonctions
- `_tpRender()`, `_renderTourStep(step)`

**Constants:** `TEAM_PIN`, `TEAM_PIN_MAX_ATTEMPTS`, `TEAM_PIN_EXPIRY_DAYS`, `LOCK_DELAY`

---

### v6-data-bridge.js — 19 fonctions

**Public (V6Data):** 19 fonctions
- `safeGetLS(key, fallback)`, `safeSetLS(key, val)`
- `exportBackup()`, `importBackup()`
- `appendAuditLog(payload)`, `getAuditLog()`
- `parseFlexDate(str)`
- `getHistory()`, `saveToHistory(payload)`, `getActiveItems()`, `getMyActivePickOns()`, `getActiveDeployments()`
- `getTerrainContacts()`, `saveTerrainContact(destId, contact)`, `loadTerrainContact(destId)`
- `escapeHtml(s)`, `sanitizeCSV(s)`, `tsNow()`
- `updateNetBadge()`, `flushQueue()`

**Private:** 0

---

### v6-scanner.js — 16 fonctions

**Public (V6Scanner):** 9 fonctions
- `startJsQrLoop()`, `stopJsQrLoop()`
- `detectCameraDevices()`, `startQrScanner()`, `swapCamera()`, `stopQrScanner()`
- `onQrSuccess(decoded)`
- `openQuickScan()`
- `startCaisseQrScan()`

**Private:** 7 fonctions
- `_jsqrLoopFn()`, `_scanLoop()`
- `_qsStartCamera()`, `_qsStopCamera()`, `_qsOnDetect(decoded)`, `_qsAgain()`, `_closeQuickScan()`

---

### v6-ui.js — 30 fonctions

**Public (V6UI):** 30 fonctions
- `renderVersionFooter()`, `renderWeatherWidget(w)`, `fetchWeather()`
- `timeAgo(timestamp)`, `timeClass(timestamp)`, `playEagleCry()`
- `renderDashboard()`, `renderDashboardPhotos()`, `renderHistory()`
- `renderActivePickOnBanner()`, `renderPickoffSelect()`, `selectPickoffDeployment(idx)`
- `checkOverdueItems()`, `getEquipmentAlerts()`, `checkExpirations()`
- `renderChefDashboard()`
- `toggleThemeMain()`, `pwaInstall()`, `setDeferredInstall(e)`
- `openProfile(userId)`, `handleProfilePhoto(input, userId)`, `saveProfile(userId)`
- `renderAnnouncementBanner()`, `renderUrgencyBanner()`, `getAnnouncementBannerHtml()`, `getUrgencyBannerHtml()`
- `generateAuditPDF()`
- `triggerPhoto()`, `handlePhoto(input)`, `initTeamCarousel()`
- `renderChatFab()`, `updateChatFab()`

**Private:** 0 (internal state via closure vars only)

---

### v6-engine.js — 109 fonctions (42 core + 14 caisse + 18 usage + 35 chat)

**Public (V6Engine):** 105 fonctions

*Core state machine (42):*
- `init()`, `getState()`
- `debounceInput(key, fn, delay)`, `setField(key, val)`, `updateItemResults(val)`, `updatePersonnelResults(val)`
- `setState(updates)`, `render(stepChanged)`, `getStepLabel()`, `renderWizardProgress()`, `renderStep()`
- `renderAccueil()`, `renderPin()`, `toggleRemorque(id)`, `renderRemorque()`, `renderDepot()`, `renderDest()`
- `renderSauvs()`, `renderScan()`
- `getChecklistItems(isPickoff)`, `toggleChecklist(id)`, `isChecklistComplete(isPickoff)`, `renderPreChecklist(isPickoff)`
- `renderConfirm()`, `removeScannedItem(idx)`, `toggleScannedGroup(groupKey)`
- `showTxDetail(txId)`, `syncTxToFirestore(payload)`
- `renderValidation()`, `renderModal()`
- `scanGroup(grp)`, `updateCaisseStatut(grpId, statut)`
- `handlePin(d)`, `toggleSauv(id)`, `scanItem(id)`
- `startPickOn()`, `startPickOff()`, `doValidation()`, `startCancelTimer()`, `cancelTransaction()`

*Caisse module (14):*
- `isStockManager()`, `getCaisseStock()`, `saveCaisseStock(stock)`, `getCaisseItems(grpId)`
- `initCaisseStock(grpId)`, `sendStockWebhook(payload)`, `getStockHistory(grpId)`, `saveStockHistory(grpId, entry)`
- `openCaisseModule()`, `cmTab(id, btn)`, `cmRenderGlobal()`, `cmRenderCaisses(search)`, `cmOpenDetail(grpId)`, `cmBackToCaisses()`

*Usage tracker (18):*
- `goToUsageTracker()`, `getUsageLog()`, `saveUsageLog(log)`, `getActiveUsageSession()`, `saveActiveUsageSession(s)`
- `getItemUsage(itemId)`, `startUsageSession()`, `getItemConditions()`, `saveItemCondition(itemId, cond, note)`
- `stopUsageSession()`, `confirmStopUsage()`, `showManualUsageEntry()`, `confirmManualUsage()`
- `getItemMissionCount(itemId)`, `startUsageTimer()`, `renderUsageIndicator()`, `toggleUsageItem(itemId)`, `renderUsageTracker()`

*Chat system (35):*
- `chatGetCurrentUser()`, `chatColor(uid)`, `chatInitials(name)`, `chatTimeAgo(ts)`, `chatDayLabel(ts)`
- `chatDbPath()`, `chatGetDmUnread(targetId)`, `chatLoadDmCache()`
- `chatStartListening()`, `chatStopListening()`, `chatLoadLocal()`, `chatSaveLocal()`
- `chatSend()`, `chatReact(msgId, emoji)`, `chatPin(msgId)`, `chatUnpin(msgId)`
- `chatProcessMentions(text)`, `chatSwitchChannel(channel)`, `chatOpenDM(targetId, targetName)`, `chatBackToGeneral()`
- `renderMainChat()`, `initMainChatUI()`, `chatRenderFull()`, `chatRenderMessages()`, `chatScrollBottom()`
- `chatOnInput(el)`, `chatInsertMention(firstName)`, `chatOnKeydown(e)`
- `chatShowDMList()`, `chatRenderDMList()`, `chatFilterDM(val)`
- `chatStartBackgroundListener()`

**Private:** 4 fonctions
- `_setVehicleCamion(id)`, `_setVehicleTrailer(id)`, `_scanGroupExecute(missingNote)`, `_finalizeScanItem(stamped, sceaux, isPickoff)`

**Constants:** `VOLO_WH_M`, `VOLO_WH_U`, `STOCK_WEBHOOK`, `STOCK_MANAGERS`, `CHECKLIST_PICKON`, `CHECKLIST_PICKOFF`, `USAGE_CONDITIONS`, `CHAT_COLORS`, `CHAT_MONTHS`

---

### v6-km.js — 25 fonctions

**Public (V6Km):** 25 fonctions
- `getKmLogs()`, `saveKmLog(log)`, `getUserHomeKey()`, `getUserHome()`, `saveUserHome(addr)`
- `geocodeAddress(query)`, `calcRouteKm(from, to)`, `autoCalcRoute()`, `saveHomeAndRecalc()`, `updateKmDisplay()`
- `hasPointageToday()`, `hasKmToday()`, `getOpenDeployment()`, `submitKmRetour()`, `submitKm()`, `doSubmitKm()`
- `getOdoLogs()`, `saveOdoLog(log)`, `getOpenOdo()`, `submitOdoDepart()`, `submitOdoRetour()`, `doSubmitOdoRetour()`
- `renderKmTracking()`, `getAutoGains(user)`, `renderMesGains()`

**Private:** 0 (internal state via closure vars)

---

### v6-certs.js — 14 fonctions

**Public (V6Certs):** 14 fonctions + CERTS_DEFS constant
- `getCerts(voloId)`, `setCert(voloId, certId, dateStr)`, `getCertStatus(dateStr, durMonths)`
- `renderCertSection(voloId)`, `getCertAlerts()`
- `getMemberHistory(voloId)`, `getMemberPointage(voloId)`, `getMemberStats(voloId, days)`, `renderMemberTimeline(voloId)`
- `certStatus(certId, userId)`, `renderFormation()`, `renderMyCerts(user)`, `saveMyCert(userId, certId, val)`, `renderTeamCerts()`

**Private:** 0

---

### v6-urgences.js — 12 fonctions

**Public (V6Urgences):** 12 fonctions
- `getAnnouncement()`, `getUrgencyAlert()`
- `sendUrgence()`, `loadAnnouncement()`, `stopAnnouncementListeners()`
- `showAnnouncementModal()`, `saveAnnouncement()`, `deleteAnnouncement()`
- `triggerUrgencyAlert()`, `liftUrgencyAlert()`
- `showUrgence()`, `confirmClear(lsKey, msg, cb)`

**Private:** 4 variables (voloAnnouncement, voloUrgencyAlert, _announcementListener, _urgencyListener)

---

### v6-index.js — Orchestrateur

**Public (V6Boot):** 1 fonction
- `bootstrap()`

**Private:** 1 fonction
- `registerEventListeners()`

---

## Compteurs totaux

| Categorie | Nombre |
|-----------|--------|
| Fichiers crees | 9 |
| Fonctions publiques | 229 |
| Fonctions privees | 13 |
| **Fonctions totales** | **242** |
| Constantes exposees | 14 |
| Lignes total | 2386 |
| Taille totale | 69.8 KB |

---

## Graphe de dependances inter-modules

```
data.js (ITEMS, PERSONNEL, CAISSES, DEPOTS, DESTINATIONS, REMORQUES, BAREMES, SAC_COLORS)
  |
  v
v6-data-bridge.js (V6Data)
  |   - safeGetLS, safeSetLS, escapeHtml, tsNow
  |   - getHistory, saveToHistory, getActiveItems, getActiveDeployments
  |   - flushQueue, updateNetBadge
  |
  +-------> v6-auth.js (V6Auth)
  |           - isUserChef, isUserSurv, resetLockTimer
  |           - showTeamPinGate, isTeamPinValid
  |
  +-------> v6-scanner.js (V6Scanner)
  |           - startQrScanner, stopQrScanner, onQrSuccess
  |           - depends on: jsQR (CDN), v6-engine (scanItem, scanGroup)
  |
  +-------> v6-certs.js (V6Certs)
  |           - getCerts, setCert, getCertStatus, renderCertSection
  |           - getMemberHistory, getMemberStats
  |
  +-------> v6-km.js (V6Km)
  |           - getKmLogs, getAutoGains, renderKmTracking, renderMesGains
  |           - depends on: v6-engine (state)
  |
  +-------> v6-urgences.js (V6Urgences)
  |           - loadAnnouncement, sendUrgence, showUrgence
  |           - depends on: v6-engine (state, setState), v6-auth (isUserChef)
  |
  +-------> v6-ui.js (V6UI)
  |           - renderDashboard, renderHistory, renderChefDashboard
  |           - fetchWeather, toggleThemeMain, openProfile
  |           - depends on: v6-auth, v6-certs, v6-engine, v6-data-bridge
  |
  +-------> v6-engine.js (V6Engine) [CENTRAL]
              - state, setState, render, renderStep
              - All wizard steps, Pick-On/Off, validation, chat
              - depends on: ALL other modules
              |
              v
            v6-index.js (V6Boot) [ORCHESTRATOR]
              - bootstrap(), registerEventListeners()
              - depends on: ALL modules
```

### Dependances circulaires potentielles
- `v6-scanner` --> `v6-engine` (scanItem, scanGroup) ET `v6-engine` --> `v6-scanner` (startQrScanner, stopQrScanner)
- `v6-urgences` --> `v6-engine` (setState) ET `v6-engine` --> `v6-urgences` (loadAnnouncement)
- **Resolution** : Pas de probleme en IIFE pattern car les references sont resolues au runtime (appel), pas au chargement. L'ordre de chargement suffit a garantir que `window.V6Scanner` etc. existent avant le premier appel.

---

## Ordre de chargement recommande pour index.html

```html
<!-- 1. Donnees -->
<script src="data.js"></script>

<!-- 2. Couche donnees (aucune dep module) -->
<script src="v6/modules/v6-data-bridge.js"></script>

<!-- 3. Auth (depend de V6Data) -->
<script src="v6/modules/v6-auth.js"></script>

<!-- 4. Scanner (depend de V6Engine au runtime seulement) -->
<script src="v6/modules/v6-scanner.js"></script>

<!-- 5. UI (depend de V6Data, V6Auth) -->
<script src="v6/modules/v6-ui.js"></script>

<!-- 6. KM (depend de V6Data, V6Engine au runtime) -->
<script src="v6/modules/v6-km.js"></script>

<!-- 7. Certs (depend de V6Data) -->
<script src="v6/modules/v6-certs.js"></script>

<!-- 8. Urgences (depend de V6Data, V6Auth, V6Engine au runtime) -->
<script src="v6/modules/v6-urgences.js"></script>

<!-- 9. Engine (depend de TOUS — charge apres tous les modules) -->
<script src="v6/modules/v6-engine.js"></script>

<!-- 10. Orchestrateur (charge en dernier, declenche bootstrap) -->
<script src="v6/modules/v6-index.js"></script>
```

---

## Validation

- `node --check` : **9/9 PASS**
- Aucune syntaxe ES6 module (import/export)
- Aucune dependance npm
- Tous les throw Error('NOT_IMPLEMENTED') en place
- JSDoc sur chaque fonction publique
- Fonctions internes encapsulees dans IIFE (non exposees sur window)

---

*AGENT 2 — ARCHITECTE — Rapport termine — 2026-03-10*
*9 fichiers crees, 242 fonctions declarees, 0 logique implementee.*
