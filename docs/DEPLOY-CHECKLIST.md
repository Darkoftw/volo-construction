# VOLO SST — Deploy Checklist Production

> Version: V10.5 — Golden Eagles
> Site Netlify: `voloinv7.netlify.app` (ID: `c8bef998-b996-4e08-b734-e30a668e76f7`)
> Firebase Project: `volo-sst-prod`

---

## 1. Variables d'environnement Netlify

Configurer dans **Netlify Dashboard > Site settings > Environment variables** :

| Variable | Valeur | Obligatoire |
|----------|--------|-------------|
| `ADMIN_SECRET` | Secret 64 chars hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | OUI |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@volo-sst-prod.iam.gserviceaccount.com` | OUI |
| `FIREBASE_PRIVATE_KEY` | Clé privée du service account (avec `\n`) | OUI |
| `FIREBASE_PROJECT_ID` | `volo-sst-prod` | OUI |
| `NODE_ENV` | `production` | OUI |
| `FIREBASE_DEBUG` | `false` | NON |

### Comment obtenir les credentials Firebase Admin :
```bash
# 1. Console Firebase > Project Settings > Service Accounts
# 2. Generate new private key → serviceAccountKey.json
# 3. Copier client_email et private_key dans Netlify env vars
```

> **IMPORTANT** : Ne JAMAIS commit `serviceAccountKey.json` dans git.

---

## 2. Commandes Firebase

### 2.1 Premier setup (une seule fois)
```bash
# Installer Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Lier le projet
firebase use volo-sst-prod
```

### 2.2 Deployer les Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2.3 Creer les collections Firestore (si vides)
Les collections sont creees automatiquement au premier document ecrit.
Collections attendues :
- `users`, `items`, `vehicules`, `chantiers`
- `transactions`, `pointages`, `km_logs`, `incidents`
- `certifications`, `audit_logs`, `config`
- `caisses`, `photos`, `urgences`, `personnel`
- `organizations`, `destroyed_items`

### 2.4 Creer un premier admin (via Netlify Function)
```bash
curl -X POST https://voloinv7.netlify.app/.netlify/functions/create-user \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: VOTRE_ADMIN_SECRET" \
  -d '{
    "email": "admin@voloconstruction.com",
    "password": "MotDePasseSecurise123!",
    "displayName": "Admin VOLO",
    "role": "admin",
    "voloId": "V0001",
    "region": "ESTRIE",
    "type": "SAUVETEUR"
  }'
```

### 2.5 Assigner des roles (custom claims)
```bash
curl -X POST https://voloinv7.netlify.app/.netlify/functions/set-custom-claims \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: VOTRE_ADMIN_SECRET" \
  -d '{"uid": "FIREBASE_UID", "role": "chef"}'
```

Roles valides : `admin`, `chef`, `sauveteur`, `surveillant`, `rh`

---

## 3. Ordre de deploiement

### Phase 1 : Infrastructure (bloquant)
1. Configurer les variables d'environnement Netlify (section 1)
2. Deployer les Firestore Rules : `firebase deploy --only firestore:rules`
3. Creer le premier admin via la function `create-user`

### Phase 2 : Fichiers (drag & drop sur Netlify)
Ordre des fichiers a inclure dans le deploy :

```
OBLIGATOIRES (coeur) :
  data.js                    # 823 items, 156 personnel, 80 caisses
  firebase-config.js         # Config Firebase client
  firebase-service.js        # VoloData API (Firestore CRUD)
  firebase-auth.js           # Authentification Firebase
  volo-crypto.js             # SHA-256 pour PIN
  volo-network.js            # Gestion reseau + offline
  error-monitor.js           # Monitoring erreurs
  logo.js                    # Logo base64 pour PDFs
  data-inventory.js          # Donnees inventaire (split)
  data-personnel-stub.js     # Stub personnel

PAGES HTML :
  index.html                 # App principale
  caisses-stock.html         # Inventaire temps reel
  qr.html                    # QR codes
  dashboard-superviseur.html # Dashboard superviseur
  pointage.html              # Module pointage
  plan-travail.html          # Plan de travail + IA
  agenda.html                # Agenda equipe + chat
  presentation.html          # Page presentation
  lexique.html               # Lexique equipements
  splash.html                # Splash screen

ASSETS :
  eagle_tactic.png           # Logo Golden Eagles
  eagle.mp3                  # Son succes transaction
  favicon.ico                # Favicon
  manifest.json              # PWA manifest
  sw.js                      # Service Worker

CONFIG NETLIFY :
  _headers                   # CSP + security headers
  _redirects                 # Proxy webhooks Make.com

NETLIFY FUNCTIONS :
  netlify/functions/webhook-main.js
  netlify/functions/webhook-urgence.js
  netlify/functions/create-user.js
  netlify/functions/set-custom-claims.js

PHOTOS :
  photos/*.png               # Photos equipements
  photos/*.jpeg
  photos/team/*.jpg           # Photos equipe (carousel)

NE PAS DEPLOYER :
  .env / .env.example        # Secrets / Template
  .firebaserc                # Config locale Firebase CLI
  firestore.rules            # Deploy via firebase CLI (pas Netlify)
  serviceAccountKey.json     # Credentials (JAMAIS)
  destroy_item.py            # Script maintenance
  backup_2026-03-10/         # Backups
  index_new.html             # ABANDONNE — portage chirurgical (voir section 8)
  PROMPT_MASTER_VOLO.md      # Doc interne
  CHANGEMENTS.md             # Changelog
  CLAUDE.md                  # Instructions Claude
  .claude/                   # Config Claude Code
  docs/                      # Documentation
  scripts/                   # Scripts utilitaires
```

### Phase 3 : Verification post-deploy
1. Verifier que le site charge : `https://voloinv7.netlify.app`
2. Verifier les redirects : `curl -sI https://voloinv7.netlify.app/api/webhook-main`
3. Verifier les Netlify Functions : check logs dans Netlify Dashboard > Functions
4. Verifier la CSP : ouvrir DevTools > Console, chercher erreurs CSP

---

## 4. Smoke Tests Manuels

### Test 1 : LOGIN (PIN equipe + PIN personnel)

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 1.1 | Ouvrir `https://voloinv7.netlify.app` | Ecran PIN equipe (keypad 4 chiffres) |
| 1.2 | Entrer `5555` | Transition vers ecran PIN personnel |
| 1.3 | Entrer un VOLO ID valide (ex: `0205`) | Accueil avec nom "Jonathan Milone", role SAUVETEUR |
| 1.4 | Entrer un PIN invalide 3 fois | Message "Acces refuse", bloque temporairement |
| 1.5 | Recharger la page | PIN equipe saute (cache 30 jours), PIN personnel saute (localStorage) |
| 1.6 | Entrer un ID surveillant (ex: `0364`) | Accueil avec restrictions surveillant (pas de Dashboard, Photos limites) |

### Test 2 : PICK-ON (sortie equipement)

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 2.1 | Cliquer "PICK-ON" sur l'accueil | Step vehicule : selection Pick-Up / Trailer |
| 2.2 | Selectionner un vehicule | Step depot : selection depot d'origine |
| 2.3 | Selectionner un depot | Step destination : selection + N projet + contact |
| 2.4 | Remplir destination | Step sauveteurs : multi-select par region/role |
| 2.5 | Selectionner 2+ sauveteurs | Step items : selection manuelle (PAS de QR) |
| 2.6 | Selectionner 3+ items identiques | Items groupes avec badge xN, expandable |
| 2.7 | Confirmer | Resume complet : vehicule, depot, destination, sauveteurs, items |
| 2.8 | Envoyer | Son aigle, ecran succes, timer annulation 5min |
| 2.9 | Verifier localStorage | `volo_history` contient la transaction ACTIF |
| 2.10 | Verifier banniere | Banniere orange "PICK ON ACTIF" sur toutes les pages |
| 2.11 | Verifier webhook | Make.com scenario declenche (Google Sheets mis a jour) |
| 2.12 | Verifier Firestore | Transaction presente dans collection `transactions` |

### Test 3 : PICK-OFF (retour equipement)

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 3.1 | Depuis accueil, bouton PICK-OFF pulse | Bordure pulsante + badge nombre items |
| 3.2 | Cliquer PICK-OFF | Liste des deployments actifs du user |
| 3.3 | Selectionner un deployment | Items du sac expandus (tous les items, pas juste le sac) |
| 3.4 | Cocher tous les items | Checklist Pick-Off (3 items max) |
| 3.5 | Confirmer le retour | Transaction RETOURNE dans localStorage |
| 3.6 | Verifier banniere | Banniere orange disparait si plus aucun Pick-On actif |
| 3.7 | Verifier webhook | Payload RETOURNE envoye a Make.com |

### Test 4 : POINTAGE (pointage.html)

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 4.1 | Ouvrir `pointage.html` | Ecran PIN (meme VOLO ID que l'app principale) |
| 4.2 | Entrer PIN valide | Selection lieu + type mission |
| 4.3 | Pointer ARRIVEE | Confirmation + timestamp, badge "net-dot on" |
| 4.4 | Pointer DEPART | Confirmation + duree calculee |
| 4.5 | Tester hors-ligne | Bandeau "HORS-LIGNE", pointage en queue |
| 4.6 | Revenir en ligne | Queue flush automatique, toast confirmation |
| 4.7 | Verifier webhook | Payload POINTAGE envoye a `/api/webhook-pointage` |

### Test 5 : URGENCE

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 5.1 | Cliquer bouton rouge URGENCE (accueil) | Modal urgence : type + note |
| 5.2 | Remplir type + note | Envoi au webhook urgence |
| 5.3 | Verifier webhook | Payload URGENCE envoye a `/api/webhook-urgence` |
| 5.4 | Dashboard superviseur | Alerte visible, bouton "LEVER L'ALERTE" apparait |
| 5.5 | Lever l'alerte | Ecran normal restaure, toast confirmation |

### Test 6 : DASHBOARD SUPERVISEUR

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 6.1 | Ouvrir `dashboard-superviseur.html` | Dashboard avec KPIs, carte, personnel |
| 6.2 | Verifier indicateur Firestore | Badge vert "FIRESTORE" pulse OU rouge "LOCAL" |
| 6.3 | Section "TRANSACTIONS AUJOURD'HUI" | Transactions du jour (Firestore + localStorage merge) |
| 6.4 | Bouton "Exporter CSV" | Fichier `volo-transactions-YYYY-MM-DD.csv` telecharge |
| 6.5 | Section "CERTIFICATIONS" | Alertes certs expirees/a renouveler (30j) |
| 6.6 | Bouton URGENCE | Modal confirmation + envoi webhook |
| 6.7 | Carte Leaflet | Markers sur les sites, popups au clic |
| 6.8 | Theme clair/sombre | Toggle fonctionne sans crash |
| 6.9 | Export PDF | PDF genere avec logo, KPIs, tables, signature |

### Test 7 : PAGES SECONDAIRES

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 7.1 | `caisses-stock.html` | KPIs, 7 tabs, items groupes xN, pastilles couleur |
| 7.2 | `qr.html` | QR codes generes pour tous les items, 3 formats print |
| 7.3 | `qr.html` scan rafale | Scanner ne s'arrete pas apres chaque QR (cooldown 1.5s) |
| 7.4 | `plan-travail.html` | 6 etapes + generation IA |
| 7.5 | `agenda.html` | Calendrier, chat Firebase, mini-map, export PDF |
| 7.6 | `lexique.html` | Liste equipements |
| 7.7 | `splash.html` | Page splash visible |

### Test 8 : CROSS-CUTTING

| Etape | Action | Resultat attendu |
|-------|--------|------------------|
| 8.1 | Banniere Pick-On | Visible sur TOUTES les pages quand Pick-On actif |
| 8.2 | Mode hors-ligne | Queue localStorage, retry auto a reconnexion |
| 8.3 | iOS Safari | Pas de zoom sur inputs, touch targets 48px min |
| 8.4 | Annulation 5min | Timer fonctionne, webhook ANNULE envoye |
| 8.5 | Backup/Restaurer | Export JSON de volo_* localStorage, import + reload |
| 8.6 | Meteo widget | Temperature + icone WMO sur accueil (cache 1h) |
| 8.7 | Mes Gains | Calcul auto depuis pointage + KM, export CSV |

---

## 5. Redirects (_redirects)

Etat actuel (corrige) :
```
/api/webhook-main  https://hook.us2.make.com/wm4fvbqy87nfcuf111azq02l3w2a87sh  200
/api/webhook-urgence  https://hook.us2.make.com/eha54bbek46jrg1yp88939167v7ngveh  200
/api/webhook-pointage  https://hook.us2.make.com/h9ge1vspi5yexta3u1wi26m2wh7dm8ic  200
```

> Note : Les Netlify Functions (`/.netlify/functions/*`) coexistent avec les redirects `/api/*`.
> Le code JS utilise `/api/*` (via `_redirects` proxy vers Make.com).
> Les fonctions admin (`create-user`, `set-custom-claims`) restent sur `/.netlify/functions/*`.

---

## 6. Rollback

En cas de probleme :
1. **Netlify** : Dashboard > Deploys > cliquer sur un deploy precedent > "Publish deploy"
2. **Firebase Rules** : `firebase deploy --only firestore:rules` avec l'ancienne version
3. **localStorage** : Bouton RESTAURER sur l'accueil chef (import backup JSON)

---

## 7. Contacts

- **Developpeur** : Jonathan Milone (V0205) — SAUV-JM-205
- **Netlify Site** : voloinv7
- **Firebase Console** : https://console.firebase.google.com/project/volo-sst-prod
- **Make.com** : Scenarios webhook principal + urgence + pointage

---

## 8. Strategie de portage — chirurgical, pas swap

### Pourquoi PAS de swap `index_new.html` → `index.html`

`index_new.html` avait 7 blockers critiques :
1. Auth incompatible (Firebase Auth au lieu du PIN plaintext 5555)
2. Data loading dependant de Firestore (pas de fallback data.js)
3. 7 features V10.5 manquantes (backup, meteo, certs, annonces, urgences)
4. Groupement items V10.1 absent
5. State init different (camera auto au scan)
6. 515 lignes de plus — plus complexe, non teste
7. Double-check webhooks requis

**Decision : portage chirurgical.** On ajoute les features une par une
dans les fichiers existants (`index.html`, `agenda.html`) sans casser ce qui marche.

### Scripts externes — ordre d'ajout dans le `<head>`

Les scripts doivent etre charges dans cet ordre exact.
Chaque fichier HTML qui utilise Firebase doit les inclure.

```
1. data.js                   ← donnees statiques (PERSONNEL, ITEMS, CAISSES)
2. volo-crypto.js            ← SHA-256 PIN hashing (avant tout auth)
3. Firebase SDK CDN          ← firebase-app-compat.js + modules
4. firebase-config.js        ← init Firebase, cree window.firebaseDB/FS/Auth
5. firebase-service.js       ← VoloData API + circuit breaker quota
6. firebase-auth.js          ← auth wrapper + logout cleanup
7. logo.js                   ← logo base64 pour PDF (si page genere PDF)
```

### Fichiers concernes et quoi ajouter

#### `index.html` (app principale) — DEJA FAIT
```
<head>
  <script src="volo-crypto.js"></script>            ← AJOUTE (SHA-256)
  <script src="firebase-app-compat.js" CDN></script>
  <script src="firebase-config.js"></script>        ← DEJA PRESENT
  <script src="firebase-service.js"></script>       ← DEJA PRESENT
  <script src="firebase-auth.js"></script>          ← DEJA PRESENT
</head>
```
Changements appliques :
- [x] volo-crypto.js charge avant firebase scripts
- [x] Team PIN hash SHA-256 (TEAM_PIN_HASH constant)
- [x] Login async avec VoloCrypto.sha256()
- [x] localStorage volo_pin → hash, volo_last_volo → VOLO ID public
- [x] Plan travail link sans PIN dans URL (sessionStorage transfer)
- [x] Splash screen overlay + redirect splash.html (sessionStorage flag)
- [x] Circuit breaker dans firebase-service.js (quota 20k writes/jour)

#### `pointage.html` — DEJA FAIT
```
<head>
  <script src="volo-crypto.js"></script>            ← AJOUTE
</head>
```
- [x] Auto-login via volo_last_volo (pas volo_pin)

#### `dashboard-superviseur.html` — DEJA FAIT
- [x] checkAuth() lit volo_last_volo au lieu de volo_pin

#### `plan-travail.html` — DEJA FAIT
- [x] Auto-login via sessionStorage volo_transfer_volo
- [x] Retour link via sessionStorage (pas URL param)

#### `agenda.html` — DEJA FAIT
```
<head>
  <script src="firebase-app-compat.js" CDN></script>
  <script src="firebase-database-compat.js" CDN></script>
  <script src="firebase-config.js"></script>        ← UTILISE (pas inline)
  <script src="firebase-service.js"></script>
  <script src="firebase-auth.js"></script>
</head>
```
Changements appliques :
- [x] Tab CHAT visible (bouton dans tab-row + badge unread)
- [x] Presence tracking (_recordPresence, _startPresenceTracking, beforeunload)
- [x] Chat RTDB paths : chat/general, chat/sauveteur, chat/dm_{ids}
- [x] sendMessage(text) + onMessages(cb) — API RTDB propre
- [x] chatSend() et shareSondageChat() delegent a sendMessage()
- [x] Guard Firebase : if(typeof firebaseDB==='undefined') var firebaseDB=null
- [x] Timestamps compat : (m.ts||m.timestamp) partout dans render
- [x] safeGetLS/safeSetLS utilise partout

#### `firebase-service.js` — DEJA FAIT
- [x] Circuit breaker : compteur writes/jour (volo_write_count + volo_write_date)
- [x] Bandeau rouge alerte a 80% quota (16k/20k)
- [x] Circuit ouvert a 100% → writes en queue (webhook-only)
- [x] VoloData.getQuotaStatus() expose dans l'API publique
- [x] 5 fonctions write protegees : saveTransaction, savePointage, setCert, logAudit, cancelTransaction

#### `firestore.rules` — DEJA FAIT
- [x] Helpers isChef(), isChefOrAdmin()
- [x] Certifications : write autorise pour chef + admin (pas just admin)
- [x] 17 collections couvertes, catch-all deny
- [x] Tests : 449 PASS / 0 FAIL (scripts/test-rules.ts)

#### `_headers` — DEJA FAIT
- [x] unsafe-eval retire de script-src
- [x] Webhook URLs retires de connect-src (proxied via _redirects)
- [x] X-XSS-Protection ajoute

#### `sw.js` — Version v17.2
- [x] volo-crypto.js dans ASSETS

---

### Ajouts FUTURS — pas encore faits

#### Etape F0 : Migrate-Personnel (CONDITION PREALABLE au swap data.js)
**Fichier** : `scripts/migrate-personnel.js` (A CREER)
**Quoi** : Pousser les 156 membres PERSONNEL de data.js vers Firestore `users/`
**Pourquoi** : Tant que data.js est la seule source de verite pour PERSONNEL,
on ne peut pas activer Firebase Auth ni Firestore-first.
Cette etape cree le miroir Firestore sans toucher a data.js.

**Processus** :
```
1. Lire PERSONNEL depuis data.js (156 entrees)
2. Pour chaque membre :
   a. Creer un doc Firestore users/{voloId}
      { id, volo, name, role, type, region, ville, active:true, source:'data.js' }
   b. Creer un user Firebase Auth via Netlify Function create-user
      { email: <genere ou emails_prives.js>, password: <temporaire>, role, voloId }
   c. Assigner custom claims via set-custom-claims { uid, role }
3. Generer un rapport : OK / SKIP (deja existe) / FAIL par membre
```

**Prerequis** :
- Variables Netlify configurees (ADMIN_SECRET, FIREBASE_*)
- Netlify Functions create-user et set-custom-claims deployees et fonctionnelles
- emails_prives.js accessible (pour associer email reel a chaque VOLO ID)
- Sinon : generer des emails placeholder `v{VOLO_ID}@volo-sst.local`

**Risque** : FAIBLE — n'affecte pas l'app en cours. Cree des donnees en parallele.
**Duree** : ~5 min (156 appels API sequentiels avec throttle 200ms)

**Test non-regression** :
- [ ] data.js toujours charge normalement (pas modifie)
- [ ] App fonctionne identiquement avant et apres la migration
- [ ] Login PIN 5555 + PIN personnel fonctionne toujours
- [ ] Console Firebase : 156 users dans Auth + 156 docs dans users/
- [ ] Chaque user a le bon custom claim role
- [ ] Rapport de migration : 0 FAIL

**Validation Firestore** :
```bash
# Verifier le nombre de docs
npx ts-node scripts/verify-seed.ts

# Verifier un user specifique
curl https://voloinv7.netlify.app/.netlify/functions/set-custom-claims \
  -H "x-admin-secret: $SECRET" \
  -d '{"uid":"V0205","role":"sauveteur"}'
```

**Apres migration reussie** :
- F1 (Firebase Auth login) peut etre active
- F2 (Firestore source) peut etre active avec fallback data.js
- data.js reste en place comme fallback jusqu'a F2 valide

---

#### Etape F1 : Firebase Auth login (remplace PIN plaintext)
**Fichier** : `index.html`
**Quoi** : Remplacer le login PIN → data.js lookup par Firebase Auth signInWithEmailAndPassword
**Prerequis** : Tous les users crees via create-user Netlify Function avec custom claims
**Risque** : HAUT — casse le login pour tous si Firebase Auth pas configure
**Test non-regression** :
- [ ] Login avec PIN existant fonctionne toujours
- [ ] Logout efface volo_last_volo + volo_pin
- [ ] Auto-login au reload fonctionne
- [ ] Surveillant voit les restrictions correctes
- [ ] Chef voit le badge etoile + acces complet

#### Etape F2 : Firestore comme source de donnees (remplace data.js)
**Fichier** : `firebase-service.js`
**Quoi** : getPersonnel() et getItems() lisent Firestore en priorite, fallback data.js
**Prerequis** : Collections personnel et items peuplees dans Firestore
**Risque** : MOYEN — data.js reste le fallback, mais latence possible
**Test non-regression** :
- [ ] App charge en <2s meme si Firestore lent
- [ ] data.js toujours charge comme fallback
- [ ] ITEMS_MAP, CAISSES, PERSONNEL tous disponibles
- [ ] Recherche items fonctionne (par nom, par ID, par categorie)
- [ ] Groupement items xN fonctionne

#### Etape F3 : Dual-write Firestore + Webhook
**Fichier** : `firebase-service.js` (deja en place)
**Quoi** : Activer `VOLO_FIREBASE.dualWrite = true` + `firestorePrimary = true`
**Prerequis** : F1 + F2 termines et testes
**Risque** : FAIBLE — les writes sont deja codes, juste un flag a activer
**Test non-regression** :
- [ ] Transaction ecrite dans Firestore ET webhook
- [ ] Circuit breaker fonctionne (bandeau a 80%)
- [ ] Queue offline flush au retour en ligne
- [ ] Annulation 5min fonctionne (update Firestore + webhook ANNULE)

#### Etape F4 : Realtime Database rules
**Fichier** : `database.rules.json` (A CREER)
**Quoi** : Securiser les paths RTDB : chat/*, presence/*, availabilities/*
**Prerequis** : Firebase Auth actif (F1)
**Risque** : FAIBLE si auth actif, HAUT si auth pas configure
**Regles** :
```json
{
  "rules": {
    "chat": {
      "$channel": {
        ".read": "auth != null",
        ".write": "auth != null",
        "$msgId": {
          ".validate": "newData.hasChildren(['voloId','nom','text','ts'])"
        }
      }
    },
    "presence": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "availabilities": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```
**Test non-regression** :
- [ ] Chat general fonctionne (envoi + reception)
- [ ] Chat DM fonctionne entre 2 users
- [ ] Presence online/offline fonctionne
- [ ] Agenda dispos sync entre users
- [ ] Fallback localStorage si RTDB offline

---

### Regles de portage

1. **Un changement a la fois.** Deployer, tester, puis passer au suivant.
2. **Toujours garder le fallback.** data.js reste charge, localStorage reste actif.
3. **Ne jamais casser le PIN 5555.** Tant que Firebase Auth n'est pas configure pour TOUS les users, le team PIN plaintext reste.
4. **Tester sur mobile iOS Safari** apres chaque deploy (zoom inputs, touch targets).
5. **Verifier les webhooks Make.com** — le scenario principal DOIT recevoir les payloads.
6. **Backup avant chaque changement** : `exportBackup()` sur l'accueil chef.
