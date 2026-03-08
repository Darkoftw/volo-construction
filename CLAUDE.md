# VOLO SST V9 — Golden Eagles 🦅

> **Bootstrap rapide** : Coller aussi `DESIGN-SYSTEM-VOLO.md` en début de session pour l'identité visuelle complète.

---

## Projet
Application de gestion SST (Santé-Sécurité au Travail) pour l'équipe de sauvetage technique "Golden Eagles" de VOLO Construction. Gère l'inventaire d'équipement, le pointage du personnel, les certifications, les gains automatiques et les urgences terrain.

---

## Stack Technique
- **Frontend** : Vanilla HTML/CSS/JS — **PAS** de React, **PAS** de build tools
- **Backend** : Make.com webhooks → Google Sheets
- **Déploiement** : Netlify drag & drop — **JAMAIS** Netlify CLI (brûle les crédits)
- **Scanner QR** : `getUserMedia()` + `jsQR` (CDN jsdelivr) — **JAMAIS** Html5Qrcode (miroir iOS, swap cassé)
- **Design** : Dark theme rescue — voir `DESIGN-SYSTEM-VOLO.md`

---

## Architecture Fichiers
```
├── index.html                  # App principale (inventaire, scan QR, transactions)
├── data.js                     # Données centralisées — DOIT être dans le même dossier
├── qr.html                     # QR Inventaire — caisses & items avec QR codes
├── caisses-stock.html          # Caisses & Stock — gestion statuts équipement
├── dashboard-superviseur.html  # Dashboard superviseur (Leaflet map, missions)
├── pointage.html               # Module de pointage terrain
├── plan-travail.html           # Plan de travail 6 étapes + IA (Claude API)
├── lexique.html                # Lexique équipements
├── eagle.mp3                   # Son cri d'aigle (succès transaction)
├── eagle_tactic.png            # Logo Golden Eagles
├── CLAUDE.md                   # Ce fichier
├── DESIGN-SYSTEM-VOLO.md       # Design system complet
└── photos/                     # Photos équipements (PNG/JPEG)
```

---

## Fichier data.js — Données Partagées
Chargé via `<script src="data.js">` dans tous les HTML. Contient :
- `PERSONNEL` (156 personnes) — `{id, volo, name, role, type, region, ville}`
- `SAUVETEURS` = alias de PERSONNEL
- `ITEMS` (26 items) — `{id, name, cat, icon, sceau?}`
- `ITEM_CATEGORIES` — array dérivé des catégories (Paramédic, Corde, Détection, Évacuation, Intervention)
- `DEPOTS` (5) — `{id, name, region}`
- `DESTINATIONS` (9) — `{id, name, region}`
- `REMORQUES` (4) — `{id, name}` (Pick-Up 1/2, Trailer 1/2)
- `CERTS_LIST` (10 certifications) — `{id, name, dur (mois), icon}`
- `BAREMES` — taux par rôle

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

---

## Régions (7)
`ESTRIE` · `CAPITALE-NATIONALE` · `MAURICIE` · `LANAUDIÈRE` · `MONTRÉAL` · `OUTAOUAIS` · `BAS-ST-LAURENT`

---

## Règles Absolues
1. **JAMAIS** Netlify CLI — drag & drop uniquement
2. **JAMAIS** Html5Qrcode — getUserMedia + jsQR uniquement
3. **JAMAIS** React/build tools — vanilla uniquement
4. **JAMAIS** #000 ni #FFF — utiliser --bg et --txt
5. `data.js` doit être dans le même dossier que les HTML
6. Toujours vérifier la balance des accolades après modification
7. Préfixe `volo_` pour tout localStorage

---

*VOLO SST · Golden Eagles · Estrie/Sherbrooke · Milone Jonathan · V0205 · SAUV-JM-205*
