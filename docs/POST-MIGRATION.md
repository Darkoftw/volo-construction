# VOLO SST — État post-migration Phase 0-1 (2026-03-10)

> Snapshot de l'état du système après la journée de migration Firebase.
> Référence pour planifier les Phases 2 et 3.

---

## 1. État final du système

### Architecture actuelle
```
┌──────────────────────────────────────────────────┐
│                    FRONTEND                       │
│  index.html · agenda.html · 6 pages secondaires  │
│  Vanilla JS — PAS de framework — PAS de build    │
├──────────────────────────────────────────────────┤
│               SOURCES DE DONNÉES                  │
│                                                   │
│  ┌─────────────┐   ┌────────────────────┐        │
│  │   data.js   │   │  Firestore (dual)  │        │
│  │  (PRIMARY)  │   │   (SECONDARY)      │        │
│  │ 823 items   │   │  writes mirrored   │        │
│  │ 156 pers.   │   │  reads: personnel  │        │
│  │ 80 caisses  │   │  only (initPerso)  │        │
│  └─────────────┘   └────────────────────┘        │
│                                                   │
│  ┌─────────────┐   ┌────────────────────┐        │
│  │ localStorage│   │  Firebase RTDB     │        │
│  │ (fallback)  │   │  (chat + presence) │        │
│  │ queue offln │   │  agenda.html only  │        │
│  └─────────────┘   └────────────────────┘        │
├──────────────────────────────────────────────────┤
│                   BACKENDS                        │
│  Make.com webhooks (PRIMARY) → Google Sheets     │
│  Firestore dual-write (SECONDARY, fire & forget) │
│  Netlify Functions (admin: create-user, claims)  │
├──────────────────────────────────────────────────┤
│                 HÉBERGEMENT                        │
│  Netlify (voloinv7.netlify.app) — drag & drop    │
│  Firebase (volo-sst-prod) — Firestore + RTDB     │
└──────────────────────────────────────────────────┘
```

### Authentification
| Mécanisme | Statut | Où |
|-----------|--------|-----|
| Team PIN `5555` | ✅ ACTIF (SHA-256 hashé) | index.html |
| PIN personnel → Firestore `users/` | ✅ ACTIF | `VoloAuth.loginPin()` → Firestore, fallback PERSONNEL local |
| Firebase Auth Anonymous | ✅ ACTIF | Auto sign-in après PIN validé (pour uid Firebase) |
| Firebase Auth Email/Password | ⏳ PRÊT (pas activé) | firebase-auth.js chargé mais pas utilisé |
| Custom Claims (role-based) | ⏳ EN ATTENTE | `firestore.rules` déployées, claims pas encore attribués |

### Splash page
- `splash.html` : animation trou noir + iframe cachée précharge `index.html`
- Après 5s : fade out splash → fade in iframe → `location.replace('/index.html')`
- Transition seamless, zero flash blanc

### Service Worker
- Version : `v11.5`
- Assets cachés : 15 fichiers (HTML + JS + assets)
- Stratégie : cache-first pour assets, network-first pour API

---

## 2. Ce qui utilise Firestore (dual-write)

Les writes Firestore sont **fire & forget** — ne bloquent jamais le flux principal.
Le webhook Make.com reste le canal principal.

| Donnée | Collection Firestore | Déclenché par | Fichier |
|--------|---------------------|---------------|---------|
| Transactions (Pick-On/Off) | `transactions` | `doValidation()` | index.html |
| Audit log transactions | `audit_logs` | `VoloData.logAudit()` | index.html |
| Pointages (arrivée/départ) | `pointages` | Arrivée, Départ, Départ forcé | pointage.html |
| Certifications | `certifications/{voloId}` | `setCert()` | index.html |
| Kilométrage perso | `km_logs` | `_doSubmitKm()`, `validateReturn()` | index.html |
| Urgences | `urgences` | Envoi urgence | index.html |
| Audit urgences | `audit_logs` | `VoloData.logAudit('URGENCE')` | index.html |

### Reads Firestore
| Donnée | Collection | Utilisé par | Fichier |
|--------|-----------|-------------|---------|
| Personnel (156 membres) | `users` | `VoloData.getPersonnelFromFirestore()` enrichment async | firebase-service.js → index.html |
| Login PIN | `users/{V+pin}` | `VoloAuth.loginPin()` → doc.get() | firebase-auth.js → index.html |
| Transactions today | `transactions` | `VoloData.onTransactionsChange()` live listener | firebase-service.js → dashboard-superviseur.html |
| Certifications | `certifications/{voloId}` | `VoloData.getCerts()` | firebase-service.js → dashboard-superviseur.html |

### Circuit breaker
- Limite : 20 000 writes/jour (plan Spark)
- Warning : bandeau rouge à 80% (16 000)
- Circuit ouvert à 100% : writes bloqués, webhook-only
- Reset automatique chaque jour (localStorage `volo_write_count`)

---

## 3. Ce qui utilise Firebase RTDB

| Donnée | Path RTDB | Utilisé par | Fichier |
|--------|----------|-------------|---------|
| Chat général | `chat/general` | `sendMessage()` / `onMessages()` | agenda.html |
| Chat sauveteur | `chat/sauveteur` | Idem | agenda.html |
| Chat DM | `chat/dm_{id1}_{id2}` | `chatOpenDM()` | agenda.html |
| Présence online | `presence/{uid}` | `_recordPresence()` + `onDisconnect()` | agenda.html |

**Fallback** : localStorage `volo_agenda_chat_messages` si RTDB non disponible.

---

## 4. Ce qui utilise encore data.js (source de vérité)

| Donnée | Variable | Consommateurs | Quantité |
|--------|----------|--------------|----------|
| Items inventaire | `ITEMS` | index, caisses-stock, qr, dashboard | 823 items |
| Personnel | `PERSONNEL` | index, pointage, dashboard, plan-travail | 156 membres |
| Caisses | `CAISSES` | index, caisses-stock, qr | 80 caisses |
| Dépôts | `DEPOTS` | index (Pick-On step) | 5 |
| Destinations | `DESTINATIONS` | index (Pick-On step) | 9 |
| Remorques | `REMORQUES` | index (véhicule step) | 4 |
| Certifications defs | `CERTS_LIST` | index (section certs) | 10 |
| Barèmes | `BAREMES` | index (Mes Gains) | 2 rôles |
| SAC_COLORS | `SAC_COLORS` | index, caisses-stock, qr | 228 items |
| COULEUR_HEX | `COULEUR_HEX` | index, caisses-stock, qr | 7 couleurs |
| ITEMS_MAP | `ITEMS_MAP` | index, caisses-stock | Map(id→item) |

### data.js alternatives déjà créées
| Fichier | Contenu | Utilisé par |
|---------|---------|-------------|
| `data-inventory.js` | 823 items + 80 caisses + dépôts + destinations + remorques + barèmes (SANS PII) | Pages secondaires (caisses-stock, qr, etc.) |
| `data-personnel-stub.js` | 30 entrées anonymisées | Fallback si Firestore offline |

> **Note** : `index.html` charge encore `data.js` complet (avec PERSONNEL réel).
> Les pages secondaires chargent `data-inventory.js` + `data-personnel-stub.js`.

---

## 5. Ce qui utilise localStorage

### Queues offline (auto-flush au retour en ligne)
| Clé | Contenu | Géré par |
|-----|---------|----------|
| `volo_queue` | Transactions en attente | VoloData |
| `volo_fb_queue` | Writes Firestore en attente | firebase-service.js |
| `volo_pointage_queue` | Pointages en attente | pointage.html |
| `volo_inv_offline_queue` | Inventaire offline | caisses-stock.html |
| `volo_agenda_offline_queue` | Agenda dispos offline | agenda.html |

### Données persistantes
| Clé | Contenu |
|-----|---------|
| `volo_history` | Historique transactions (Pick-On/Off) |
| `volo_pin` | PIN hashé SHA-256 |
| `volo_last_volo` | VOLO ID (ex: "V0205") — identifiant public |
| `volo_team_pin_ts` | Timestamp validation Team PIN (30 jours) |
| `volo_certs_{voloId}` | Certifications par membre |
| `volo_destroyed` | IDs items détruits |
| `volo_write_count` / `volo_write_date` | Compteur circuit breaker |
| `volo_weather_cache` | Cache météo Open-Meteo (TTL 1h) |

---

## 6. Webhooks Make.com (canal principal)

| Endpoint | URL réelle | Proxy Netlify |
|----------|-----------|---------------|
| Principal | `hook.us2.make.com/wm4fvb...` | `/api/webhook-main` |
| Urgences | `hook.us2.make.com/eha54b...` | `/api/webhook-urgence` |
| Pointage | `hook.us2.make.com/h9ge1v...` | `/api/webhook-pointage` |

---

## 7. Prochaines étapes

### Phase 2 — Firebase Auth + Firestore-first

#### F0 : Peupler Firestore `users/` (CONDITION PRÉALABLE)
- **Action** : Pousser 156 membres de data.js → Firestore `users/{voloId}`
- **Comment** : Script one-shot ou Netlify Function batch import
- **Format doc** : `{ volo, name, role, type, region, ville, active: true }`
- **Prérequis** : `firebase login` + accès console Firebase
- **Risque** : FAIBLE — crée des données en parallèle, ne touche pas à l'app
- **Validation** : `VoloAuth.loginPin()` retourne le profil Firestore au lieu du fallback
- **Durée** : ~10 min

#### F1 : Custom Claims via Netlify Function
- **Pourquoi** : `firestore.rules` utilise `request.auth.token.role` — sans claims, toutes les règles `hasRole()` échouent
- **Action** : Créer `netlify/functions/set-claims.js` (Firebase Admin SDK)
- **Endpoint** : `POST /api/set-claims` avec `{ uid, role }` + secret admin
- **Rôles** : `admin`, `chef`, `surveillant`, `sauveteur`
- **Env vars Netlify** : `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON), `VOLO_ADMIN_SECRET`
- **Prérequis** : F0 terminé, users avec Firebase Auth uid
- **Risque** : MOYEN — nécessaire avant que les Security Rules soient enforced
- **Fallback** : Rules permissives temporaires

#### F2 : Firestore comme source de données
- `getPersonnel()` et `getItems()` lisent Firestore en priorité, fallback data.js
- **Prérequis** : Collections `users` et `items` peuplées
- **Risque** : MOYEN — data.js reste le fallback

#### F3 : Activer dual-write primary
- `VOLO_FIREBASE.firestorePrimary = true`
- **Prérequis** : F1 + F2 terminés et testés
- **Risque** : FAIBLE — les writes sont déjà codés

### Phase 3 — Temps réel + Photos + Suppression data.js

#### F4 : RTDB Rules sécurisées
- `database.rules.json` pour `chat/*`, `presence/*`, `availabilities/*`
- **Prérequis** : Firebase Auth actif (F1)

#### F5 : Firebase Storage pour photos chantier
- Remplacer base64 webhook → Storage upload + URL Firestore
- Réduire la taille des payloads de 10x
- Ajouter `storage.rules` (auth required, max 10MB par fichier)
- Modifier module Photos dans index.html pour upload direct

#### F6 : Temps réel Firestore
- `onSnapshot()` sur transactions, pointages, certs
- Dashboard superviseur en temps réel (pas de refresh)
- Notifications push via FCM

#### F7 : Retrait data.js
- Condition : F2 stable depuis 2+ semaines, 0 fallback sur data.js en prod
- Action : Retirer `<script src="data.js">` de index.html
- Garder `data-inventory.js` comme cache statique pour items (pas de PII)
- Retirer `data-personnel-stub.js` (Firestore = seule source)

### Phase 4 — Optimisation

#### F8 : Retrait webhooks Make.com
- Condition : F3 stable, Firestore = source de vérité
- Action : Retirer les writes webhook, garder Firestore-only
- Google Sheets alimenté par Cloud Functions ou export

#### F9 : PWA complète
- `manifest.json` amélioré (splash screen natif, icons)
- Background sync API (remplace les queues localStorage)
- Push notifications via FCM

---

## 8. Matrice de risque

| Étape | Risque | Impact si échec | Rollback |
|-------|--------|----------------|----------|
| F0 migrate-personnel | FAIBLE | Aucun — données parallèles | Supprimer docs Firestore |
| F1 Firebase Auth | HAUT | Login cassé pour tous | Reverter index.html (Netlify rollback) |
| F2 Firestore source | MOYEN | Latence, données manquantes | data.js fallback automatique |
| F3 Dual-write primary | FAIBLE | Writes Firestore en plus | Flag à `false` |
| F4 RTDB Rules | FAIBLE | Chat bloqué | Rules permissives |
| F5 Storage photos | FAIBLE | Photos non uploadées | Base64 webhook fallback |
| F6 Temps réel | FAIBLE | Pas de live update | Refresh manuel |
| F7 Retrait data.js | HAUT | App ne charge plus | Re-ajouter data.js |
| F8 Retrait webhooks | HAUT | Google Sheets plus alimenté | Re-ajouter webhooks |

---

## 9. Commandes clés pour reprendre

### Firebase
```bash
# Login Firebase (une seule fois par machine)
firebase login

# Deploy Firestore Security Rules
cd "C:\Users\Ordi_\OneDrive\Bureau\volo\VOLO INVENTORY\volo inventory v3\volo-deploy"
firebase deploy --only firestore:rules

# Vérifier le projet lié
cat .firebaserc
firebase projects:list

# Peupler users/ (one-shot — à créer)
node scripts/migrate-personnel.js
```

### Netlify
```bash
# Deploy via MCP (demander un proxy token au MCP tool)
npx -y @netlify/mcp@latest --site-id c8bef998-b996-4e08-b734-e30a668e76f7 --proxy-path "<TOKEN>"

# Ou drag & drop : https://app.netlify.com/sites/voloinv7/deploys
# Site ID : c8bef998-b996-4e08-b734-e30a668e76f7
# URL : https://voloinv7.netlify.app
```

### Git
```bash
cd "C:\Users\Ordi_\OneDrive\Bureau\volo\VOLO INVENTORY\volo inventory v3\volo-deploy"
git add -A && git commit -m "V10.5 — Firebase auth, Firestore rules, splash preload"
git push origin master
```

### Tests rapides
```bash
# Site up ?
curl -s -o /dev/null -w "%{http_code}" https://voloinv7.netlify.app/
curl -s -o /dev/null -w "%{http_code}" https://voloinv7.netlify.app/splash.html

# Redirects proxy fonctionnels ?
curl -s -o /dev/null -w "%{http_code}" -X POST https://voloinv7.netlify.app/api/webhook-main
```

---

*État post-migration · 2026-03-10 · Mis à jour fin de session*
