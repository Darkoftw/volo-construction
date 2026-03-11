# AGENT 1 — EXTRACTEUR — Rapport Complet
> VOLO SST V6 Migration · index.html 8583 lignes · 2026-03-10

---

## Structure du fichier index.html

| Section | Lignes | Contenu |
|---------|--------|---------|
| HTML/CSS (head + styles) | 1–960 | DOCTYPE, meta, styles inline (~960 lignes CSS) |
| Splash screen script | 961–1100 | Animation canvas trou noir (autonome) |
| Main `<script>` block | 1116–8562 | **Toute la logique app** (~7446 lignes JS) |
| PWA/SW script | 8568–8581 | Service Worker + install banner |
| Theme toggle HTML | 8564–8567 | Bouton fixe thème |

---

## Inventaire des fonctions JS (index.html)

### MODULE: v6-auth (Authentification, PIN, Sécurité) — 21 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `isTeamPinValid()` | 1130 | Vérifie validité PIN équipe (30 jours) | localStorage `volo_team_pin_ts` |
| `showTeamPinGate()` | 1139 | Affiche keypad PIN équipe | `logUnauthorizedAccess`, DOM |
| `_tpRender()` | 1165 | (interne) Render dots/keypad PIN gate | closure vars |
| `logUnauthorizedAccess(reason)` | 1187 | Log accès non autorisé → LS + Firebase | localStorage `volo_unauth_log`, `firebase.database()` |
| `isUserSurv()` | 1432 | Vérifie si user est SURVEILLANT | localStorage `volo_last_role` |
| `isUserChef()` | 1438 | Vérifie si user est CHEF | `PERSONNEL`, `state.pin` |
| `resetLockTimer()` | 1457 | Reset timer inactivité 5min | `lockTimeout`, `LOCK_DELAY` |
| `lockScreen()` | 1470 | Affiche écran verrouillage | DOM |
| `unlockScreen()` | 1476 | Cache écran verrouillage | `resetLockTimer` |
| `checkRateLimit()` | 5331 | Anti brute-force PIN | localStorage `volo_failed_attempts`, `volo_lock_until` |
| `_completePinLogin(profile)` | 5350 | Complète login PIN, set session | localStorage (pin, role, etc.), `setState` |
| `_failPinLogin()` | 5374 | Gère échec PIN | localStorage `volo_failed_attempts` |
| `onPinContinue()` | 5381 | Handler soumission PIN | `PERSONNEL`, `VoloData.findByVolo`, `VoloAuth.loginPin`, `checkRateLimit` |
| `resetAll()` | 6820 | Reset wizard gardant PIN | `stopQrScanner`, `cancelTimer`, `setState` |
| `doLogout()` | 6821 | Logout complet | `stopQrScanner`, `chatStopListening`, `stopAnnouncementListeners`, localStorage |
| `shouldShowTour()` | 8476 | Check si tour onboarding nécessaire | localStorage `volo_onboarding_*` |
| `showTour()` | 8484 | Démarre tour onboarding | `_renderTourStep`, `TOUR_STEPS` |
| `_renderTourStep()` | 8492 | Render étape tour courante | `TOUR_STEPS`, `_tourStep` |
| `nextTourStep()` | 8515 | Avance tour | `_tourStep`, `completeTour` |
| `completeTour()` | 8521 | Marque tour complété | localStorage, Firebase |
| `closeTour()` | 8535 | Ferme tour | localStorage |

---

### MODULE: v6-data-bridge (Données, localStorage, backup, queue offline) — 19 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `safeGetLS(key, fallback)` | 1206 | Lecture sûre localStorage + JSON parse | localStorage |
| `safeSetLS(key, val)` | 1210 | Écriture sûre localStorage + JSON stringify | localStorage |
| `exportBackup()` | 1214 | Export toutes clés `volo_*` en JSON | localStorage |
| `importBackup()` | 1227 | Import backup JSON, restore toutes clés | localStorage, `render` |
| `appendAuditLog(payload)` | 1487 | Ajoute au log d'audit append-only | localStorage `volo_audit_log` |
| `getAuditLog()` | 1495 | Lit log d'audit | localStorage `volo_audit_log` |
| `parseFlexDate(str)` | 1535 | Parse dates flexibles (MM/YYYY, DD/MM/YYYY) | aucune |
| `getHistory()` | 1572 | Obtient historique transactions | localStorage `volo_history` |
| `saveToHistory(payload)` | 1575 | Sauvegarde transaction + update caisse history | localStorage `volo_history`, `volo_caisse_history` |
| `getActiveItems()` | 1597 | Items actuellement déployés | `getHistory` |
| `getMyActivePickOns()` | 1623 | PICK-ONs actifs du user courant | `PERSONNEL`, `getActiveDeployments` |
| `getActiveDeployments()` | 1630 | Tous les déploiements non clôturés | `getHistory` |
| `getTerrainContacts()` | 2618 | Contacts terrain sauvegardés | localStorage `volo_terrain_contacts` |
| `saveTerrainContact()` | 2619 | Sauve contact terrain pour destination | localStorage |
| `loadTerrainContact(destId)` | 2628 | Charge contact pour destination | `getTerrainContacts` |
| `escapeHtml(s)` | 4085 | Échappement XSS | aucune |
| `sanitizeCSV(s)` | 4086 | Prévention injection CSV | aucune |
| `tsNow()` | 4087 | Timestamp ISO courant | aucune |
| `updateNetBadge()` | 6850 | Met à jour indicateur online/offline | DOM, `navigator.onLine` |
| `flushQueue()` | 6860 | Envoie transactions offline en attente | localStorage `volo_queue`, `fetch` |

---

### MODULE: v6-scanner (Scan QR, caméra) — 16 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `startJsQrLoop()` | 3548 | Démarre loop jsQR secondaire (QR inversés) | `jsQR`, `onQrSuccess` |
| `loop()` (interne) | 3553 | Loop de traitement frame jsQR | `qrCooldown`, `jsQR` |
| `stopJsQrLoop()` | 3581 | Arrête loop jsQR secondaire | `_jsqrLoop` |
| `detectCameraDevices()` | 3591 | Énumère caméras, trouve arrière/avant | `navigator.mediaDevices` |
| `startQrScanner()` | 3613 | Démarre scanner principal getUserMedia + jsQR | `_mainStream`, `_camFacing`, `jsQR` |
| `scanLoop()` (interne) | 3656 | Détection QR frame par frame | `jsQR`, `_mainStream` |
| `swapCamera()` | 3680 | Bascule caméra avant/arrière | `_camFacing`, `stopQrScanner` |
| `stopQrScanner()` | 3686 | Arrête tous les flux scanner | `_mainStream`, `_mainAnimFrame` |
| `onQrSuccess(decoded)` | 3695 | Handle résultat QR → match ITEMS | `ITEMS`, `scanItem`, `scanGroup` |
| `openQuickScan()` | 3889 | Ouvre modal scan rapide test | DOM, `_qsStartCamera` |
| `_qsStartCamera()` | 3915 | Démarre caméra scan rapide | `getUserMedia`, `jsQR` |
| `_qsStopCamera()` | 3963 | Arrête caméra scan rapide | `_qsStream` |
| `_qsOnDetect(decoded)` | 3968 | Handle détection scan rapide | `ITEMS`, DOM |
| `_qsAgain()` | 4016 | Reset scan rapide | `_qsStartCamera` |
| `_closeQuickScan()` | 4023 | Ferme modal scan rapide | `_qsStopCamera` |
| `startCaisseQrScan()` | 6679 | Démarre scan QR module caisses | `getUserMedia`, `jsQR` |

---

### MODULE: v6-engine (Moteur principal, wizard, state machine) — 42 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `debounceInput(key, fn, delay)` | 1794 | Debounce utilitaire | `_db` |
| `setField(key, val)` | 1799 | Update champ state sans re-render | `state` |
| `updateItemResults(val)` | 1802 | Update partiel DOM résultats items | `ITEMS`, `state`, `scanItem` |
| `updatePersonnelResults(val)` | 1820 | Update partiel DOM résultats personnel | `PERSONNEL`, `state` |
| `setState(updates)` | 1842 | Merge state + re-render + persist wizard | `state`, `render`, `resetLockTimer` |
| `render(stepChanged)` | 1859 | Dispatcher render principal | `renderStep`, `renderModal`, tous render* |
| `initTeamCarousel()` | 1948 | Init carousel photos équipe | DOM, `_carouselTimer` |
| `getStepLabel()` | 1973 | Label étape courante | `state.step` |
| `renderWizardProgress()` | 1979 | Render barre progression wizard | `state.step` |
| `renderStep()` | 2005 | Dispatch vers render* par étape | `state.step`, tous render* |
| `renderAccueil()` | 2028 | Render accueil (step 0) | Nombreuses dépendances |
| `renderPin()` | 2499 | Render écran PIN (step 1) | `state.pin`, `handlePin` |
| `toggleRemorque(id)` | 2529 | Toggle sélection véhicule | `state.remorques` |
| `_setVehicleCamion(id)` | 2535 | Set sélection camion | `setState` |
| `_setVehicleTrailer(id)` | 2540 | Set sélection remorque | `setState` |
| `renderRemorque()` | 2545 | Render sélection véhicule (step 2) | `REMORQUES` |
| `renderDepot()` | 2580 | Render sélection dépôt (step 3) | `DEPOTS` |
| `renderDest()` | 2594 | Render sélection destination (step 4) | `DESTINATIONS` |
| `renderSauvs()` | 2638 | Render sélection personnel (step 5) | `PERSONNEL` |
| `renderScan()` | 2671 | Render écran scan items (step 6) | `ITEMS`, scanner |
| `getChecklistItems(isPickoff)` | 2864 | Obtient checklist pour mode | `CHECKLIST_PICKON/OFF` |
| `toggleChecklist(id)` | 2865 | Toggle item checklist | `state.checklist` |
| `isChecklistComplete(isPickoff)` | 2870 | Vérifie si checklist complète | `getChecklistItems` |
| `renderPreChecklist(isPickoff)` | 2874 | Render checklist pré-départ/retour | `getChecklistItems` |
| `renderConfirm()` | 2893 | Render écran confirmation (step 7) | `state`, `DEPOTS`, `DESTINATIONS` |
| `removeScannedItem(idx)` | 2977 | Retirer item de la liste scannée | `state.scanned` |
| `toggleScannedGroup(groupKey)` | 2983 | Toggle expand/collapse groupe scanné | `state._expandedScannedGroups` |
| `showTxDetail(txId)` | 2991 | Affiche détail transaction | `setState` |
| `syncTxToFirestore(payload)` | 2997 | Sync transaction vers Firebase | `firebaseDB` |
| `renderValidation()` | 3006 | Render écran succès (step 8) | `lastPayload`, `cancelSeconds` |
| `renderModal()` | 3069 | Render modal active | `state.showModal` |
| `scanGroup(grp)` | 3747 | Scanner caisse/groupe entier | `CAISSES`, `ITEMS` |
| `_scanGroupExecute(missingNote)` | 3771 | Exécute scan groupe après confirmation | `state.scanned`, `updateCaisseStatut` |
| `updateCaisseStatut(grpId, statut)` | 3810 | Met à jour statut caisse en LS | localStorage `volo_caisse_statuts` |
| `handlePin(d)` | 3842 | Handle digit PIN | `state.pin` |
| `toggleSauv(id)` | 3843 | Toggle sélection sauveteur | `state.sauvs` |
| `scanItem(id)` | 3844 | Scanner item individuel | `ITEMS`, `state.scanned` |
| `_finalizeScanItem(stamped, sceaux, isPickoff)` | 3869 | Finalise scan avec vérifications modales | `state` |
| `startPickOn()` | 5162 | Démarre flux PICK-ON (avec guard double-pick) | `getMyActivePickOns` |
| `startPickOff()` | 5172 | Démarre flux PICK-OFF | `setState` |
| `doValidation()` | 5179 | Exécute validation + envoi transaction | `fetch`, `saveToHistory`, `appendAuditLog`, webhook |
| `startCancelTimer()` | 5301 | Démarre countdown annulation 5min | `cancelTimer`, `cancelSeconds` |
| `cancelTransaction()` | 5316 | Annule dernière transaction | `lastPayload`, webhook |

---

### MODULE: v6-ui (Rendu, dashboard, profils, thème) — 28 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `renderVersionFooter()` | 1249 | Render pied de page version | `VOLO_VERSION` |
| `renderWeatherWidget(w)` | 1273 | Render widget météo HTML | weather data |
| `timeAgo(timestamp)` | 1767 | Temps écoulé lisible | aucune |
| `timeClass(timestamp)` | 1776 | Classe CSS selon temps écoulé | aucune |
| `playEagleCry()` | 1783 | Joue son aigle | DOM `#eaglecry` |
| `renderDashboard()` | 3273 | Render dashboard (step 9) | `ITEMS`, `getActiveItems`, `getHistory` |
| `renderDashboardPhotos()` | 3427 | Render photos dans dashboard | `getSetupPhotos` |
| `renderHistory()` | 3452 | Render historique transactions (step 10) | `getHistory` |
| `renderActivePickOnBanner()` | 1644 | Render bandeau pick-on actif | `getMyActivePickOns` |
| `renderPickoffSelect()` | 1665 | Render sélecteur déploiement pickoff | `getActiveDeployments` |
| `selectPickoffDeployment(idx)` | 1703 | Sélectionne déploiement pour pickoff | `getActiveDeployments`, `CAISSES`, `ITEMS` |
| `checkOverdueItems()` | 1754 | Vérifie items en retard (>24h) | `getActiveItems` |
| `getEquipmentAlerts()` | 1500 | Alertes équipement (expiry, inspection) | `ITEMS`, `parseFlexDate` |
| `checkExpirations()` | 1554 | Vérif expirations items <90 jours | `ITEMS`, `parseFlexDate` |
| `renderChefDashboard()` | 8308 | Render dashboard chef avec KPIs | `PERSONNEL`, `CAISSES`, agenda/chat |
| `toggleThemeMain()` | 8552 | Toggle thème light/dark | localStorage `volo_theme_main` |
| `pwaInstall()` | 8580 | Trigger installation PWA | `_deferredInstall` |
| `openProfile(userId)` | 6740 | Ouvre modal profil membre | `PERSONNEL`, `getMemberHistory`, `renderCertSection` |
| `handleProfilePhoto(input, userId)` | 6800 | Handle upload photo profil | localStorage `volo_avatar_*` |
| `saveProfile(userId)` | 6812 | Sauve bio/embauche profil | localStorage `volo_bio_*` |
| `renderAnnouncementBanner()` | 8290 | Render bannière annonce | `voloAnnouncement` |
| `renderUrgencyBanner()` | 8297 | Render bannière urgence | `voloUrgencyAlert` |
| `getAnnouncementBannerHtml()` | 8262 | Génère HTML bannière annonce | `voloAnnouncement` |
| `getUrgencyBannerHtml()` | 8275 | Génère HTML bannière urgence | `voloUrgencyAlert` |
| `generateAuditPDF()` | 5866 | Génère PDF audit QA complet | `html2pdf`, `VOLO_LOGO_B64` |
| `fetchWeather()` | 1260 | Fetch météo Open-Meteo API | `fetch`, `safeGetLS/SetLS` |
| `triggerPhoto()` | 4134 | Trigger input fichier photo | DOM |
| `handlePhoto(input)` | 4135 | Handle capture photo, resize base64 | Canvas, FileReader |

---

### MODULE: v6-km (Kilométrage, routing, gains) — 25 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `getKmLogs()` | 4323 | Obtient logs KM | localStorage `volo_km_logs` |
| `saveKmLog(log)` | 4324 | Sauve entrée KM | `safeSetLS` |
| `getUserHomeKey()` | 4327 | Clé LS adresse maison user | `PERSONNEL`, `state.pin` |
| `getUserHome()` | 4328 | Obtient adresse maison user | localStorage |
| `saveUserHome(addr)` | 4329 | Sauve adresse maison | localStorage |
| `geocodeAddress(query)` | 4331 | Géocode adresse via Nominatim | `fetch` |
| `calcRouteKm(from, to)` | 4339 | Calcule distance route via OSRM | `geocodeAddress`, `fetch` |
| `autoCalcRoute()` | 4351 | Auto-calcule route maison → destination | `calcRouteKm`, `getUserHome` |
| `saveHomeAndRecalc()` | 4381 | Sauve maison et recalcule route | `saveUserHome`, `render` |
| `updateKmDisplay()` | 4389 | Met à jour affichage KM total | `state.kmDebut` |
| `hasPointageToday()` | 4409 | Vérifie si pointage aujourd'hui | localStorage `volo-ptg-history` |
| `hasKmToday()` | 4417 | Vérifie si KM déjà loggé aujourd'hui | `getKmLogs` |
| `getOpenDeployment()` | 4425 | Obtient déploiement ouvert pour KM retour | `getActiveDeployments` |
| `submitKmRetour()` | 4438 | Soumet KM retour | `getKmLogs`, webhook |
| `submitKm()` | 4467 | Soumet KM (avec validation) | `hasPointageToday`, `hasKmToday` |
| `_doSubmitKm()` | 4479 | Exécute soumission KM | `saveKmLog`, webhook, `VoloData` |
| `getOdoLogs()` | 4513 | Obtient logs odomètre | localStorage `volo_odo_logs` |
| `saveOdoLog(log)` | 4514 | Sauve log odomètre | `safeSetLS` |
| `getOpenOdo()` | 4515 | Obtient lecture odomètre ouverte | `getOdoLogs` |
| `submitOdoDepart()` | 4525 | Soumet odomètre départ | `saveOdoLog`, webhook |
| `submitOdoRetour()` | 4565 | Soumet odomètre retour | `_doSubmitOdoRetour` |
| `_doSubmitOdoRetour()` | 4578 | Exécute soumission odomètre retour | `saveOdoLog`, webhook |
| `renderKmTracking()` | 4603 | Render écran KM tracking (step 12) | Fonctions KM |
| `getAutoGains(user)` | 5591 | Auto-calcule gains depuis pointage + KM | localStorage `volo-ptg-history`, `getKmLogs`, `BAREMES` |
| `renderMesGains()` | 5459 | Render "Mes Gains" (step 15) | `getAutoGains`, `renderGainsHistory` |

---

### MODULE: v6-certs (Certifications, formation) — 14 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `getCerts(voloId)` | 1292 | Obtient certifications d'un membre | `safeGetLS` |
| `setCert(voloId, certId, dateStr)` | 1295 | Set date certification + webhook | `safeSetLS`, `VoloData.setCert`, webhook |
| `getCertStatus(dateStr, durMonths)` | 1307 | Calcule statut cert (OK/Warning/Expired) | aucune |
| `renderCertSection(voloId)` | 1319 | Render badges certifications | `getCerts`, `getCertStatus`, `CERTS_DEFS` |
| `getCertAlerts()` | 1339 | Obtient toutes alertes cert | `PERSONNEL`, `getCerts`, `getCertStatus` |
| `getMemberHistory(voloId)` | 1355 | Historique transactions d'un membre | `safeGetLS` |
| `getMemberPointage(voloId)` | 1360 | Historique pointage d'un membre | `safeGetLS` |
| `getMemberStats(voloId, days)` | 1365 | Stats membre pour N jours | `getMemberHistory`, `getMemberPointage` |
| `renderMemberTimeline(voloId)` | 1372 | Render timeline missions membre | `getMemberHistory`, `getMemberStats` |
| `certStatus(certId, userId)` | 4978 | Obtient statut cert pour affichage | `getCerts`, `getCertStatus` |
| `renderFormation()` | 4993 | Render écran formation (step 13) | `formView`, `renderMyCerts` |
| `renderMyCerts(user)` | 5063 | Render certifications du user | `getCerts`, `getCertStatus` |
| `saveMyCert(userId, certId, val)` | 5087 | Sauvegarde date certification | `setCert`, webhook |
| `renderTeamCerts()` | 5101 | Render grille certifications équipe | `PERSONNEL`, `getCerts` |

---

### MODULE: v6-urgences (Urgences, annonces) — 10 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `sendUrgence()` | 4059 | Envoie alerte urgence via webhook | `VOLO_WH_U`, `state.urgenceType/Note`, `VoloData`, `firebaseFS` |
| `loadAnnouncement()` | 8182 | Charge annonce + urgence depuis Firebase/LS | `firebaseDB`, localStorage |
| `stopAnnouncementListeners()` | 8201 | Arrête listeners Firebase annonces | `firebaseDB` |
| `showAnnouncementModal()` | 8206 | Affiche modal création annonce | `setState` |
| `saveAnnouncement()` | 8210 | Sauvegarde annonce vers Firebase + LS | `firebaseDB`, localStorage |
| `deleteAnnouncement()` | 8225 | Supprime annonce | `firebaseDB`, localStorage |
| `triggerUrgencyAlert()` | 8236 | Déclenche alerte urgence | `firebaseDB`, localStorage |
| `liftUrgencyAlert()` | 8249 | Lève alerte urgence | `firebaseDB`, localStorage |
| `showUrgence()` | 3879 | Affiche modal urgence | `setState` |
| `confirmClear(lsKey, msg, cb)` | 3881 | Affiche modal confirmation clear | `setState` |

---

### MODULE: v6-engine — Usage Tracker — 18 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `goToUsageTracker()` | 6949 | Navigue vers usage tracker | `setState` |
| `getUsageLog()` | 6951 | Obtient log d'utilisation | localStorage `volo_usage_log` |
| `saveUsageLog(log)` | 6954 | Sauve log d'utilisation | `safeSetLS` |
| `getActiveUsageSession()` | 6957 | Obtient session usage active | localStorage `volo_usage_active` |
| `saveActiveUsageSession(s)` | 6960 | Sauve session usage active | `safeSetLS` / localStorage |
| `getItemUsage(itemId)` | 6965 | Obtient historique usage item | `getUsageLog` |
| `startUsageSession()` | 6970 | Démarre session usage | `saveActiveUsageSession` |
| `getItemConditions()` | 7003 | Obtient records conditions items | localStorage `volo_item_conditions` |
| `saveItemCondition(itemId, cond, note)` | 7006 | Sauve évaluation condition item | `safeSetLS` |
| `stopUsageSession()` | 7012 | Arrête session usage | `getActiveUsageSession`, `saveUsageLog` |
| `confirmStopUsage()` | 7063 | Confirme arrêt avec condition/notes | `stopUsageSession`, `saveItemCondition` |
| `showManualUsageEntry()` | 7101 | Affiche modal entrée usage manuelle | DOM |
| `confirmManualUsage()` | 7158 | Confirme entrée usage manuelle | `saveUsageLog`, `saveItemCondition` |
| `getItemMissionCount(itemId)` | 7201 | Compte missions pour un item | localStorage `volo_history` |
| `startUsageTimer()` | 7215 | Démarre timer intervalle usage | `getActiveUsageSession` |
| `renderUsageIndicator()` | 7235 | Render indicateur usage en accueil | `getActiveUsageSession` |
| `toggleUsageItem(itemId)` | 7249 | Toggle item dans sélection usage | `state._usageSelected` |
| `renderUsageTracker()` | 7342 | Render usage tracker (step 16) | Fonctions usage |

---

### MODULE: v6-engine — Caisse Module — 14 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `isStockManager()` | 6271 | Vérifie si user est stock manager | `PERSONNEL`, `STOCK_MANAGERS` |
| `getCaisseStock()` | 6281 | Obtient données stock caisses | localStorage `volo_caisse_stock` |
| `saveCaisseStock(stock)` | 6282 | Sauve données stock caisses | `safeSetLS` |
| `getCaisseItems(grpId)` | 6283 | Obtient items d'une caisse | `CAISSES`, `ITEMS` |
| `initCaisseStock(grpId)` | 6290 | Initialise stock pour une caisse | `getCaisseItems`, `saveCaisseStock` |
| `sendStockWebhook(payload)` | 6294 | Envoie webhook stock | `STOCK_WEBHOOK`, `fetch` |
| `getStockHistory(grpId)` | 6298 | Obtient historique mouvements stock | localStorage `volo_stock_hist_*` |
| `saveStockHistory(grpId, entry)` | 6299 | Sauve entrée mouvement stock | `safeSetLS` |
| `openCaisseModule()` | 6302 | Ouvre module caisses (step 14+) | `isStockManager`, `setState` |
| `cmTab(id, btn)` | 6311 | Switch onglet module caisses | DOM |
| `cmRenderGlobal()` | 6320 | Render dashboard global caisses | `CAISSES`, `getCaisseStock` |
| `cmRenderCaisses(search)` | 6357 | Render liste caisses avec recherche | `CAISSES` |
| `cmOpenDetail(grpId)` | 6431 | Ouvre vue détail caisse | `CAISSES`, `getCaisseItems` |
| `cmBackToCaisses()` | 6551 | Retour à la liste des caisses | DOM |

---

### MODULE: Chat — 35 fonctions

| Fonction | Ligne | Description | Dépendances |
|----------|-------|-------------|-------------|
| `chatGetCurrentUser()` | 7596 | Obtient user courant pour chat | `PERSONNEL`, `state.pin` |
| `chatColor(uid)` | 7602 | Génère couleur pour user ID | `CHAT_COLORS` |
| `chatInitials(name)` | 7606 | Obtient initiales d'un nom | aucune |
| `chatTimeAgo(ts)` | 7610 | Temps écoulé spécifique chat | aucune |
| `chatDayLabel(ts)` | 7618 | Label séparateur jour | `CHAT_MONTHS` |
| `chatDbPath()` | 7625 | Obtient chemin Firebase DB pour canal | `chatMode` |
| `chatGetDmUnread(targetId)` | 7635 | Obtient compteur DM non lus | `firebaseDB`, localStorage |
| `chatLoadDmCache()` | 7645 | Charge cache conversations DM | `firebaseDB` |
| `chatStartListening()` | 7661 | Démarre listener Firebase chat | `firebaseDB`, `chatLoadLocal` |
| `chatStopListening()` | 7683 | Arrête listener Firebase chat | `firebaseDB` |
| `chatLoadLocal()` | 7689 | Charge chat depuis localStorage fallback | localStorage |
| `chatSaveLocal()` | 7693 | Sauve chat vers localStorage fallback | localStorage |
| `chatSend()` | 7698 | Envoie message chat | `firebaseDB`, `chatSaveLocal` |
| `chatReact(msgId, emoji)` | 7729 | Toggle réaction emoji | `firebaseDB` |
| `chatPin(msgId)` | 7755 | Épingle message (chef seulement) | `firebaseDB` |
| `chatUnpin(msgId)` | 7776 | Désépingle message | `firebaseDB` |
| `chatProcessMentions(text)` | 7788 | Traite @mentions dans texte | `PERSONNEL` |
| `chatSwitchChannel(channel)` | 7799 | Change canal chat | `chatStopListening`, `chatStartListening` |
| `chatOpenDM(targetId, targetName)` | 7811 | Ouvre conversation DM | `chatStopListening`, `chatStartListening` |
| `chatBackToGeneral()` | 7822 | Retour au canal général | `chatStopListening`, `chatStartListening` |
| `renderMainChat()` | 7832 | Render vue chat principale (step 17) | `chatRenderFull` |
| `initMainChatUI()` | 7842 | Initialise event handlers chat | `chatStartListening` |
| `chatRenderFull()` | 7845 | Re-render complet chat | `chatRenderMessages` |
| `chatRenderMessages()` | 7913 | Render liste messages chat | `chatMessages`, `chatProcessMentions` |
| `chatScrollBottom()` | 7980 | Scroll chat en bas | DOM |
| `chatOnInput(el)` | 7989 | Handle input chat (détection @mention) | `PERSONNEL` |
| `chatInsertMention(firstName)` | 8023 | Insère @mention dans input | DOM |
| `chatOnKeydown(e)` | 8039 | Handle clavier chat (Enter = envoyer) | `chatSend` |
| `chatShowDMList()` | 8070 | Affiche liste DM | `chatRenderDMList` |
| `chatRenderDMList()` | 8076 | Render liste conversations DM | `PERSONNEL` |
| `chatFilterDM(val)` | 8095 | Filtre liste DM par recherche | DOM |
| `renderChatFab()` | 8107 | Render bouton flottant chat | `chatUnreadCount` |
| `chatStartBackgroundListener()` | 8138 | Démarre listener background notifications | `firebaseDB` |
| `updateChatFab()` | 8169 | Met à jour badge FAB chat | `chatUnreadCount` |

---

### Splash Screen (script autonome, lignes 961–1100) — 7 fonctions

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `resize()` | 968 | Resize canvas |
| `ArcParticle(i,total)` | 982 | Constructeur particules arc |
| `Filament()` | 1006 | Constructeur particules filament |
| `SuctionStar()` | 1031 | Constructeur étoiles aspiration |
| `drawBlackHole(t)` | 1051 | Animation trou noir |
| `draw()` | 1073 | Loop animation principale |
| `dismissSplash()` | 1093 | Ferme overlay splash |

---

## Variables globales

| Ligne | Déclaration | Type | Description |
|-------|-------------|------|-------------|
| 1118 | `VOLO_WH_M` | const string | URL proxy webhook principal |
| 1119 | `VOLO_WH_U` | const string | URL proxy webhook urgence |
| 1126 | `TEAM_PIN` | const string | PIN équipe ('5555') |
| 1127 | `TEAM_PIN_MAX_ATTEMPTS` | const number | Max tentatives (3) |
| 1128 | `TEAM_PIN_EXPIRY_DAYS` | const number | Validité PIN (30 jours) |
| 1204 | `VOLO_VERSION` | const string | 'V10.5' |
| 1254 | `WEATHER_CACHE_KEY` | const string | 'volo_weather_cache' |
| 1255 | `WEATHER_CACHE_TTL` | const number | 3600000 (1h) |
| 1257 | `WMO_ICONS` | const object | Code météo → emoji |
| 1258 | `WMO_LABELS` | const object | Code météo → label |
| 1279 | `CERTS_DEFS` | const array | 10 définitions certifications |
| 1429 | `state` | let object | **Objet state principal** (30+ propriétés) |
| 1454 | `lockTimeout` | let | Timer écran verrouillage |
| 1455 | `LOCK_DELAY` | const number | 300000 (5 min) |
| 1793 | `_db` | const object | Timers debounce |
| 1947 | `_carouselTimer` | let | Intervalle carousel |
| 2855 | `CHECKLIST_PICKON` | var array | Items checklist pré-départ |
| 2859 | `CHECKLIST_PICKOFF` | var array | Items checklist pré-retour |
| 3543–3588 | Scanner vars | let/var | `qrCooldown`, `_jsqrLoop`, `_activeVideoTrack`, `_camFacing`, etc. |
| 4092–4094 | Transaction vars | let | `lastPayload`, `cancelTimer`, `cancelSeconds` |
| 4350 | `_routeCalcTimeout` | let | Debounce calcul route |
| 4972–4974 | Formation vars | let | `formView`, `formTeamTab`, `formTeamSearch` |
| 5434–5435 | Gains vars | let | `gainsView`, `gainsHistPeriod` |
| 6271 | `STOCK_MANAGERS` | const array | Liste noms stock managers |
| 6995 | `USAGE_CONDITIONS` | const array | Options conditions matériel |
| 7579–7594 | Chat vars | var/const | `firebaseDB`, `chatMessages`, `chatListener`, `chatMode`, etc. |
| 8104–8105 | Chat FAB vars | var | `chatFabToastTimer`, `chatLastNotifiedId` |
| 8177–8180 | Announce vars | var | `voloAnnouncement`, `voloUrgencyAlert`, listeners |
| 8468–8469 | Tour vars | let/const | `_tourStep`, `TOUR_STEPS` |

---

## localStorage keys utilisées

### Session/Auth
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_team_pin_ts` | R/W | v6-auth |
| `volo_unauth_log` | R/W | v6-auth |
| `volo_pin` | R/W | v6-auth |
| `volo_last_role` | R/W | v6-auth |
| `volo_last_user` | R/W | v6-auth |
| `volo_last_id` | R/W | v6-auth |
| `volo_session_ts` | R/W | v6-auth |
| `volo_failed_attempts` | R/W | v6-auth |
| `volo_lock_until` | R/W | v6-auth |
| `volo_onboarding_*` | R/W | v6-auth |
| `volo_theme_main` | R/W | v6-ui |

### Transactions
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_history` | R/W | v6-data-bridge |
| `volo_queue` | R/W | v6-data-bridge |
| `volo_audit_log` | R/W | v6-data-bridge |
| `volo_wizard_step` | R/W | v6-engine |
| `volo_wizard_mode` | R/W | v6-engine |

### Inventaire
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_destroyed` | R | v6-data-bridge |
| `volo_caisse_statuts` | R/W | v6-engine |
| `volo_caisse_stock` | R/W | v6-engine |
| `volo_caisse_history` | R/W | v6-data-bridge |
| `volo_stock_hist_*` | R/W | v6-engine |
| `volo_incidents` | R | v6-data-bridge |
| `volo_item_conditions` | R/W | v6-engine |

### KM/Gains
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_km_logs` | R/W | v6-km |
| `volo_home_*` | R/W | v6-km |
| `volo_odo_logs` | R/W | v6-km |
| `volo-ptg-history` | R | v6-km (⚠️ pas préfixe `volo_`) |
| `volo-ptg-onsite` | R | v6-km (⚠️ pas préfixe `volo_`) |

### Photos/Profil
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_setup_photos` | R/W | v6-ui |
| `volo_avatar_*` | R/W | v6-ui |
| `volo_bio_*` | R/W | v6-ui |
| `volo_embauche_*` | R/W | v6-ui |

### Certifications
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_certs_*` | R/W | v6-certs |

### Usage Tracker
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_usage_log` | R/W | v6-engine |
| `volo_usage_active` | R/W | v6-engine |

### Météo
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_weather_cache` | R/W | v6-ui |

### Chat
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_chat_last_read` | R/W | chat |
| `volo_chat_msgs_*` | R/W | chat |
| `volo_chat_dm_read_*` | R/W | chat |

### Annonces/Urgences
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_announcement` | R/W | v6-urgences |
| `volo_urgency_alert` | R/W | v6-urgences |

### Terrain
| Clé | R/W | Module V6 |
|-----|-----|-----------|
| `volo_terrain_contacts` | R/W | v6-data-bridge |

---

## Appels webhook Make.com

| Ligne | Endpoint | Type | Payload |
|-------|----------|------|---------|
| 1264 | `api.open-meteo.com/v1/forecast` | GET | Météo Sherbrooke |
| 1301 | `VOLO_WH_M` | POST | `CERT_UPDATE` |
| 4039 | `VOLO_WH_M` | POST | Pickoff items manquants |
| 4073 | `VOLO_WH_U` | POST | `URGENCE` |
| 4196 | `VOLO_WH_M` | POST | Photo metadata |
| 4202 | `VOLO_WH_M` | POST | Photo data |
| 4333 | `nominatim.openstreetmap.org` | GET | Géocodage |
| 4342 | `router.project-osrm.org` | GET | Calcul route |
| 4456 | `VOLO_WH_M` | POST | KM retour |
| 4498 | `VOLO_WH_M` | POST | KM départ |
| 4557 | `VOLO_WH_M` | POST | Odomètre départ |
| 4595 | `VOLO_WH_M` | POST | Odomètre retour |
| 5094 | `VOLO_WH_M` | POST | Cert save (fallback) |
| 5248 | `VOLO_WH_M` | POST | Transaction principale |
| 5274 | `VOLO_WH_M` | POST | `ITEM_LOG` batch |
| 5322 | `VOLO_WH_M` | POST | `ANNULÉ` |
| 6295 | `STOCK_WEBHOOK` | POST | Stock caisse |
| 6870 | variable | POST | Queue offline flush |

---

## Appels Firebase/Firestore

| Ligne | Chemin DB | Opération | But |
|-------|-----------|-----------|-----|
| 1198 | `security/unauthorized` | `.push()` | Log accès non autorisé |
| 2999 | `transactions/{userId}/{txId}` | `.set()` | Sync TX vers Firebase |
| 4083 | `firebaseFS.collection('urgences')` | `.add()` | Log urgence Firestore |
| 4504 | `firebaseFS.collection('km_logs')` | `.add()` | Log KM Firestore |
| 7667 | `chatDbPath()` | `.on('value')` | Listener temps réel chat |
| 7715 | `chatDbPath()/{msgId}` | `.set()` | Envoi message chat |
| 7734 | `chatDbPath()/{msgId}/reactions` | `.update()` | Toggle réaction |
| 7759 | `chatDbPath()/{msgId}` | `.update()` | Épingler message |
| 8150 | `messages` | `.on('value')` | Listener background chat |
| 8185 | `announcement` | `.on('value')` | Listener annonce |
| 8191 | `urgency_alert` | `.on('value')` | Listener urgence |
| 8217 | `announcement` | `.set()` | Sauver annonce |
| 8240 | `urgency_alert` | `.set()` | Déclencher urgence |
| 8241 | `urgency_log` | `.push()` | Logger action urgence |
| 8528 | `users/{userId}/onboardingDone` | `.set(true)` | Marquer onboarding fait |

---

## Event listeners

| Ligne | Événement | Cible | Handler |
|-------|-----------|-------|---------|
| 970 | `resize` | `window` | Splash canvas resize |
| 1483 | `mousemove/mousedown/keydown/touchstart/scroll` | `document` | `resetLockTimer` (passive) |
| 6856 | `online` | `window` | `updateNetBadge` + `flushQueue` |
| 6857 | `offline` | `window` | `updateNetBadge` + toast |
| 7901 | `scroll` | chat area | Détection position scroll |
| 8574 | `beforeinstallprompt` | `window` | PWA install banner |

---

## State Machine — Steps

| Step | Nom | Module V6 |
|------|-----|-----------|
| 0 | Accueil | v6-ui |
| 1 | PIN | v6-auth |
| 2 | Véhicule | v6-engine |
| 3 | Dépôt | v6-engine |
| 4 | Destination | v6-engine |
| 5 | Sauveteurs | v6-engine |
| 6 | Scan Items | v6-scanner + v6-engine |
| 7 | Confirmation | v6-engine |
| 8 | Validation/Succès | v6-engine |
| 9 | Dashboard | v6-ui |
| 10 | Historique | v6-ui |
| 11 | Photos | v6-ui |
| 12 | KM Tracking | v6-km |
| 13 | Formation | v6-certs |
| 14 | Module Caisses | v6-engine |
| 15 | Mes Gains | v6-km |
| 16 | Usage Tracker | v6-engine |
| 17 | Chat | chat |

---

## AVERTISSEMENTS

### Couplages forts (risques extraction)
1. **`render()` → `renderStep()` → 18 render* fonctions** : Le dispatcher central est un switch géant sur `state.step`. Toutes les fonctions render sont appelées depuis ce point central.
2. **`setState()` monkey-patched** : La ligne 8544 fait `const _origRender = render; render = function(){...}` pour injecter le tour onboarding — fragile.
3. **`state` object global** : Toutes les fonctions lisent/écrivent directement `state` — pas d'encapsulation.
4. **`firebaseDB` vérification partout** : 15+ endroits font `if(firebaseDB){...} else {localStorage...}` — pattern dupliqué.
5. **Clés LS sans préfixe** : `volo-ptg-history` et `volo-ptg-onsite` utilisent `-` au lieu de `_` — écrites par `pointage.html`, lues par `index.html`.
6. **DOM inline HTML** : La majorité des render* construisent du HTML en string concaténation, pas de templating — fragile mais fonctionnel.
7. **Chat = ~1000 lignes autonomes** (7579-8167) : module auto-contenu avec ses propres variables/listeners/renders — bon candidat pour extraction propre.
8. **Splash script complètement isolé** (961-1100) : canvas animation, aucune dépendance app — peut rester inline.
9. **Variables scanner à portée fichier** : `_mainStream`, `_mainAnimFrame`, `_mainVideo`, `_camFacing`, etc. doivent être encapsulées proprement dans v6-scanner.
10. **`VOLO_WH_M` = '/api/webhook-main'** : Utilise un proxy Netlify (pas l'URL Make.com directe) — les modules doivent garder cette référence.

### Fonctions non migrables facilement
- `render()` + `renderStep()` : dispatcher central, doit rester comme orchestrateur dans v6-engine
- Les render* qui construisent 200+ lignes de HTML inline : doivent migrer vers v6-ui mais attention aux closures sur `state`
- Le monkey-patch `render = function(){...}` (ligne 8544) : doit être refactoré proprement

---

## Compteurs finaux

| Catégorie | Nombre |
|-----------|--------|
| Fonctions totales | **~260** |
| Variables globales | **~60** |
| localStorage keys | **~45** |
| Appels webhook | **18** |
| Appels Firebase | **15** |
| Event listeners | **6** |
| Steps state machine | **18** (0-17) |
| Lignes JS total | **~7446** (lignes 1116-8562) |

---

*AGENT 1 — EXTRACTEUR — Rapport terminé · 2026-03-10*
*Aucun fichier modifié. Dossier v6/ et v6/reports/ créés.*
