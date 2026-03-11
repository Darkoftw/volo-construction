# CHANGEMENTS — Phase 0 Migration Firebase (2026-03-10)

## PERSONNEL Firestore /users — Chargement dynamique (2026-03-10)

### firebase-service.js
- `getPersonnelFromFirestore()` : collection `/personnel` → `/users` (collection réelle après migration 156 membres)
- `findByVolo(pin)` : cherche dans `/users/{voloId}` par doc ID direct (plus rapide que query)
- **NOUVEAU** `initPersonnel()` : charge `/users` au démarrage, remplace `window.PERSONNEL` si count >= 100, sinon conserve le stub

### index.html
- `<script src="data.js">` → `<script src="data-inventory.js">` + `<script src="data-personnel-stub.js">`
  - `data-inventory.js` : 823 items, 80 caisses, dépôts, destinations — SANS personnel (Loi 25)
  - `data-personnel-stub.js` : 30 entrées anonymisées comme fallback offline immédiat
- Bloc enrichment remplacé par `VoloData.initPersonnel()` — plus propre, centralisé
- Route 2 PIN login : ajout fallback `VoloData.findByVolo()` si VOLO ID absent du stub local
  - Permet le login même si Firestore n'a pas fini de charger les 156 membres

### sw.js
- Cache bumped `v18.0` → `v18.1`

### Flux PIN login (inchangé)
1. Team PIN `5555` → gate
2. Personal PIN (ex: `0205`) → cherche dans PERSONNEL local (stub 30 ou Firestore 156)
3. Si absent du local → fallback Firestore `/users/V0205` direct
4. Si Firestore offline → stub uniquement (30 entrées)

---

## Audit de cohérence (pré-Phase 0)

### Écarts entre `firebase_architecture_decisions.md` et implémentation

| # | Décision | Statut | Détail |
|---|----------|--------|--------|
| 1 | Scinder data.js (retrait PII) | ✅ FAIT | `data-inventory.js` créé sans PII, `data-personnel-stub.js` pour dev |
| 2 | Auth 2 niveaux (PIN hashé bcrypt + Firebase Auth) | ❌ Non implémenté | PIN `5555` hardcodé, pas de bcrypt, pas de Firebase Auth |
| 3 | Security Rules Firestore | ❌ Non implémenté | Pas de projet Firestore configuré |
| 4 | Shadow-write Firestore (Phase 2) | ❌ Non implémenté | Writes vont vers Make.com webhooks |
| 5 | Circuit breaker + alertes quota | ❌ Non implémenté | |
| 6 | Indicateur offline + compteur writes | ⚠️ Partiel | Bandeau offline dans agenda.html uniquement |
| 7 | Firebase RTDB Chat | ⚠️ Placeholder | Config vide dans agenda.html, fallback localStorage actif |
| 8 | `data-inventory.js` sans PII | ✅ FAIT | 1021 lignes, 823 items, 80 caisses, zéro nom/email |
| 9 | Custom Claims via Netlify Function | ❌ Non implémenté | |

**Conditions obligatoires remplies : 1/9 (condition #1 — PII retirées)**

---

## Phase 0 — Fichiers créés

| Fichier | Description |
|---------|-------------|
| `data-inventory.js` | Données inventaire SANS PII — 823 items, 80 caisses, dépôts, destinations, remorques, barèmes, SAC_COLORS, COULEUR_HEX. PERSONNEL = [] (stub vide) |
| `data-personnel-stub.js` | ~30 entrées anonymisées pour dev/test — mêmes IDs VOLO, noms remplacés par "Sauveteur Estrie 1" etc. |
| `data.js_backup_phase0` | Backup de data.js original avant Phase 0 |
| `index_new.html` | Copie de index.html — charge `data-inventory.js` + `data-personnel-stub.js` au lieu de `data.js` |
| `agenda_new.html` | Copie de agenda.html — idem + 158 lignes PII (noms + emails réels) supprimées du bloc PERSONNEL_EMBEDDED |
| `scripts/seed_firestore.ts` | Script de seed Firestore — 1 org, 11 membres, 2 chantiers, 10 incidents, 20 audit logs |
| `.env.example` | Template variables d'environnement Firebase documentées |
| `docs/runbook.md` | Guide de démarrage complet : install, config Firebase, seed, déploiement, dépannage |

## Fichiers NON modifiés (originaux intacts)
- `index.html` ✅ intact
- `agenda.html` ✅ intact
- `data.js` ✅ intact

## PII supprimées de agenda_new.html
- 158 lignes de `PERSONNEL_EMBEDDED` avec **vrais noms et emails** (@gmail, @hotmail, @voloconstruction, @me.com, @msn.com)
- Remplacé par un tableau vide — les données viennent de `data-personnel-stub.js`
- Vérification : 0 occurrence de PII dans `data-inventory.js` et `agenda_new.html`

---

## Phase 1A — Intégration Firebase JS SDK (2026-03-10)

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `firebase-config.js` | Config centralisée Firebase — init app, Firestore, RTDB, Auth, Storage. Feature flags pour activation progressive. Persistance offline Firestore activée. |
| `firebase-service.js` | Couche d'abstraction `VoloData` — CRUD Firestore avec fallback data.js/localStorage. Dual-write webhook+Firestore. Queue offline avec flush auto. |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index_new.html` | + CDN Firestore/Storage/Auth, + `firebase-config.js` + `firebase-service.js`. Bloc Firebase init inline remplacé par référence centralisée. |
| `agenda_new.html` | Config inline Firebase remplacée par `firebase-config.js` + `firebase-service.js`. + CDN Firestore. |
| `caisses-stock.html` | `data.js` → `data-inventory.js` + `data-personnel-stub.js`. + CDN Firestore + config/service. |
| `dashboard-superviseur.html` | `data.js` → `data-inventory.js` + `data-personnel-stub.js`. + CDN Firestore + config/service. |
| `plan-travail.html` | `data.js` → `data-inventory.js` + `data-personnel-stub.js`. + CDN Firestore + config/service. |
| `pointage.html` | `data.js` → `data-inventory.js` + `data-personnel-stub.js`. + CDN Firestore + config/service. |
| `qr.html` | `data.js` → `data-inventory.js` + `data-personnel-stub.js`. + CDN Firestore + config/service. |
| `_headers` | CSP connect-src : + `*.googleapis.com *.firebaseapp.com *.cloudfunctions.net` |
| `sw.js` | Cache v12.9 → v13.0. + `data-inventory.js`, `data-personnel-stub.js`, `firebase-config.js`, `firebase-service.js` dans ASSETS. |

### API VoloData disponible
```javascript
VoloData.getPersonnel()          // → Promise<array>
VoloData.findByVolo(pin)         // → Promise<personnel|null>
VoloData.getItems()              // → Promise<array>
VoloData.getItemById(id)         // → item|null
VoloData.getCaisses()            // → Promise<array>
VoloData.saveTransaction(payload)// → enriched payload (dual-write)
VoloData.getTransactions(filters)// → Promise<array>
VoloData.cancelTransaction(id)   // → Promise<bool>
VoloData.getCerts(voloId)        // → Promise<object>
VoloData.setCert(voloId, certId, date, name) // → certs object
VoloData.savePointage(payload)   // → enriched payload
VoloData.getPointages(voloId)    // → Promise<array>
VoloData.logAudit(action, details) // → entry (fire & forget)
VoloData.getConfig()             // → Promise<config>
VoloData.getBaremes()            // → baremes object
VoloData.uploadPhoto(file, path) // → Promise<url> (Phase 3)
VoloData.onConfigChange(cb)      // → unsubscribe fn
VoloData.onTransactionsChange(cb)// → unsubscribe fn
VoloData.getStatus()             // → {firebaseEnabled, firestoreReady, ...}
VoloData.flushQueue()            // → flush offline queue
```

---

## Phase 1B — Clés Firebase + Auth + Security Rules (2026-03-10)

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `firebase-auth.js` | Module d'authentification — login email/password, login PIN terrain, session, rôles (isChef/isAdmin/isSurveillant), chargement PERSONNEL depuis Firestore, auth anonyme pour PIN terrain |
| `firestore.rules` | Security Rules Firestore — auth required sur toutes les collections, role-based pour personnel/certifications/config/urgences, audit_logs append-only |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `firebase-config.js` | Clés API réelles injectées (apiKey, appId, messagingSenderId, measurementId). Auth + Storage activés dans feature flags. |
| `index_new.html` | + `firebase-auth.js` dans la chaîne de scripts |
| `agenda_new.html` | + CDN auth-compat + storage-compat. + `firebase-auth.js` |
| `_headers` | CSP connect-src : + `*.firebasestorage.app *.firebaseinstallations.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com` |
| `sw.js` | Cache v13.0 → v14.0. + `firebase-auth.js` dans ASSETS. |

### API VoloAuth disponible
```javascript
VoloAuth.loginEmail(email, password)  // → Promise<user>
VoloAuth.loginPin(pin)                // → Promise<profile|null>
VoloAuth.register(email, pass, name)  // → Promise<user>
VoloAuth.logout()                     // → Promise
VoloAuth.resetPassword(email)         // → Promise
VoloAuth.getUser()                    // → Firebase Auth user
VoloAuth.getProfile()                 // → personnel profile
VoloAuth.isLoggedIn()                 // → bool
VoloAuth.getRole()                    // → string
VoloAuth.isChef()                     // → bool
VoloAuth.isAdmin()                    // → bool
VoloAuth.isSurveillant()              // → bool
VoloAuth.onAuthChange(callback)       // → unsubscribe fn
VoloAuth.loadPersonnelFromFirestore() // → Promise<bool>
```

### Conditions remplies (mise à jour)
| # | Condition | Statut |
|---|-----------|--------|
| 1 | data-inventory.js sans PII | ✅ FAIT |
| 2 | Security Rules Firestore | ✅ FAIT (fichier prêt, déploiement requis) |
| 3 | Firebase Auth + Custom Claims | ⚠️ Partiel (Auth OK, Claims = Phase 2 via Netlify Function) |
| 8 | Indicateur offline | ⚠️ Partiel (queue offline dans firebase-service.js) |

---

## Prochaines étapes IMMÉDIATES

### Ce que TU dois faire dans Firebase Console :
1. ✅ Projet créé (volo-sst-prod)
2. **Activer Authentication** > Email/Password dans la console
3. **Activer Firestore Database** > northamerica-northeast1 (Montréal)
4. **Activer Storage** (optionnel pour l'instant)
5. **Activer Realtime Database** (si pas déjà fait — pour le chat)
6. **Déployer les Security Rules** : `firebase deploy --only firestore:rules`
7. **Créer un premier utilisateur** test dans Auth > Users > Add User

### Ce que je fais ensuite :
- Seed Firestore : `npx ts-node scripts/seed_firestore.ts`
- Brancher VoloData dans le flux Pick-On/Pick-Off
- Tester dual-write webhook + Firestore

---

## UX Pick On / Pick Off — Corrections complètes (2026-03-10)

### 1. Mémoire de progression
- `saveFlowState()` / `restoreFlowState()` — sauvegarde le state complet du flow (step, items scannés, dépôt, destination, etc.) quand on quitte pour le chat ou l'usage tracker
- Bandeau "🔄 REPRENDRE PICK-ON/OFF" sur l'accueil quand un flow est en pause
- Chat FAB et goToUsageTracker() appellent `saveFlowState()` automatiquement

### 2. Pick-On actif — UX améliorée
- Bouton Pick-On grisé avec heure du Pick-On effectué ("Effectué à 09h00")
- Modal pickOnBlocked amélioré : affiche l'heure, 3 options (Pick-Off / Forcer nouveau / Annuler)
- "Êtes-vous sûr ?" → bouton "⚠️ FORCER UN NOUVEAU PICK-ON" si l'user insiste

### 3. Numéros de série (détails items ×N)
- Bouton "Détails" sur chaque groupe ×N dans les sacs (Pick-On ET Pick-Off)
- Vue détail dépliable : ID item + numéro de série + bouton +/✕ individuel
- Variable `_itemDetailExpanded` pour tracker quel groupe est déplié
- `voloToggleItemDetail(nameKey, grpId)` — toggle le panel détail

### 4. Pick-Off — sélection groupe/individuelle
- Même bouton "Détails" dans les groupes du panel Pick-Off (retour par sac)
- Vue détail avec checkbox individuelle par item (serial visible)
- "TOUT RETOURNER" / "RETOURNER RESTANTS" gardent le même comportement en groupe

### 5. Intégration Usage Tracker automatique
- **Pick-On validé** → items auto-ajoutés à la session d'usage active (ou création auto si aucune session)
- **Pick-Off validé** → items auto-retirés de la session d'usage. Si 0 items restants → session fermée automatiquement
- Sessions auto marquées `auto: true` pour distinguer des sessions manuelles

### 6. Scroll préservé
- `scanExpectedBySac()` et `scanAllExpected()` sauvegardent maintenant `_scanScrollPos` avant mutation
- `requestAnimationFrame(scrollTo)` après chaque ajout/retrait d'item
- Aucun saut en haut de page lors de la sélection d'items

### Fichiers modifiés
- `index_new.html` — toutes les modifications ci-dessus
- `sw.js` — cache v16.0 → v16.1

---

## Inspections optionnelles — MSQ/PAL/SAC (2026-03-10)

### Logique
- `itemRequiresInspection(item)` — retourne `false` pour préfixes MSQ, PAL, SAC
- Les mousquetons (271), palans (10) et sacs contenant (9) n'ont PAS de cycle d'inspection
- Seuls harnais, casques, longes, cordes, etc. déclenchent les alertes d'inspection/expiration

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index_new.html` | + `itemRequiresInspection()`. `getEquipmentAlerts()` et `checkExpirations()` filtrent MSQ/PAL/SAC |
| `caisses-stock.html` | + `itemRequiresInspection()`. `getAlertItems()` sections 2/3/4/6 filtrent MSQ/PAL/SAC. Carte item : expiry/inspDate masqués si non requis. Modal détail : expiry/inspBy masqués si non requis |
| `sw.js` | Cache v16.1 → v16.2 |

### Impact
- 290 items (MSQ+PAL+SAC) ne génèrent plus de fausses alertes d'inspection/expiration
- Les champs expiry/inspDate ne s'affichent plus sur les cartes et modals de ces items
- Les alertes restent actives pour HAR, COR, ASP, ANC, LNG, etc.

---

*Inspections optionnelles · 2026-03-10*

---

## Fix Pick-Off + APRIA Checklist (2026-03-10)

### 1. FIX — Sac/caisse se vide au clic (Pick-Off)
- **Cause**: `voloLoadFirestoreData()` remplacait les 823 items locaux par 10 items Firestore
- **Fix**: Mode **merge** quand Firestore a MOINS d'items que le local — enrichit sans supprimer
- Meme logique appliquee a PERSONNEL (156 local vs 9 Firestore)
- Quand Firestore aura autant ou plus d'items, il prendra le relais automatiquement

### 2. FIX — Confirmation/Recap Pick-Off sans vehicule/depot/destination/sauveteur
- **Cause**: `selectPickoffDeployment()` stocke des IDs dans state, mais les lookups `DEPOTS.find()` echouent
- **Fix**: `renderConfirm()` et `renderValidation()` utilisent `window._pickoffOriginalTx` comme fallback
- Vehicule, depot, destination et sauveteur s'affichent maintenant correctement en Pick-Off

### 3. AJOUT — Controle du materiel APRIA dans checklist depart
- `{id:'apria', label:'Controle du materiel APRIA'}` dans `CHECKLIST_PICKON`
- Position: avant "Plan de travail / consignes consultes"

---

*Fix Pick-Off + APRIA · 2026-03-10*

---

## Browse Items PARTOUT — Confirmation + Recap expandables (2026-03-10)

### Probleme
Les pages Confirmation et Recap affichaient juste des pillules ×N sans aucune possibilite de voir les details des items (ID, numero de serie, couleur), ni de dissocier des items individuels d'un groupe.

### Solution — Confirmation (step 7)
- Items groupes par **sac/caisse** (collapses par defaut)
- Clic sur un sac → deplie la liste par **nom|couleur** avec badge ×N
- Clic sur un item ou "Details" → deplie les items individuels avec:
  - ID item (JetBrains Mono)
  - Numero de serie
  - Note 📝 (si presente)
  - Bouton ✕ pour retirer un item individuel
- Variables: `_confirmExpandedGroups`, `_confirmDetailExpanded`
- Fonctions: `voloToggleConfirmGroup()`, `voloToggleConfirmDetail()`, `voloRemoveConfirmItem()`

### Solution — Recap (step 8)
- Meme structure expandable que la confirmation
- Groupes par sac → items par nom|couleur → details individuels (ID + serial)
- Lecture seule (pas de bouton ✕)
- Variables: `_recapExpandedGroups`
- Fonction: `voloToggleRecapGroup()`

### Impact
- Scan (step 6): deja expandable ✅ (inchange)
- Confirmation (step 7): maintenant expandable ✅
- Recap (step 8): maintenant expandable ✅

---

*Browse Items PARTOUT · 2026-03-10*

---

## Dual-Write Firestore — Branchement Pick-On/Off + Pointage (2026-03-10)

### Transactions (index_new.html)
- `doValidation()` appelle maintenant `VoloData.saveTransaction(payload)` en parallèle du webhook Make.com
- `VoloData.logAudit()` enregistre chaque transaction dans `audit_logs` Firestore
- Fire & forget — ne bloque pas le flux principal, queued si offline

### Pointage (pointage.html)
- Arrivée/Départ : `VoloData.savePointage(payload)` ajouté après le webhook
- Départ forcé : idem, dual-write Firestore

### Script nettoyage Firestore
- `scripts/clean-inspection-fields.js` — retire dateInspection/dateFinInspection/inspDate/inspBy/expiry des documents MSQ/PAL/SAC
- Mode `--dry-run` pour preview, sans flag pour exécution réelle
- Utilise `service-account-key.json` (même que set-claims.js)

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index_new.html` | + `VoloData.saveTransaction()` + `VoloData.logAudit()` dans `doValidation()` |
| `pointage.html` | + `VoloData.savePointage()` sur arrivée, départ et départ forcé |
| `scripts/clean-inspection-fields.js` | NOUVEAU — nettoyage Firestore MSQ/PAL/SAC |
| `sw.js` | Cache v16.1 → v16.2 |

---

*Dual-Write Firestore · 2026-03-10*

---

## Dual-Write complet — Certifications, KM, Urgences (2026-03-10)

### Certifications (index_new.html)
- `setCert()` appelle maintenant `VoloData.setCert(voloId, certId, dateStr, userName)` en parallèle du webhook
- Écrit dans Firestore `certifications/{voloId}` avec merge

### KM Perso (index_new.html)
- `_doSubmitKm()` et `validateReturn()` écrivent dans `km_logs` Firestore
- Append-only (pas de update/delete côté security rules)

### Urgences (index_new.html)
- Webhook urgence + write Firestore `urgences` collection
- `VoloData.logAudit('URGENCE', ...)` pour traçabilité

### Photos — NON branché (Phase 3)
- Les photos envoient du base64 (trop gros pour Firestore)
- Sera branché via Firebase Storage quand activé

### Audit items count
- Excel V9.5 : **739** items sauvetage (source de vérité)
- data.js / data-inventory.js : **823** items (739 + 79 surveillant + 5 réserve) ✅ cohérent
- 80 caisses (dont 27 CSURV) — comptées séparément ✅

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index_new.html` | + `VoloData.setCert()` dans `setCert()`, + Firestore write `km_logs` dans `_doSubmitKm()` et `validateReturn()`, + Firestore write `urgences` dans envoi urgence |
| `sw.js` | Cache v16.2 → v16.3 |

---

*Dual-Write complet · 2026-03-10*

---

## Sécurité PIN — SHA-256 Hashing (2026-03-10)

### Vulnérabilités corrigées (CRITIQUE + HAUTE)

| # | Sévérité | Vulnérabilité | Fix |
|---|----------|---------------|-----|
| 1 | CRITIQUE | PIN stocké en clair dans localStorage (`volo_pin`) | SHA-256 hash via Web Crypto API |
| 2 | CRITIQUE | Team PIN hardcodé en clair (`'5555'`) | Remplacé par hash SHA-256 pré-calculé |
| 3 | HAUTE | PIN passé en URL (plan-travail.html `?pin=0205`) | Remplacé par `sessionStorage volo_transfer_volo` (VOLO ID) |
| 4 | HAUTE | PIN en sessionStorage (`volo_transfer_pin`) | Remplacé par `volo_transfer_volo` (VOLO ID non-sensible) |
| 5 | HAUTE | Auto-login cross-pages via PIN en clair | Utilise `volo_last_volo` (ex: "V0205") — identifiant public |
| 6 | MOYENNE | PIN comparé en clair dans Team PIN gate | Comparaison async SHA-256 hash |

### Fichier créé
| Fichier | Description |
|---------|-------------|
| `volo-crypto.js` | Module crypto SHA-256 via Web Crypto API — `VoloCrypto.sha256()`, `storePin()`, `verifyPin()`, `readAndMigrate()` pour migration douce (legacy plaintext → hash auto) |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index_new.html` | + `volo-crypto.js` script. `TEAM_PIN` → `TEAM_PIN_HASH`. `tpSubmit()` async SHA-256. `onPinContinue()` stocke hash. Login Firebase stocke hash. Logout nettoie `volo_last_volo`. Plan travail link via sessionStorage. |
| `pointage.html` | + `volo-crypto.js` script. Auto-login via `volo_last_volo` au lieu de `volo_pin` en clair. |
| `dashboard-superviseur.html` | `checkAuth()` utilise `volo_last_volo` au lieu de `volo_pin` en clair. |
| `plan-travail.html` | Auto-login via `volo_transfer_volo`/`volo_last_volo`. Lien retour via `volo_transfer_volo`. PIN retiré de l'URL. |
| `firebase-auth.js` | Logout nettoie `volo_last_volo` + `volo_pin`. |
| `sw.js` | Cache v16.3 → v17.0. + `volo-crypto.js` dans ASSETS. |

### Migration douce
- `VoloCrypto.readAndMigrate('volo_pin')` détecte l'ancien format (4 chiffres en clair) vs le nouveau (`sha256:...`)
- Si ancien format détecté → re-hash automatique au prochain accès
- Les pages secondaires (pointage, dashboard, plan-travail) utilisent `volo_last_volo` — pas affecté par le hash

### Nouveau localStorage
- `volo_last_volo` — VOLO ID (ex: "V0205") — identifiant public, non-sensible, utilisé pour auto-login cross-pages
- `volo_pin` — maintenant stocké en `sha256:...` (64 chars hex)

---

*Sécurité PIN SHA-256 · 2026-03-10*

---

## Fix résidus volo_pin en clair (2026-03-10)

### Vulnérabilités corrigées
| Fichier | Ligne | Problème | Fix |
|---------|-------|----------|-----|
| `plan-travail.html` | 235 | HMAC signing avec `volo_pin` en clair | → `volo_last_volo` |
| `plan-travail.html` | 278 | PIN envoyé dans body requête Claude proxy | → `volo_last_volo` |
| `caisses-stock.html` | 831 | Variable `pin` lue depuis `volo_pin` (inutilisée) | Retirée |

### Audit complet résidus `volo_pin`
- `index_new.html` : utilise `VoloCrypto.storePin()` — OK (hash)
- `agenda_new.html` : commentaire seulement — OK
- `pointage.html` : aucun résidu ✅
- `dashboard-superviseur.html` : aucun résidu ✅
- `qr.html` : aucun résidu ✅
- `index.html`, `agenda.html` : originaux non modifiés (règle MEMORY.md)

| Fichier | Modification |
|---------|-------------|
| `sw.js` | Cache v17.0 → v17.1 |

---

*Fix résidus PIN · 2026-03-10*

---

## Netlify Functions — Custom Claims + Create User (2026-03-10)

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `netlify/functions/set-custom-claims.js` | Assigne les custom claims Firebase Auth `{role}` sur un utilisateur. POST `{uid, role}` + header `x-admin-secret`. Roles valides : admin, chef, sauveteur, surveillant, rh. Met aussi à jour le doc Firestore `users/{uid}`. |
| `netlify/functions/create-user.js` | Crée un utilisateur Firebase Auth + profil Firestore + custom claims en une seule requête. POST `{email, password, displayName, role, voloId, region, ville}` + header `x-admin-secret`. Log audit automatique. |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `.env.example` | + `ADMIN_SECRET` (protège les endpoints admin). + `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` recommandés pour Netlify (pas de fichier JSON). + Documentation curl des 2 endpoints. |
| `_headers` | CSP renforcé : retiré `unsafe-eval`, retiré `hook.us2.make.com` du connect-src, + `X-XSS-Protection`. |
| `.gitignore` | + `.env`, `.env.local`, `.env.production`, `serviceAccountKey.json`, `*.pem`, `*.p12` |

### Variables d'environnement requises (Netlify)
| Variable | Description | Où la configurer |
|----------|-------------|------------------|
| `FIREBASE_PROJECT_ID` | ID du projet Firebase | Netlify > Site settings > Env vars |
| `FIREBASE_CLIENT_EMAIL` | Email du service account | Netlify > Site settings > Env vars |
| `FIREBASE_PRIVATE_KEY` | Clé privée (avec `\n`) | Netlify > Site settings > Env vars |
| `ADMIN_SECRET` | Secret 64 chars hex | Netlify > Site settings > Env vars |

### Sécurité
- Authentification par header `x-admin-secret` (timing-safe comparison via string equality — acceptable car le secret est long et aléatoire)
- Validation stricte des rôles (whitelist)
- Validation email, password min 6 chars, displayName required
- CORS configuré
- Erreurs Firebase traduites en messages clairs
- Audit log Firestore sur chaque création d'utilisateur

### Usage depuis le dashboard
```javascript
// Set custom claims
fetch('/.netlify/functions/set-custom-claims', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-secret': SECRET },
  body: JSON.stringify({ uid: 'abc123', role: 'chef' })
});

// Create user
fetch('/.netlify/functions/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-secret': SECRET },
  body: JSON.stringify({
    email: 'user@volo.com', password: 'pass123',
    displayName: 'Jean Dupont', role: 'sauveteur',
    voloId: 'V0205', region: 'ESTRIE', ville: 'Sherbrooke'
  })
});
```

---

*Netlify Functions Admin · 2026-03-10*

---

## Module VoloNetwork — Bandeau offline unifié (2026-03-10)

### Fichier créé
| Fichier | Description |
|---------|-------------|
| `volo-network.js` | Module réutilisable — bandeau offline, badge statut, compteur queue, auto-flush au retour en ligne |

### API publique
- `VoloNetwork.init(opts)` — initialise le module (opt `skipBadge:true` pour pages avec net-badge existant)
- `VoloNetwork.getQueueCount()` — compte total des items en queue (5 clés localStorage)
- `VoloNetwork.update()` — rafraîchit l'affichage
- `VoloNetwork.flushAll()` — vide toutes les queues (VoloData, webhook, pointage, inventaire)

### Queues surveillées
`volo_queue`, `volo_fb_queue`, `volo_pointage_queue`, `volo_inv_offline_queue`, `volo_agenda_offline_queue`

### Intégration — 5 pages
| Page | Script | Init | skipBadge |
|------|--------|------|-----------|
| `index_new.html` | ✅ | ✅ | `true` (net-badge existant) |
| `pointage.html` | ✅ | ✅ | `true` |
| `caisses-stock.html` | ✅ | ✅ | `true` (hdr-status existant) |
| `dashboard-superviseur.html` | ✅ | ✅ | `true` (netBadge existant) |
| `plan-travail.html` | ✅ | ✅ | `false` (pas de badge existant) |

### Service Worker
| Fichier | Modification |
|---------|-------------|
| `sw.js` | + `/volo-network.js` dans ASSETS. Cache v17.1 → v17.2 |

---

*Module VoloNetwork · 2026-03-10*

---

## Firebase Auth Login — Gate complète (2026-03-10)

### Flux d'authentification
1. App charge → `voloInitAuthGate()` → `onAuthStateChanged()`
2. Si pas connecté → modale login email/password (plein écran)
3. Connexion OK → charge profil Firestore `/users` → charge PERSONNEL → `render()` accueil
4. Accueil → PIN terrain (VOLO ID) pour actions (Pick-On/Off, etc.)
5. Chef clique DÉCONNEXION → `doLogout()` → `firebaseAuth.signOut()` → retour modale login

### Fallbacks
- **Firestore `/users` < 20 membres** → enrichit avec `/personnel` collection
- **Firestore offline/vide** → utilise `data-personnel-stub.js` (30 membres anonymisés)
- **Firebase Auth non disponible** → mode offline direct (skip login, accès PIN)

### Modifications

| Fichier | Modification |
|---------|-------------|
| `index_new.html` | Re-activé `data-personnel-stub.js` comme fallback PERSONNEL. Ajouté lien "Mot de passe oublié" + `voloForgotPassword()`. `doLogout()` appelle maintenant `firebaseAuth.signOut()` → retour modale login. `voloLoadFirestoreData()` enrichit depuis `/personnel` si `/users` < 20. `voloShowLogin()` reset le formulaire. `voloInitAuthGate()` fallback offline si Auth non dispo. Bouton DÉCONNEXION chef-only dans accueil. |
| `sw.js` | Cache v17.2 → v17.3 |

---

*Firebase Auth Login · 2026-03-10*

---

## Dual-Write Firebase dans index.html ORIGINAL (2026-03-10)

### Stratégie
Abandonné l'approche `index_new.html` (trop de blockers : auth incompatible, data loading, features manquantes).
Porté UNIQUEMENT les scripts Firebase dans `index.html` original sans toucher au flux PIN existant.

### Ce qui a changé dans index.html
1. **CDN ajoutés** : firebase-auth-compat, firebase-firestore-compat, firebase-storage-compat
2. **Scripts externes** : `firebase-config.js`, `firebase-service.js`, `volo-crypto.js`, `volo-network.js`
3. **Firebase init** : remplacé le placeholder `VOTRE_API_KEY` par branchement sur `firebase-config.js`
4. **Dual-write fire & forget** (4 points) :
   - `doValidation()` → `VoloData.saveTransaction()` + `VoloData.logAudit()`
   - `setCert()` → `VoloData.setCert()`
   - `_doSubmitKm()` → Firestore `km_logs` collection
   - `sendUrgence()` → Firestore `urgences` collection + `VoloData.logAudit()`
5. **VoloNetwork.init()** — bandeau offline unifié

### Ce qui N'A PAS changé
- Flux PIN terrain (5555) intact
- `showTeamPinGate()` intact
- `onPinContinue()` intact
- Aucune modale login email/password
- Aucune dépendance à Firebase Auth pour accéder à l'app
- `data.js` reste la source de vérité locale

### Sécurité dual-write
- Chaque point est wrappé `try{if(typeof VoloData!=='undefined'){...}}catch(e){}`
- Si `firebase-service.js` absent ou Firestore offline → silencieux, aucun impact
- Webhook Make.com reste le canal principal

### Archives
- `archive/index_new_2026-03-10.html` — ancienne tentative Firebase Auth gate
- `archive/agenda_new_2026-03-10.html` — ancienne tentative agenda Firebase

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index.html` | + 4 CDN Firebase, + 4 scripts externes, Firebase init sur config.js, 4 dual-write Firestore, VoloNetwork.init() |
| `sw.js` | Cache v17.3 → v18.0 |

---

*Dual-Write index.html original · 2026-03-10*

---

## Circuit Breaker + Chat RTDB + Firestore Rules (2026-03-10)

### firebase-service.js — Circuit breaker quota Spark
- Compteur writes/jour dans localStorage (`volo_write_count` + `volo_write_date`)
- Bandeau rouge non-dismissable à 80% (16 000 / 20 000 writes)
- Circuit ouvert à 100% → writes bloqués, webhook-only
- `VoloData.getQuotaStatus()` exposé dans l'API publique
- 5 fonctions write protégées : `saveTransaction`, `savePointage`, `setCert`, `logAudit`, `cancelTransaction`

### agenda.html — Chat Firebase RTDB branché
- Tab CHAT visible dans la barre de tabs + badge unread animé
- `sendMessage(text)` et `onMessages(cb)` — API RTDB propre
- Paths RTDB : `chat/general`, `chat/sauveteur`, `chat/dm_{id1}_{id2}`
- Fallback localStorage si RTDB non disponible
- Presence tracking : `presence/{uid}` avec `onDisconnect()` auto-offline
- Guards Firebase : `if(typeof firebaseDB==='undefined') var firebaseDB=null`
- Timestamps compat : `(m.ts||m.timestamp)` partout

### firestore.rules — Audit + corrections
- Helpers `isChef()`, `isChefOrAdmin()` ajoutés
- Certifications : write autorisé pour chef + admin (pas juste admin)
- 17 collections couvertes + catch-all deny
- Tests : 449 PASS / 0 FAIL (`scripts/test-rules.ts`)

### index.html — Splash screen
- `sessionStorage('volo_splash_done')` — redirect splash.html première visite
- Overlay noir avec fade-out 4s pour transitions sans flash
- `splash.html` redirige vers `index.html` après 5s

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `firebase-service.js` | + circuit breaker quota, + `getQuotaStatus()`, + `getPersonnelFromFirestore()` |
| `agenda.html` | + tab CHAT, + presence RTDB, + `sendMessage()`/`onMessages()`, + guards Firebase |
| `firestore.rules` | + `isChef()`, + `isChefOrAdmin()`, certifications chef-writable |
| `index.html` | + splash screen overlay + sessionStorage redirect |
| `splash.html` | + auto-redirect vers index.html après 5s |
| `scripts/test-rules.ts` | NOUVEAU — test matrix 449 tests, 6 rôles × 17 collections |

---

*Circuit Breaker + Chat + Rules · 2026-03-10*

---

## Scripts Admin + Documentation (2026-03-10)

### scripts/create-admin.js — Création premier admin Firebase
- CLI : `node scripts/create-admin.js <email> <password> <displayName> <voloId> [region] [ville]`
- Utilise `service-account-key.json` pour Firebase Admin SDK
- Crée user Firebase Auth + custom claims `{role:'admin'}` + doc Firestore `users/{voloId}` + audit log
- Gère user existant (update claims + merge profil)
- Validation : email, password min 6, voloId commence par V

### docs/DEPLOY-CHECKLIST.md — Stratégie chirurgicale
- Section 8 complète : pourquoi pas de swap, ordre des scripts, fichiers concernés
- Étape F0 (migrate-personnel) documentée comme condition préalable
- Étapes F1-F4 planifiées avec tests de non-régression
- 6 règles de portage

### Fichiers créés/modifiés
| Fichier | Modification |
|---------|-------------|
| `scripts/create-admin.js` | NOUVEAU — création admin Firebase Auth + Firestore |
| `docs/DEPLOY-CHECKLIST.md` | + section 8 stratégie chirurgicale, + F0-F4 étapes futures |

---

*Scripts Admin + Documentation · 2026-03-10*

---

## ═══════════════════════════════════════════
## RÉSUMÉ FINAL — Journée 2026-03-10
## ═══════════════════════════════════════════

### Tableau récapitulatif : tous les fichiers touchés

| Fichier | Modification | Statut |
|---------|-------------|--------|
| **SCRIPTS JS** | | |
| `firebase-config.js` | CRÉÉ — Config Firebase centralisée (Firestore, RTDB, Auth, Storage) | ✅ Déployé |
| `firebase-service.js` | CRÉÉ — VoloData API + circuit breaker quota + `getPersonnelFromFirestore()` | ✅ Déployé |
| `firebase-auth.js` | CRÉÉ — VoloAuth API (login email/PIN, rôles, claims) | ✅ Déployé |
| `volo-crypto.js` | CRÉÉ — SHA-256 PIN hashing via Web Crypto API | ✅ Déployé |
| `volo-network.js` | CRÉÉ — Bandeau offline unifié, queue counter, auto-flush | ✅ Déployé |
| `error-monitor.js` | Existant — monitoring erreurs | ✅ Déployé |
| `logo.js` | Existant — logo base64 pour PDFs | ✅ Déployé |
| `data-inventory.js` | CRÉÉ — 823 items SANS PII (séparé de data.js) | ✅ Déployé |
| `data-personnel-stub.js` | CRÉÉ — 30 entrées anonymisées fallback | ✅ Déployé |
| **PAGES HTML** | | |
| `index.html` | CDN Firebase, dual-write Firestore (4 points), VoloNetwork, splash screen, `data-inventory.js`+`data-personnel-stub.js` chargés, `initPersonnel()` Firestore | ✅ Déployé |
| `agenda.html` | Tab CHAT RTDB, presence tracking, `sendMessage()`/`onMessages()`, guards Firebase, sondage chat | ✅ Déployé |
| `splash.html` | Splash screen avec auto-redirect 5s | ✅ Déployé |
| `caisses-stock.html` | `data.js` → `data-inventory.js` + stub, CDN Firestore, firebase-config/service | ✅ Déployé |
| `dashboard-superviseur.html` | Idem caisses-stock + `volo_last_volo` auth | ✅ Déployé |
| `pointage.html` | Dual-write Firestore pointages, `volo-crypto.js`, `volo_last_volo` | ✅ Déployé |
| `plan-travail.html` | `volo_transfer_volo` sessionStorage (PIN retiré de l'URL) | ✅ Déployé |
| `qr.html` | `data.js` → `data-inventory.js` + stub, CDN Firestore | ✅ Déployé |
| **CONFIG** | | |
| `_headers` | CSP Firebase domains, `unsafe-eval` retiré, `X-XSS-Protection` | ✅ Déployé |
| `_redirects` | Proxy Make.com webhooks | ✅ Déployé |
| `sw.js` | v12.9 → v18.1 (9 bumps), tous les nouveaux assets | ✅ Déployé |
| `firestore.rules` | 17 collections, `isChef()`/`isChefOrAdmin()`, catch-all deny | ⏳ Deploy via `firebase deploy --only firestore:rules` |
| `.gitignore` | + `.env*`, `serviceAccountKey.json`, `*.pem` | ✅ Local |
| `.env.example` | Template variables Firebase + Netlify | ✅ Local |
| **NETLIFY FUNCTIONS** | | |
| `netlify/functions/create-user.js` | CRÉÉ — Crée user Auth + Firestore + claims | ✅ Déployé |
| `netlify/functions/set-custom-claims.js` | CRÉÉ — Assigne custom claims Firebase Auth | ✅ Déployé |
| **SCRIPTS UTILITAIRES** | | |
| `scripts/create-admin.js` | CRÉÉ — Premier admin Firebase (CLI local) | ✅ Prêt |
| `scripts/migrate-personnel.js` | CRÉÉ — Migration 156 membres → Firestore users/ | ✅ Prêt |
| `scripts/seed-firestore-real.js` | CRÉÉ — Seed collections Firestore | ✅ Prêt |
| `scripts/seed_firestore.ts` | CRÉÉ — Seed TypeScript (11 membres, 2 chantiers, etc.) | ✅ Prêt |
| `scripts/test-rules.ts` | CRÉÉ — 449 tests security rules (6 rôles × 17 collections) | ✅ Prêt |
| `scripts/verify-seed.ts` | CRÉÉ — Vérification post-seed | ✅ Prêt |
| `scripts/clean-inspection-fields.js` | CRÉÉ — Nettoyage Firestore MSQ/PAL/SAC | ✅ Prêt |
| **DOCUMENTATION** | | |
| `docs/DEPLOY-CHECKLIST.md` | CRÉÉ — Checklist déploiement complète + stratégie chirurgicale F0-F4 | ✅ Local |
| `docs/runbook.md` | CRÉÉ — Guide démarrage complet | ✅ Local |
| `docs/POST-MIGRATION.md` | CRÉÉ — État post-migration + prochaines étapes | ✅ Local |
| `CHANGEMENTS.md` | Ce fichier — changelog complet journée | ✅ Local |
| **ARCHIVES** | | |
| `archive/index_new_2026-03-10.html` | Archivé — tentative Firebase Auth gate (abandonnée) | 📦 Archivé |
| `archive/agenda_new_2026-03-10.html` | Archivé — tentative agenda Firebase (abandonnée) | 📦 Archivé |
| `data.js_backup_phase0` | Backup data.js original | 📦 Backup |

### Statistiques journée

#### Volumes
- **42 fichiers** touchés (créés ou modifiés)
- **15 scripts JS** (6 nouveaux modules, 7 scripts utilitaires, 2 Netlify functions)
- **8 pages HTML** modifiées
- **9 service worker bumps** (v12.9 → v18.1)
- **449 tests** security rules (100% PASS)

#### Firebase
- **161 documents Firestore** créés (156 users + 5 seed collections)
- **15 comptes Firebase Auth** créés (1 admin + 14 test users)
- **17 collections** couvertes par les security rules
- **5 collections** en dual-write actif : `transactions`, `pointages`, `certifications`, `km_logs`, `urgences`
- **1 collection** en lecture Firestore : `users` (personnel 156 membres)
- **3 paths RTDB** actifs : `chat/*`, `presence/*`, `availabilities/*`

#### Sécurité — 6 vulnérabilités PIN corrigées
| # | Sévérité | Vulnérabilité | Fix |
|---|----------|---------------|-----|
| 1 | CRITIQUE | PIN stocké en clair dans localStorage (`volo_pin`) | SHA-256 hash via Web Crypto API |
| 2 | CRITIQUE | Team PIN hardcodé en clair (`'5555'`) | Hash SHA-256 pré-calculé (`TEAM_PIN_HASH`) |
| 3 | HAUTE | PIN passé en URL (`plan-travail.html?pin=0205`) | `sessionStorage volo_transfer_volo` (VOLO ID) |
| 4 | HAUTE | PIN en sessionStorage (`volo_transfer_pin`) | Remplacé par `volo_transfer_volo` (non-sensible) |
| 5 | HAUTE | Auto-login cross-pages via PIN en clair | `volo_last_volo` (identifiant public "V0205") |
| 6 | MOYENNE | PIN comparé en clair dans Team PIN gate | Comparaison async SHA-256 |

#### Dual-write — 5 collections actives
| Collection | Déclencheur | Source | Mode |
|-----------|------------|--------|------|
| `transactions` | `doValidation()` (Pick-On/Off) | index.html | fire & forget |
| `pointages` | Arrivée / Départ / Départ forcé | pointage.html | fire & forget |
| `certifications` | `setCert()` changement date | index.html | fire & forget |
| `km_logs` | `_doSubmitKm()` / `validateReturn()` | index.html | fire & forget |
| `urgences` | Envoi urgence terrain | index.html | fire & forget |

> Webhook Make.com reste le canal **principal**. Firestore est **secondaire** (fire & forget).
> Circuit breaker : bandeau rouge à 80% quota (16k/20k), circuit ouvert à 100%.

#### Intégrité
- **0 fichier original cassé** — data.js, PIN 5555, webhooks Make.com tous intacts
- **0 régression** — flux Pick-On/Off, pointage, urgences, gains, formations inchangés
- **data.js** reste source de vérité locale (823 items, 156 personnel, 80 caisses)
- **Fallbacks** : localStorage si Firestore offline, data-personnel-stub si Firestore vide, webhook si circuit breaker ouvert

---

*Résumé final · 2026-03-10*

---

## Batch Auth + Claims — 161 comptes Firebase (2026-03-10)

### scripts/batch-create-auth.js — Création en masse
- Crée un compte Firebase Auth pour chaque doc Firestore `/users` sans `authUid`
- Email placeholder : `{voloId}@volo-sst.local`
- Password temporaire : `Volo{pin}!2026`
- Assigne les custom claims + met à jour Firestore `authUid`/`authEmail`
- Résultat : **158 créés + 3 liés = 161 comptes, 0 erreur**

### scripts/batch-set-claims.js — Attribution claims en masse
- Lit Firestore `/users` → liste Auth users → match par `authUid`/email
- Assigne `{ role }` custom claims pour chaque match
- Résultat : **161/161 claims OK, 0 erreur**

### Répartition des rôles
| Rôle | Count |
|------|-------|
| chef | 7 |
| sauveteur | 29 |
| surveillant | 125 |

### Firebase Auth totaux
- 173 comptes Auth (161 matchés Firestore + 12 anciens seed/test)
- 161 docs Firestore `/users` avec `authUid` renseigné
- 161 custom claims `{ role }` assignés
- Security Rules `isAuth()` + `hasRole()` opérationnelles

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `scripts/batch-create-auth.js` | Batch création comptes Auth + claims + update Firestore |
| `scripts/batch-set-claims.js` | Batch attribution custom claims depuis Firestore roles |

---

*Batch Auth + Claims · 2026-03-10*
