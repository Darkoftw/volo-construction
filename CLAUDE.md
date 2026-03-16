# VOLO SST V20.7 — Golden Eagles

---

## Projet
Application de gestion SST (Santé-Sécurité au Travail) pour l'équipe de sauvetage technique "Golden Eagles" de VOLO Construction. Gère l'inventaire d'équipement, le pointage du personnel, les certifications, les gains automatiques, les urgences terrain, le push notifications FCM, le tracking GPS géofencing, et les rapports CNESST avec IA.

---

## Stack Technique
- **Frontend** : Vanilla HTML/CSS/JS — **PAS** de React, **PAS** de build tools
- **Backend** : Make.com webhooks → Google Sheets + Firebase (dual-write)
- **Firebase** : Auth + Firestore + Realtime DB + Storage + FCM (compat v9.23.0)
- **IA** : Claude API (Anthropic) — analyse CNESST, plan de travail
- **Déploiement** : Netlify drag & drop — **JAMAIS** Netlify CLI (brûle les crédits)
- **Scanner QR** : `getUserMedia()` + `jsQR` (CDN jsdelivr) — **JAMAIS** Html5Qrcode (miroir iOS, swap cassé)
- **Carte** : Leaflet.js + CartoDB dark tiles
- **PDF** : jsPDF + jspdf-autotable (direct drawing, pas html2canvas)
- **Design** : Dark theme rescue "Tactical Eagle Dark" — voir `DESIGN-SYSTEM-VOLO.md`

---

## Architecture Fichiers
```
├── index.html                  # App principale (~8400 lignes — inventaire, scan QR, transactions, gains, FCM push)
├── data.js                     # Données centralisées — 823 items, 156 personnel, 80 caisses, DESTINATIONS, DEPOTS, REMORQUES
├── caisses-stock.html          # Inventaire temps réel — KPIs, alertes, category tabs, destruction
├── qr.html                     # QR Inventaire — génération/impression QR (3 formats print)
├── dashboard-superviseur.html  # Dashboard superviseur (Leaflet map, Firestore live, météo par site)
├── pointage.html               # Module de pointage terrain (PIN → lieu → webhook)
├── plan-travail.html           # Plan de travail 6 étapes + IA (Claude API proxy)
├── agenda.html                 # Agenda équipe (~4000 lignes — chat Firebase, conflits, sparklines)
├── rapport-cnesst.html         # ★ Rapport conformité CNESST (auto-fill + Claude IA + PDF A4 pro)
├── tracker-chantier.html       # ★ Tracker GPS géofencing (Leaflet + watchPosition + auto-pointage)
├── presentation.html           # Page présentation VOLO
├── lexique.html                # Lexique équipements
│
├── firebase-config.js          # Firebase init (app, auth, firestore, database, storage, messaging)
├── firebase-service.js         # Service layer Firebase (dual-write, FCM, Storage, onSnapshot)
├── firebase-auth.js            # Auth helpers
├── firebase-messaging-sw.js    # Service Worker FCM (background push notifications)
├── volo-crypto.js              # Chiffrement données sensibles
├── volo-network.js             # Helpers réseau + offline queue
├── error-monitor.js            # Capture erreurs globales → localStorage + webhook
├── logo.js                     # VOLO_LOGO_B64 (eagle_tactic.png en base64, partagé par tous les PDF)
│
├── sw.js                       # Service Worker principal (cache v20.7, 15+ assets)
├── _headers                    # Headers Netlify (CSP — inclut unpkg, jsdelivr, anthropic, firebase)
├── firestore.rules             # Règles sécurité Firestore
├── firebase.json               # Config Firebase (functions source)
├── functions/                  # Cloud Functions (sendPushNotification — Firestore trigger)
│   ├── index.js                # onCreate /notifications → FCM multicast
│   └── package.json            # Node 20, firebase-admin, firebase-functions
├── scripts/                    # Scripts utilitaires Node.js
│   ├── set-admin.js            # Set V0205 comme admin (Auth claims + Firestore)
│   └── find-milone.js          # Liste Auth users
│
├── eagle.mp3                   # Son cri d'aigle (succès transaction)
├── eagle_tactic.png            # Logo Golden Eagles
├── destroy_item.py             # Script destruction items (data.js + Excel)
├── CLAUDE.md                   # Ce fichier — LA BIBLE du projet
├── photos/                     # Photos équipements (PNG/JPEG)
└── photos/team/                # Photos équipe (carousel accueil)
```

---

## Fichier data.js — Données Partagées
Chargé via `<script src="data.js">` dans tous les HTML. Contient :
- `PERSONNEL` (156 personnes) — `{id, volo, name, role, type, region, ville}`
- `SAUVETEURS` = alias de PERSONNEL
- `ITEMS` (823 items) — `{id, name, cat, icon, etat, desc, fab, serial, volo_id, expiry, inspBy, inspDate, notes, couleur?, qty?}`
  - **739 items sauvetage** (source : XLSX V9 INVENTAIRE COMPLET) — IDs: SAC/PAL/MSQ/ASP/ANC/DES/PUL/SNG/LNG/PRU/COR/FHK/BTL/RSP/BNK/HAR/VET/etc.
  - **5 items réserve** (DES-020, CRM-001, RUB-001→003) — extras hors XLSX
  - **79 items surveillant** (SURV-001→088) — source : CSV Surveillant, items bulk avec `qty`
- `ITEM_CATEGORIES` — array dérivé des catégories
- `SAC_COLORS` — couleurs tape par sac (Bleu/Vert/Rouge/Jaune)
- `COULEUR_HEX` — mapping couleur nom -> hex (dans index/caisses-stock/qr)
- `DEPOTS` (5) — `{id, name, region}`
- `DESTINATIONS` (9) — `{id, name, region}`
- `REMORQUES` (4) — `{id, name}` (Pick-Up 1/2, Trailer 1/2)
- `CERTS_LIST` (10 certifications) — `{id, name, dur (mois), icon}`
- `BAREMES` — taux par rôle
- `ITEMS_MAP` — Map(id → item) pour lookup rapide

---

## Webhooks Make.com
```
Principal : https://hook.us2.make.com/wm4fvbqy87nfcuf111azq02l3w2a87sh
Urgences  : https://hook.us2.make.com/eha54bbek46jrg1yp88939167v7ngveh
```

### Types de Payload
| Type | Description | Notes |
|------|-------------|-------|
| (transaction) | PICK-ON / PICK-OFF inventaire | Payload principal avec items JSON |
| `ITEM_LOG` | Batch items scannés | V9.1 : 1 webhook avec `items_array` JSON |
| `POINTAGE` | Arrivée/Départ terrain | Via pointage.html |
| `URGENCE` | Alerte urgence terrain | Via bouton urgence rouge |
| `KM_LOG` | Kilométrage véhicule perso | Via module KM |
| `PHOTO_LOG` | Photos chantier | lieu obligatoire, contrat optionnel |
| `CERT_UPDATE` | Mise à jour certification | Auto-save sur changement date |
| `ANNULÉ` | Annulation transaction | Timer 5min côté client |
| `RETOURNÉ` | Clôture PICK-ON via PICK-OFF | Marque l'original comme retourné |

---

## Flux Principal (index.html)
1. **PIN** (4 chiffres = VOLO ID) → auto-login sauvé en localStorage
2. **Accueil** → PICK-ON / PICK-OFF / Photos / KM / Pointage / Gains / Formation
3. **Véhicule** → sélection Pick-Up ou Trailer (multi-select)
4. **Dépôt** → sélection dépôt d'origine
5. **Destination** → sélection + N° projet + contact terrain
6. **Sauveteurs** → sélection multi (filtre par région/rôle)
7. **Scan Items** → caméra QR ou sélection manuelle (filtre par catégorie et recherche)
8. **Confirmation** → résumé complet avant envoi
9. **Succès** → 🦅 cri d'aigle + timer annulation 5min

---

## Restrictions par Rôle

### CHEF D'ÉQUIPE (5 au total — accès complet + marqueur ⭐)
Tout le niveau SAUVETEUR + badge `⭐ CHEF` gold, étoile dans plan de travail
Helper : `isUserChef()` — à implémenter

### SAUVETEUR (accès complet)
Pick-On/Off, Dashboard, Photos, Kilométrage, Historique, Formation complète (docs + tracker équipe + Google Drive), Dashboard Sauvetage, Mes Gains, Pointage
Couleur : `--rescue #E65100` orange

### SURVEILLANT (accès limité)
- ✅ Pointage d'heures
- ✅ Mes Gains (per diem 150$, km 0.63$/km)
- ✅ Formation : Mes Certifications seulement
- ✅ Pick-On / Pick-Off : visible mais sans fonctionnalité (futur : EPI uniquement)
- ❌ Dashboard, Photos, Kilométrage, Historique, Dashboard Sauvetage
- Helper : `isUserSurv()` vérifie `localStorage.getItem('volo_last_role')==='SURVEILLANT'`

Couleur : `--blue #3B82F6`

### Couleurs rôles (règle stricte)
```
CHEF       → --gold   #D4A017  + ⭐
SAUVETEUR  → --rescue #E65100
SURVEILLANT → --blue  #3B82F6
```

---

## Barèmes
```
SAUVETEUR  : km 0.68$/km · perdiem 200$ · urgence 64$/h · urgence_perdiem 0$
SURVEILLANT: km 0.63$/km · perdiem 150$ · urgence 0$
```

---

## Scanner QR — Architecture Actuelle (V9.2)

**⚠️ IMPORTANT** : Html5Qrcode retiré — causait caméra miroir iOS et swap impossible.

### Stack scanner
```javascript
// CDN requis dans le <head>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>

// Variables globales
let _mainStream = null;      // Stream getUserMedia principal
let _mainAnimFrame = null;   // requestAnimationFrame loop
let _mainVideo = null;       // Élément <video> du scanner
let _camFacing = 'environment'; // Caméra active
let _rearDeviceId = null;    // deviceId caméra arrière (énuméré au premier scan)
let _frontDeviceId = null;   // deviceId caméra frontale
```

### Pattern getUserMedia + jsQR
```javascript
async function startQrScanner() {
  // 1. getUserMedia avec 3 fallbacks (exact → normal → any)
  // 2. video.srcObject = stream
  // 3. requestAnimationFrame loop → jsQR sur chaque frame
  // 4. onQrSuccess(code.data) quand détecté
}

function swapCamera() {
  _camFacing = (_camFacing === 'environment' ? 'user' : 'environment');
  stopQrScanner();
  setTimeout(startQrScanner, 300);
}

function stopQrScanner() {
  cancelAnimationFrame(_mainAnimFrame);
  _mainStream?.getTracks().forEach(t => t.stop());
  _mainStream = null; _mainVideo = null;
}
```

### Modal Scan Test (accueil, 1 clic)
Même pattern getUserMedia + jsQR, variables préfixées `_test*`, indépendant du wizard.

---

## Anti-Fraude (KM Perso)
- `getAutoGains()` utilise `Math.max()` au lieu d'additionner les KM par jour
- Plafond : 500km max par entrée
- 1 entrée max par jour par utilisateur
- Verrou pointage : le pointage doit exister pour que le per diem compte

---

## Modules
- **📸 Photos** : lieu obligatoire, contrat optionnel
- **🚗 KM Perso** : aller-retour, véhicule personnel ou VOLO, odomètre
- **💰 Mes Gains** : auto-calculé depuis pointage + KM, export CSV
- **📋 Formation** : certifications avec expiration, vue équipe
- **🚨 Urgences** : bouton fixe rouge, modal rapide, webhook séparé
- **📴 Hors-ligne** : queue localStorage, auto-retry à reconnexion
- **📷 Scan Rapide Test** : modal indépendant depuis l'accueil

---

## Conventions de Code
```javascript
// State global
state = { step, pin, depot, mode, scanned, ... }
setState(updates)   // merge + re-render
render()            // dispatche vers renderXxx() selon state.step

// Utilitaires
showToast(msg, type)  // type: 'ok' | 'err' | 'off' | 'info'
tsNow()               // timestamp ISO
saveToHistory(payload)

// Timers
LOCK_DELAY = 300000   // 5min inactivité → lock screen
// Timer annulation 5min côté client (webhook envoyé immédiatement)
```

---

## qr.html — Spécificités
- Lib QR : `qrcodejs` (CDN cdnjs) pour **générer** les QR codes
- Layout cartes : QR centré en haut (100% width, aspect-ratio:1) — pas de fixed px (évite le rognage)
- Sélection multiple avec glass effect (backdrop-filter blur)
- `genQR(containerId, text, size)` → `new QRCode(el, {...})`
- 3 formats d'impression : `print-2col`, `print-3col` (défaut), `print-4col`
- Bordure gauche colorée sur les cartes items avec `couleur` (tape du sac)

---

## caisses-stock.html — Spécificités
- 5 KPIs cliquables : Disponible, Déployé, Inspection, Maintenance, Destruction
- 7 category tabs : TOUS, SACS, CAISSES, SURPLUS, KITS, AUTRE, SURVEILLANT
- Alert panel détaillé (getAlertItems) avec 6 catégories, anti-doublon
- Pastille couleur (12px dot) sur chaque carte item + dans le modal détail
- `etatToStatus()` : "A surveiller" = `disponible` (PAS inspection)
- URL params: `?q=`, `?filter=`, `?tab=` pour deep linking depuis index.html
- Groupement par caisse/cat quand un filtre est actif (pas de scroll infini)

---

## V9.3 Ajouts (2026-03-09)
- Usage tracker : entrée manuelle heures, modal stop éditable, conditions (sale/endommagé/etc)
- Alertes détaillées cliquables sur accueil → deep link vers caisses-stock
- Couleur de tape (Bleu/Vert/Rouge/Jaune) sur 228 items des sacs
- Pastille couleur visible dans inventaire, QR, et scan

---

## V9.4 Ajouts (2026-03-09)

### Design — Section TERRAIN
- **Carousel photo** : 4 photos d'équipe (`photos/team/`) auto-rotate 4.5s, fade transition, overlay gradient
- **Terrain Cards V3** : 5 cartes redesignées avec couleurs thématiques (rescue/gold/green/blue/purple)
  - Dashboard (orange), Photos (gold), Kilométrage (vert), Historique (bleu), Utilisation (violet full-width)
  - Top accent bar, icon glow, badges dynamiques, pulse animation sur session active
- Boutons SCAN RAPIDE TEST et TEST supprimés

### Destruction d'items (depuis l'app)
- Bouton **☠️ DÉTRUIRE** dans le modal détail item (caisses-stock.html)
- Confirmation 2 étapes avec champ **raison** obligatoire
- Items détruits stockés dans `volo_destroyed` + `volo_destroyed_log` (localStorage)
- Filtre automatique au chargement : items supprimés de ITEMS + CAISSES dans index, caisses-stock, qr
- Bandeau violet dans caisses-stock avec liste détruits, notes, dates, bouton **RESTAURER**
- Bouton **EXPORTER** → fichier `.txt` avec commande `python destroy_item.py ID1 ID2`
- Script `destroy_item.py` : supprime définitivement de data.js + Excel (backup auto)

### Fixes techniques
- **Batch ITEM_LOG** : 1 seul webhook avec `items_array` JSON au lieu de N×500ms
- **Dead code Html5Qrcode** : `qrScanner` et legacy compat supprimés de `stopQrScanner()`
- **confirm()/prompt() → modals dark-theme** :
  - `scanGroup()` → modal scanGroupConfirm + scanGroupMissing (textarea note)
  - `scanItem()` → modals scanUnexpected + scanSurveiller (note obligatoire)
  - `leaveScan()` → modal leaveScan (Rester/Quitter)
  - `startPickOn()` → modal pickOnBlocked (compteur + PICK-OFF)
- **Modal urgence** : select/textarea liés à `state.urgenceType` + `state.urgenceNote`
- **Cancel timer** : reset `cancelSeconds=300` dans `startCancelTimer()`
- **isUserChef()** : normalisé avec `.toUpperCase().includes('CHEF')`
- **isStockManager()** : fix comparaison "CHEF D'ÉQUIPE" → "CHEF D'EQUIPE"

### localStorage (nouveaux)
- `volo_destroyed` — array d'IDs d'items détruits
- `volo_destroyed_log` — array `{id, name, note, date, by}` pour chaque destruction

---

## Régions (7)
`ESTRIE` · `CAPITALE-NATIONALE` · `MAURICIE` · `LANAUDIÈRE` · `MONTRÉAL` · `OUTAOUAIS` · `BAS-ST-LAURENT`

---

## V10.1 Ajouts (2026-03-10)

### ⚠️ RÈGLE CRITIQUE — Groupement d'items identiques
**JAMAIS** afficher 20 lignes identiques du même item. Quand 3+ items ont le même nom ET la même couleur de tape, les regrouper en UNE SEULE carte avec un badge `×N` (ex: `×6`, `×12`). Le clic sur la carte déplie la liste pour sélectionner un item individuel.
- Clé de groupement : `name|couleur` (PAS juste name — ne pas mélanger un Palan bleu et un Palan vert)
- Fonction : `renderGroupedItems(items)` dans caisses-stock.html
- Classe CSS : `.item-group-card`, `.item-group-expand`, `.group-badge`

### Fusion des caisses par type
Les caisses sont mergées par leur champ `type` (sac/caisse/surplus/kit/autre). Tous les sacs dans UN bloc, tous les surplus dans UN bloc, etc. — PAS de blocs séparés pour "Sac Premonter #1" et "Sac Premonter #2".
- `getMergeKey()` utilise `caisse.type` pour regrouper
- Badge tape couleur combiné pour chaque sac du groupe
- Tri par nombre d'items décroissant (plus gros groupes en premier)

### Badge nombre d'items sur cartes caisses
Chaque carte caisse/sac affiche un petit badge avec le nombre d'items (`font-size:10px`) — visible AVANT de cliquer sur l'onglet. Le badge ne doit PAS masquer le badge couleur de tape.

### Bouton "TOUT DISPONIBLE" (reset global)
- Bandeau violet dans caisses-stock.html quand des items sont "sorti"
- Bouton 1-clic pour remettre TOUS les items à "disponible"
- Nettoie 3 sources : `volo_history`, `volo_caisse_statuts`, `volo_incidents`
- `_parseHistItems(h)` : parse le champ `items` de l'historique (stocké en JSON string)
- `_executeResetAll()` : boucle sécurisée (snapshot longueur, pas de forEach+push)

### PICK-OFF expansion sacs (index.html)
`selectPickoffDeployment()` : utilise `fromGroup` et `caisses_utilisees` pour trouver tous les `items_contenus` des caisses utilisées et ajouter les items manquants à la liste attendue. Rend TOUS les items d'un sac, pas juste le sac lui-même.

### Fixes PDF — TOUTES les pages
Appliqué sur **tous** les générateurs PDF (caisses-stock, index gains, dashboard-superviseur, plan-travail) :
1. `position:'fixed'` → `position:'absolute'` (html2canvas ne capture pas les éléments fixed)
2. Supprimé `'avoid-all'` du mode pagebreak (causait des pages blanches)
3. Pré-chargement images via `Promise.all(img.onload)` avant capture
4. `allowTaint:true` dans html2canvas

### "VOLO CONSTRUCTION SST"
Texte mis à jour dans tous les PDF-generating HTML (index, caisses-stock, dashboard-superviseur, plan-travail).

### SAC_COLORS lookup fix
`SAC_COLORS` est indexé par **nom du sac** (ex: `"Sac Premonter #1"`) et **NON** par catKey (`"caisse_GRP-PM1"`). Lookup : `SAC_COLORS[c.nom || c.name]`.

### logo.js
Fichier partagé `VOLO_LOGO_B64` (eagle_tactic.png en base64) chargé par toutes les pages PDF.

---

## Règles Absolues
1. **JAMAIS** Netlify CLI — drag & drop uniquement
2. **JAMAIS** Html5Qrcode — getUserMedia + jsQR uniquement
3. **JAMAIS** React/build tools — vanilla uniquement
4. **JAMAIS** #000 ni #FFF — utiliser --bg et --txt
5. `data.js` doit être dans le même dossier que les HTML
6. Toujours vérifier la balance des accolades après modification
7. Préfixe `volo_` pour tout localStorage
8. **JAMAIS** afficher des lignes répétées d'items identiques — toujours grouper avec badge ×N
9. **TOUS** les PDF doivent être clean : pas de page blanche, logo visible, mise en page propre
10. `SAC_COLORS` indexé par NOM du sac, pas par catKey
11. **JAMAIS** de doublons d'items — source de vérité = XLSX V9 INVENTAIRE COMPLET (739 IDs)
12. Cordages = **CRD-001→012**, Chiennes = **CHT-001→006** — QR codes collés, ne JAMAIS renommer ces IDs
13. Mousquetons Petzl → utiliser le nom du modèle : `"William"`, `"Vulcan"`, `"Bm'D"`, etc. (PAS "Mousqueton William", PAS "WILLIAM" en majuscules)
14. Caisses surveillant (CSURV-xx) : **1 caisse par numéro physique** — ne pas splitter une même caisse en 2 entrées

---

## V10.2 Ajouts — agenda.html (2026-03-10)

### Audit code + bugfixes
- **`updateDots()` non définie** — retiré (crash logout)
- **`renderChefDayDetail()` crash JOUR/NUIT** — ajouté dans cnts/byS/itérations
- **`renderChefGrid()` ignorait JOUR/NUIT** — ajouté dans counts, sommé dans badge DISPOS
- **Code mort supprimé (~95 lignes)** : `renderWeekView`, `prevWeek`, `nextWeek`, `getWeekDays`, `calView`, `weekOffset`, `renderStatusPicker`

### Feature 1 — Mode hors-ligne + sync queue
- Détection online/offline avec bandeau `#offlineBanner`
- Queue localStorage `volo_agenda_offline_queue` pour les changements hors-ligne
- `flushOfflineQueue()` envoie les changements au retour de connexion
- `setAvail()` patché : queue auto si offline ou si fetch échoue

### Feature 2 — Conflits automatiques
- `detectConflicts()` croise contrats actifs vs dispos (INDISPO/VACANCES/FORMATION)
- `renderConflictAlerts()` dans le dashboard chef — alertes rouges par personne
- Visible au-dessus des tabs sur la page d'accueil chef

### Feature 3 — Historique / tendances (sparklines)
- Snapshot hebdomadaire auto (`takeSnapshot()`) — taux réponse + taux dispo
- Stocké dans `volo_agenda_weekly_snapshots` (max 12 semaines)
- `renderHistoryPanel()` avec sparklines colorées dans le dashboard chef

### Feature 4 — Rappels automatiques
- `getMembresNonRepondus(7)` identifie les membres sans aucune réponse sur 7 jours
- `renderRappelBanner()` avec point pulsant rouge + bouton RELANCER (mailto groupé)
- Seuil : affiché quand 3+ membres sans réponse

### Feature 5 — Mini-map Leaflet
- Carte Québec avec bulles colorées par région (vert/jaune/rouge selon % dispos)
- CDN Leaflet + CartoDB dark tiles
- `REGION_COORDS` pour 7 régions, `updateMapMarkers()` rafraîchi à chaque render
- Popup au clic : nom région + X/Y dispos (%)

### Feature 6 — Export PDF récap
- CDN html2canvas + jsPDF + logo.js (VOLO_LOGO_B64)
- `exportRecapPDF()` génère un PDF dark-theme avec header logo, stats, tableau jour par jour
- Bouton dans l'onglet RÉCAP : "📄 EXPORTER PDF"
- Multi-page automatique si contenu trop long

### Feature 7 — Score de fiabilité
- `getReliabilityScore(uid)` — % de jours avec réponse sur les 30 derniers jours
- `renderReliabilityBadge(uid)` — badge coloré (Fiable/Moyen/Faible) dans la matrice RÉCAP
- Visible sur chaque ligne membre dans le récap

### localStorage (nouveaux)
- `volo_agenda_offline_queue` — array de changements en attente de sync
- `volo_agenda_weekly_snapshots` — array de snapshots hebdomadaires {date, tauxReponse, tauxDispo, ...}

---

## V10.3 Ajouts — Chat temps réel (2026-03-10)

### 💬 Tab CHAT dans agenda.html
- Nouvel onglet après ÉQUIPE dans la barre de tabs
- Badge unread count animé sur l'onglet

### Firebase Realtime Database
- CDN Firebase compat v9.23.0 (`firebase-app-compat.js` + `firebase-database-compat.js`)
- Config placeholder dans `firebaseConfig` — requiert clés réelles pour fonctionner
- **Fallback localStorage** : fonctionne sans Firebase (stockage local `volo_agenda_chat_messages`)
- Listeners temps réel : `chatStartListening()` / `chatStopListening()`

### Canal général
- Messages visibles par tous les membres de l'équipe
- Groupement par auteur (fenêtre 2 min) — pas de répétition nom/avatar
- Séparateurs de jours automatiques
- Auto-scroll + bouton "Nouveaux messages" quand scroll décalé

### Messages privés (DM) — Chef uniquement
- `chatOpenDM(targetId)` ouvre une conversation privée
- DB path : `private/{id1}_{id2}/{id}` (IDs triés alphabétiquement)
- Liste DM avec `chatShowDMList()` + filtre recherche `chatFilterDM()`
- `chatBackToGeneral()` retour au canal général

### @Mentions avec autocomplete
- `chatOnInput()` détecte `@` et affiche dropdown `.chat-mention-dd`
- `chatInsertMention(name)` insère le nom dans le message
- `chatProcessMentions(text)` transforme `@Nom` en spans colorés
- Notification visuelle pour les mentions reçues

### Épingler des messages — Chef uniquement
- `chatPin(msgId)` / `chatUnpin(msgId)` — un seul message épinglé à la fois
- Message épinglé affiché en haut du chat avec fond doré

### Réactions emoji
- 4 emojis : 👍 ✅ ❌ ➕
- `chatReact(msgId, emoji)` — toggle par utilisateur
- Compteurs visibles sous chaque message
- Hover actions : réactions + pin (chef) apparaissent au survol

### CSS Chat (~100 lignes)
- `.chat-wrap`, `.chat-bubble.mine/.other`, `.chat-mention`
- `.chat-reactions`, `.chat-hover-actions`, `.chat-mention-dd`
- `.chat-dm-list`, `.tab-badge` (badge unread animé)
- Dark theme cohérent avec le design rescue

### Fonctions chat (25 fonctions)
- State : `chatMessages`, `chatMode`, `chatDmTarget`, `chatUnreadCount`, `chatMentionDropdown`
- Render : `renderChat()`, `initChatUI()`, `chatRenderFull()`, `chatRenderMessages()`
- Actions : `chatSend()`, `chatReact()`, `chatPin()`, `chatUnpin()`
- DM : `chatOpenDM()`, `chatBackToGeneral()`, `chatShowDMList()`, `chatFilterDM()`
- Mentions : `chatOnInput()`, `chatInsertMention()`, `chatProcessMentions()`
- Listeners : `chatStartListening()`, `chatStopListening()`

### localStorage (nouveaux)
- `volo_agenda_chat_messages` — fallback quand Firebase non configuré
- `volo_agenda_chat_unread` — compteur messages non lus

---

## V10.4 Ajouts — Fusion data.js (2026-03-10)

### Fusion des 3 sources d'inventaire
Sources croisées : CSV Inspection (base), CSV Surveillant, XLSX V9 INVENTAIRE COMPLET (739 QR IDs — source de vérité)

### Items ajoutés (10)
- `SURV-030` — Casque sauveteur Orange vertex (Caisse 15, qty 7)
- `SURV-050` — TYCHEM combinaison (Sac 21, qty 1)
- `LNG-008` — Longe 10', orange, SL Tech
- `SNG-034` — Sangle d'ancrage Hiigard 6' (serial 143900115)
- `CRD-001→012` — 12 cordages surplus sauvetage (IDs originaux, QR collés)
- `CHT-001→006` — 6 chiennes de travail Nomex (IDs originaux, QR collés)

### Doublons supprimés (1)
- `BTL-011` — XLSX V9 a 10 bouteilles, pas 11

### Caisses corrigées
- **CSURV-09 + CSURV-27** mergées → Caisse 17 (ajout SURV-028, count 5)
- **CSURV-10 + CSURV-28** mergées → Caisse 18 (ajout SURV-044/045, count 8)
- **CSURV-14 + CSURV-29** mergées → Caisse 23 (ajout SURV-088, count 8)
- **CSURV-27, CSURV-28, CSURV-29** supprimées (fusionnées)
- **CSURV-30** ajoutée (Sac 21, SURV-050)
- **GRP-CRD, GRP-CHT1, GRP-CHT2** supprimées (doublons)
- **GRP-BTL** count 11→10, retiré BTL-011
- **GRP-SSV** count 11→17, ajouté COR-013→018

### Renommages
- 40 items `"WILLIAM"` / `"William"` → `"Mousqueton William"`

### Compteurs finaux
- **823 items** (739 sauvetage + 5 réserve + 79 surveillant)
- **80 caisses**
- 0 doublons, 0 orphelins

---

## V10.5 Ajouts — Sécurité, Météo, Certifications (2026-03-10)

### JOB 1 — Sécurité & PIN d'équipe
- **Team PIN gate** : code 4 chiffres requis avant accès à l'app
  - `const TEAM_PIN = '5555'` (ligne ~776 index.html)
  - 3 tentatives max, blocage après → `logUnauthorizedAccess()`
  - Expiration 30 jours (`volo_team_pin_ts` localStorage)
  - Keypad numérique tactile, dots visuels
- **Emails retirés de data.js** : 153 champs `email:""` vidés
- **`emails_prives.js`** créé hors du dossier deploy (153 entrées VOLO→email)
- **`.gitignore`** : exclut `emails_prives.js`

### JOB 2 — Backup & Résilience
- `exportBackup()` — export JSON de toutes clés `volo_*` localStorage
- `importBackup()` — restore depuis fichier JSON + reload
- `safeGetLS()` / `safeSetLS()` — wrappers anti-corruption localStorage
- `VOLO_VERSION = 'V10.5'` — constante version
- `renderVersionFooter()` — "VOLO SST V10.5 — Golden Eagles" en bas de l'accueil
- Boutons 💾 BACKUP / 📥 RESTAURER dans l'accueil chef

### JOB 3 — Widget Météo
- `fetchWeather()` — Open-Meteo API (Sherbrooke 45.40, -71.89)
- Cache 1h dans `volo_weather_cache` localStorage
- Icons WMO (`WMO_ICONS`, `WMO_LABELS`) — 30+ codes météo
- `renderWeatherWidget()` — icône + temp + label + vent
- Injection async dans `#weatherSlot` après render accueil
- Fail silent si API offline

### JOB 4 — Certifications par membre
- `CERTS_DEFS` — 10 certifications : RCR, PDSB, SIMDUT, Nacelle, Chariot, Espace clos, Travail en hauteur, Sauvetage, Électricité, Premiers secours
- `getCerts(voloId)` / `setCert(voloId, certId, date)` — CRUD localStorage
- `getCertStatus(date, durMois)` — auto-calcul OK/Warning 30j/Expiré/Non renseigné
- Badges colorés `.cert-badge.ok/.warn/.exp`
- `renderCertSection(voloId)` — section dans profil membre
- Date picker éditable pour chefs uniquement
- Webhook `CERT_UPDATE` envoyé sur modification
- `getCertAlerts()` — alertes dans Chef Dashboard (expirés + warning)

### JOB 5 — Historique missions par membre
- `getMemberHistory(voloId)` — filtre historique par VOLO ID
- `getMemberPointage(voloId)` — filtre pointage par VOLO ID
- `getMemberStats(voloId, days)` — stats 30/60/90 jours
- `renderMemberTimeline(voloId)` — timeline 20 dernières missions
- PICK-ON orange / PICK-OFF bleu dans timeline
- Cartes stats 30j/60j/90j dans profil

### JOB 7 — Annonces & Alertes Urgence
- `getAnnouncement()` / `setAnnouncement(text)` — localStorage
- `showAnnounceModal()` — modal chef publier/retirer/annuler (DOM createElement)
- Bannière gold sur accueil (`escapeHtml` XSS safe)
- `getEmergencyAlert()` / `setEmergencyAlert(text)` — localStorage + Firebase + webhook
- `showEmergencyModal()` — modal chef avec textarea requis (DOM createElement)
- `liftEmergencyAlert()` — lever alerte + log Firebase
- Bouton LEVER visible chef uniquement
- Boutons 📢 ANNONCE / 🚨 URGENCE dans accueil chef

### JOB 9 — Optimisation iOS Safari
- Meta tags : `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-fullscreen`
- `input,select,textarea{font-size:16px!important}` — anti-zoom iOS
- `.btn,.card,.tab-btn{min-height:48px}` — touch targets
- `-webkit-overflow-scrolling:touch` sur zones scroll
- `-webkit-tap-highlight-color:transparent` sur buttons/cards
- `-webkit-appearance:none` sur inputs
- `touch-action:manipulation` sur buttons

### Dashboard Superviseur
- Bouton **LEVER L'ALERTE** ajouté après déclenchement urgence (corrige le bug écran flou permanent)

### Service Worker
- Cache bumped `volo-sst-v11.4` → `v11.5` (par user)

### Fichiers nouveaux
- `emails_prives.js` — **hors deploy**, dans `volo inventory v3/`
- `rapport_v10.5.html` — rapport tests 96/100 A+ (53 tests)
- `backup_2026-03-10/` — backup daté des originaux

### localStorage (nouveaux)
- `volo_team_pin_ts` — timestamp validation PIN équipe (30 jours)
- `volo_unauth_log` — log tentatives non autorisées (max 100)
- `volo_weather_cache` — cache météo Open-Meteo (TTL 1h)
- `volo_certs_{voloId}` — certifications par membre
- `volo_announcement` — annonce chef active
- `volo_announce_dismissed` — timestamp dismiss annonce
- `volo_emergency_alert` — alerte urgence active

### Fonctions ajoutées (27)
`isTeamPinValid`, `showTeamPinGate`, `logUnauthorizedAccess`, `exportBackup`, `importBackup`, `renderVersionFooter`, `safeGetLS`, `safeSetLS`, `fetchWeather`, `renderWeatherWidget`, `getCerts`, `setCert`, `getCertStatus`, `renderCertSection`, `getCertAlerts`, `getMemberHistory`, `getMemberPointage`, `getMemberStats`, `renderMemberTimeline`, `getAnnouncement`, `setAnnouncement`, `renderAnnounceBanner`, `getEmergencyAlert`, `setEmergencyAlert`, `liftEmergencyAlert`, `renderEmergencyBanner`, `showAnnounceModal`, `showEmergencyModal`

---

---

## V20 Ajouts — Firebase Integration (2026-03-11)

### Phase 1 : Dual-Write (Webhook + Firebase en parallèle)
- Firebase = copie shadow, Make.com webhook = canal principal
- Pattern fire & forget : `VoloData.xxx().catch(e => console.warn(e))`
- PIN terrain (5555) INTACT — pas de Firebase Auth gate

### Firebase Config (`firebase-config.js`)
- CDN compat v9.23.0 : app, auth, firestore, database, storage, messaging
- VAPID key pour FCM web push
- `window.firebaseMessaging` init conditionnel

### Firebase Service (`firebase-service.js`)
- **FCM** : `requestNotificationPermission()`, `onForegroundMessage()`, `notifyUrgence()`, `notifyUrgencyAlert()`
- **Storage** : `uploadPhotoBase64()`, `savePhotoMetadata()`, `uploadPhoto()` avec `_ensureAuth()`
- **Listeners** : `onUrgencesChange()`, `onPointagesChange()`, `onPhotosChange()` (Firestore onSnapshot)
- **CRUD** : `getItemsFromFirestore()`, `getCaissesFromFirestore()`, `initItems()`
- Toutes les fonctions exposées dans l'objet public `VoloData`

### Cloud Functions (`functions/index.js`)
- `sendPushNotification` : Firestore onCreate trigger sur `/notifications/{notifId}`
- Lit tokens FCM depuis `/fcm_tokens`, filtre par `targetRole` optionnel
- Envoie via `messaging.sendEachForMulticast()`
- Nettoie tokens invalides, marque notification comme envoyée
- **Node 20**, firebase-admin ^11.11.0, firebase-functions ^4.5.0

### Firestore Rules
- `/fcm_tokens/{voloId}` : read/write si isAuth()
- `/notifications/{docId}` : read + create si isAuth(), update si isAdmin()

### FCM Background SW (`firebase-messaging-sw.js`)
- Gère les push en arrière-plan (vibration, icon eagle, click → ouvre l'app)
- importScripts firebase compat SDK

### Dashboard Superviseur — Live Data
- 3 listeners onSnapshot : urgences, pointages, photos
- Sections live : `secLiveUrgences`, `secLivePointages` avec badges compteurs
- `checkAuth()` reécrit : fallback `volo_last_volo` → `volo_pin`, AUTH_ROLES inclut ADMIN/CHEF
- Auth V0205 : uid `n0QYtrL64EQhHqWBIxWaZ9HDL3g1` + `z02SmIflUrOYsGOhVznvgMkz1pL2`, custom claims admin

### Dual-write dans index.html
- `_completePinLogin()` : set `volo_last_volo` + FCM permission pour chefs
- `sendUrgence()` : `VoloData.notifyUrgence(payload)`
- `triggerUrgencyAlert()` : `VoloData.notifyUrgencyAlert(data)`
- `submitSetupPhotos()` : `VoloData.uploadPhotoBase64()` + `savePhotoMetadata()` en parallèle du webhook

---

## V20 Ajouts — Rapport CNESST (`rapport-cnesst.html`) (2026-03-11)

### Générateur de rapport conformité CNESST avec IA

**UI (Dark Theme Eagle):**
- Jauge circulaire SVG animée : score conformité 0-100%
- 4 stat cards : Équipements / Personnel / Certifs OK / Alertes
- 8 sections accordéon auto-fill depuis data.js + localStorage

**Sections :**
1. Identification (entreprise, NEQ, période, responsable auto-détecté)
2. Comité SST (chefs d'équipe auto depuis PERSONNEL)
3. Inventaire EPI (tableau par catégorie, statuts OK/Inspection/Maintenance)
4. Certifications (matrice personnel × certifications, badges couleur)
5. Incidents (registre depuis localStorage)
6. Conformité CNESST (14 items cochables avec références légales LSST/RSST)
7. Activité (stats PICK-ON/PICK-OFF + dernières transactions)
8. Signatures (3 blocs : responsable SST, direction, représentant travailleurs)

**Analyse IA (Claude API direct browser):**
- Envoie toutes les données à Claude claude-sonnet-4-6
- Header `anthropic-dangerous-direct-browser-access: true`
- Clé API stockée dans `localStorage: volo_claude_api_key`
- Retour JSON : score_estime, observations, risques, non_conformites, recommandations, plan_action
- Résultats affichés en UI + intégrés dans le PDF

**PDF A4 (jsPDF direct drawing + autoTable):**
- Page couverture : fond noir, logo eagle, titre gold, badge score
- Table des matières numérotée
- Tables autoTable (headers gold/bleu/rouge)
- Graphique donut : distribution équipements
- Matrice certifications couleur
- Section IA complète
- Page signatures avec lignes
- Watermark eagle filigrane
- Footer confidentiel + date + page

---

## V20 Ajouts — Tracker Chantier GPS (`tracker-chantier.html`) (2026-03-11)

### Géofencing automatique avec pointage GPS

**Carte Leaflet dark :**
- 7 chantiers pré-configurés (Kruger, Domtar ×3, Valero, Hydro-QC, Mégantic) avec lat/lng
- Cercles gold pour zones de détection (rayon configurable 100m-1km, défaut 300m)
- Point bleu = position utilisateur, marqueurs gold = chantiers
- Clic sur chantier → flyTo zoom 15

**Géofencing :**
- `navigator.geolocation.watchPosition()` haute précision
- Formule Haversine pour calcul de distance
- Entrée dans zone → auto ARRIVÉE (toast, notification push, pointage webhook)
- Sortie de zone → auto DÉPART avec durée calculée
- `geoState.zoneState` persiste dans localStorage

**Auto-pointage :**
- Écrit dans `volo-ptg-history` et `volo-ptg-onsite` (compatible avec pointage.html)
- Webhook POST `/api/webhook-pointage` (Make.com)
- Firebase dual-write si `VoloData` disponible
- Queue offline si pas de réseau
- Champ `source: 'GEOFENCING'` pour distinguer des pointages manuels

**UI :**
- Barre de statut live (GPS actif/inactif/recherche + distance au site le plus proche)
- Panel chantiers triés par distance, badges vert si dans la zone
- Journal géofencing (entrées/sorties horodatées)
- Panel "Sur site" (qui est où en ce moment)
- Réglages : toggle auto-pointage, notifications, rayon, précision GPS
- Modal "Ajouter chantier" avec bouton "Utiliser ma position"

**localStorage :**
- `volo-geo-sites` — liste des chantiers avec coordonnées
- `volo-geo-log` — journal d'activité (max 200)
- `volo-geo-zones` — état des zones (inside/since)
- `volo-geo-settings` — réglages utilisateur
- `volo-geo-wasTracking` — reprise auto du tracking

---

## V20 Ajouts — Items Scannés Toggle (2026-03-11)

### Vue toggle dans renderScan() (index.html)
- Variable `vueItemsMode` : 'liste' (défaut) ou 'groupe'
- Fonction `setVueItems(mode)` → re-render
- Boutons toggle : ⬛ (groupe) / ☰ (liste), actif surligné vert
- **Mode liste** : chaque item sur une ligne (nom, ID orange, S/N monospace, caisse, catégorie, bouton ✕)
- **Mode groupe** : vue groupée existante avec chips expandables
- Max-height : 400px (liste) / 240px (groupe)

---

## V20 — CSP Headers (`_headers`)

### connect-src mis à jour
```
unpkg.com cdn.jsdelivr.net cdnjs.cloudflare.com api.anthropic.com
basemaps.cartocdn.com *.firebaseio.com wss://*.firebaseio.com
*.googleapis.com *.firebaseapp.com *.cloudfunctions.net
*.firebasestorage.app identitytoolkit.googleapis.com securetoken.googleapis.com
```

---

## V20 — Service Worker (`sw.js`)
- Cache : `volo-sst-v20.7`
- ASSETS : 15+ fichiers incluant rapport-cnesst.html, tracker-chantier.html

---

## Accueil Chef — Boutons
```
[📢 ANNONCE]  [🚨 URGENCE]
[💾 BACKUP]   [📥 RESTAURER]
[📄 CNESST]   [📡 TRACKER GPS]
```

---

*VOLO SST V20.7 · Golden Eagles · Estrie/Sherbrooke · Milone Jonathan · V0205 · Chef d'équipe · Admin Firebase*
