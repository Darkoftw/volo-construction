# VOLO SST V9 — Golden Eagles 🦅

## Projet
Application de gestion SST (Santé-Sécurité au Travail) pour l'équipe de sauvetage technique "Golden Eagles" de VOLO Construction. Gère l'inventaire d'équipement, le pointage du personnel, les certifications, les gains automatiques et les urgences terrain.

## Stack Technique
- **Frontend**: Vanilla HTML/CSS/JS (PAS de framework, PAS de React, PAS de build tools)
- **Backend**: Make.com webhooks → Google Sheets
- **Déploiement**: Netlify drag & drop (**JAMAIS** Netlify CLI — brûle les crédits)
- **Design**: Dark theme rescue (orange/gold/noir), police Oswald + Inter + JetBrains Mono

## Architecture Fichiers
```
├── index.html          # App principale (inventaire, scan QR, transactions)
├── data.js             # Données centralisées (PERSONNEL, ITEMS, DEPOTS, etc.)
├── dashboard-superviseur.html  # Dashboard superviseur
├── pointage.html       # Module de pointage terrain
├── eagle.mp3           # Son du cri d'aigle (succès transaction)
```

## Fichier data.js — Données Partagées
Chargé via `<script src="data.js">` dans les 3 HTML. Contient:
- `PERSONNEL` (156 personnes) — `{id, volo, name, role, type, region, ville}`
- `SAUVETEURS` = alias de PERSONNEL
- `ITEMS` (26 items) — `{id, name, cat, icon, sceau?}`
- `ITEM_CATEGORIES` — array dérivé des catégories d'items (Paramédic, Corde, Détection, Évacuation, Intervention)
- `DEPOTS` (5) — `{id, name, region}`
- `DESTINATIONS` (9) — `{id, name, region}`
- `REMORQUES` (4) — `{id, name}` (Pick-Up 1/2, Trailer 1/2)
- `CERTS_LIST` (10 certifications) — `{id, name, dur (mois), icon}`
- `BAREMES` — taux par rôle: SAUVETEUR (km 0.68$/km, perdiem 200$, urgence_rate 64$, urgence_perdiem **0$**), SURVEILLANT (km 0.63$/km, perdiem 150$, urgence 0$)

## Webhooks Make.com
- **Principal**: `https://hook.us2.make.com/wm4fvbqy87nfcuf111azq02l3w2a87sh`
- **Urgences**: `https://hook.us2.make.com/eha54bbek46jrg1yp88939167v7ngveh`

### Types de Payload
| Type | Description | Notes |
|------|-------------|-------|
| (transaction) | PICK-ON / PICK-OFF inventaire | Payload principal avec items JSON |
| `ITEM_LOG` | Batch de tous les items scannés | **V9.1**: 1 seul webhook avec `items_array` JSON au lieu de 1 par item |
| `POINTAGE` | Arrivée/Départ terrain | Via pointage.html |
| `URGENCE` | Alerte urgence terrain | Via bouton urgence rouge |
| `KM_LOG` | Kilométrage véhicule perso | Via module KM |
| `PHOTO_LOG` | Photos chantier | lieu obligatoire, contrat optionnel |
| `CERT_UPDATE` | Mise à jour certification | Via module formation |
| `ANNULÉ` | Annulation transaction | Timer 5min après validation |
| `RETOURNÉ` | Clôture PICK-ON via PICK-OFF | Marque l'original comme retourné |

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

## Restrictions par Rôle

### SAUVETEUR (accès complet)
Pick-On/Off, Dashboard, Photos, Kilométrage, Historique, Formation complète (docs + tracker équipe + Google Drive), Dashboard Sauvetage, Mes Gains, Pointage

### SURVEILLANT (accès limité)
- ✅ Pointage d'heures
- ✅ Mes Gains (per diem 150$, km 0.63$/km)
- ✅ Formation: Mes Certifications seulement (PAS de docs sauvetage, PAS de tracker équipe, PAS de Google Drive)
- ✅ Pick-On / Pick-Off: boutons visibles mais **pas de fonctionnalité** pour l'instant → futur: demande EPI uniquement (casque, gants, lunettes)
- ❌ Dashboard local
- ❌ Photos setup terrain
- ❌ Kilométrage véhicule
- ❌ Historique transactions
- ❌ Dashboard Sauvetage (superviseur)
- ❌ Infos chargé de projet (personne ressource, tél, email)
- Helper: `isUserSurv()` vérifie `localStorage.getItem('volo_last_role')==='SURVEILLANT'`

## Anti-Fraude (KM Perso)
- `getAutoGains()` utilise `Math.max()` au lieu d'additionner les KM par jour
- Plafond: 500km max par entrée
- 1 entrée max par jour par utilisateur
- Verrou pointage: le pointage doit exister pour que le per diem compte

## Modules
- **📸 Photos**: lieu obligatoire, contrat optionnel
- **🚗 KM Perso**: aller-retour, véhicule personnel ou VOLO, odomètre
- **💰 Mes Gains**: auto-calculé depuis pointage + KM, export CSV
- **📋 Formation**: certifications avec expiration, vue équipe
- **🚨 Urgences**: bouton fixe rouge, modal rapide
- **📴 Hors-ligne**: queue localStorage, auto-retry à la reconnexion

## Conventions de Code
- State global `state` avec `setState()` qui merge + re-render
- `render()` dispatche vers `renderXxx()` selon `state.step`
- `showToast(msg, type)` pour notifications (ok/err/off/info)
- `tsNow()` pour timestamp ISO
- `saveToHistory(payload)` pour historique local
- Lock screen après 5min d'inactivité (LOCK_DELAY=300000)
- Toutes les données persistantes dans localStorage (préfixe `volo_`)

## Régions (7)
ESTRIE, CAPITALE-NATIONALE, MAURICIE, LANAUDIÈRE, MONTRÉAL, OUTAOUAIS, BAS-ST-LAURENT

## Design System
```css
--bg: #0C0608        /* Fond principal */
--card: rgba(28,16,18,.90)
--gold: #D4A017      /* Accents dorés */
--rescue: #E65100    /* Orange rescue principal */
--red: #C0392B       /* Erreurs/urgences */
--green: #27AE60     /* Succès/validé */
--txt: #F5F0EB       /* Texte principal */
--muted: #B8A99A     /* Texte secondaire */
```

## Notes Développeur
- Le fichier `data.js` DOIT être dans le même dossier que les HTML
- JAMAIS utiliser Claude Agent/CLI sur Netlify (brûle les crédits). Workflow: AI Studio → Claude → Netlify drag&drop
- Toujours vérifier la balance des accolades après chaque modification
- Les PICK-OFF créent un payload RETOURNÉ pour fermer le PICK-ON original
- Le timer d'annulation (5min) est côté client seulement, le webhook est envoyé immédiatement
