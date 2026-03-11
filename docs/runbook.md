# VOLO SST — Runbook Opérationnel

## Table des matières
1. [Prérequis](#1-prérequis)
2. [Installation locale](#2-installation-locale)
3. [Configuration Firebase](#3-configuration-firebase)
4. [Seed des données de test](#4-seed-des-données-de-test)
5. [Déploiement Netlify](#5-déploiement-netlify)
6. [Opérations courantes](#6-opérations-courantes)
7. [Dépannage](#7-dépannage)
8. [Contacts & accès](#8-contacts--accès)

---

## 1. Prérequis

| Outil | Version min. | Usage |
|-------|-------------|-------|
| Node.js | 18+ | Scripts seed, Netlify Functions |
| npm | 9+ | Dépendances |
| Firebase CLI | 13+ | Émulateur, deploy rules |
| Git | 2.40+ | Versioning |
| Navigateur | Chrome/Safari récent | Test app |

```bash
# Vérifier les versions
node -v && npm -v && firebase --version && git --version
```

### Installation Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

---

## 2. Installation locale

```bash
# Cloner le projet
cd ~/Bureau/volo/VOLO\ INVENTORY/volo\ inventory\ v3/volo-deploy

# Installer les dépendances (scripts seed)
npm init -y
npm install firebase-admin dotenv typescript ts-node @types/node

# Copier et configurer l'environnement
cp .env.example .env
# Éditer .env avec vos clés Firebase réelles
```

### Serveur local
L'app est 100% statique — un simple serveur HTTP suffit :
```bash
# Option 1 : Python
python -m http.server 8080

# Option 2 : npx
npx serve .

# Option 3 : VS Code Live Server extension
```

Ouvrir `http://localhost:8080` — PIN équipe : `5555`

---

## 3. Configuration Firebase

### 3.1 Créer le projet Firebase
1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. Créer un projet : `volo-sst-prod`
3. **Région Firestore : `northamerica-northeast1` (Montréal)** — OBLIGATOIRE Loi 25
4. Activer :
   - Firestore Database
   - Realtime Database
   - Authentication (Email/Password)

### 3.2 Obtenir les clés
1. Project Settings > General > Your apps > Add web app
2. Copier la config dans `.env`
3. Project Settings > Service Accounts > Generate new private key
4. Sauvegarder comme `serviceAccountKey.json` (⚠️ NE JAMAIS commiter)

### 3.3 Security Rules
```bash
# Initialiser Firebase dans le projet
firebase init firestore
# Sélectionner le projet volo-sst-prod
# Garder les fichiers par défaut (firestore.rules, firestore.indexes.json)
```

Contenu minimal de `firestore.rules` :
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Personnel — lecture auth requise, écriture admin seulement
    match /personnel/{voloId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role == 'admin';
    }

    // Transactions — lecture auth, écriture membres
    match /transactions/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Pointages
    match /pointages/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Certifications — lecture auth, écriture chef/admin
    match /certifications/{voloId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role in ['admin', 'chef'];
    }

    // Audit logs — lecture admin seulement
    match /audit_logs/{docId} {
      allow read: if request.auth.token.role in ['admin', 'rh'];
      allow write: if request.auth != null;
    }

    // Config — lecture tous, écriture admin
    match /config/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role == 'admin';
    }
  }
}
```

```bash
# Tester avec l'émulateur AVANT de déployer
firebase emulators:start --only firestore
# Puis déployer
firebase deploy --only firestore:rules
```

### 3.4 Émulateur Firebase (développement)
```bash
firebase emulators:start
# Firestore : http://localhost:8080
# Auth : http://localhost:9099
# RTDB : http://localhost:9000
# UI : http://localhost:4000
```

---

## 4. Seed des données de test

```bash
# Peupler Firestore avec données de test
npx ts-node scripts/seed_firestore.ts

# Résultat :
#   1 organisation ORG_TEST_VOLO
#   11 membres de personnel
#   2 chantiers (5 membres chacun)
#   10 incidents (pending_upload / uploaded / failed)
#   3 utilisateurs avec certifications
#   20 entrées audit_logs
#   6 pointages
#   1 config app

# Nettoyer les données de test
npx ts-node scripts/seed_firestore.ts --clean
```

---

## 5. Déploiement Netlify

### ⚠️ RÈGLE ABSOLUE : Drag & drop UNIQUEMENT — JAMAIS Netlify CLI

1. Aller sur [app.netlify.com](https://app.netlify.com)
2. Ouvrir le site VOLO SST
3. Deploys > Drag & drop le dossier `volo-deploy/`
4. Vérifier le déploiement dans le navigateur

### Checklist pré-déploiement
- [ ] `sw.js` — cache version bumpée (`volo-sst-v11.X`)
- [ ] `service-worker.js` — si modifié, version bumpée aussi
- [ ] `data.js` — pas de PII exposées (emails vidés)
- [ ] `.env` et `serviceAccountKey.json` — **PAS** dans le dossier deploy
- [ ] Test PIN équipe fonctionne
- [ ] Test offline fonctionne (couper réseau, recharger)
- [ ] Test scan QR fonctionne (si modifié)

### Fichiers à NE PAS déployer
```
.env
serviceAccountKey.json
emails_prives.js
scripts/
docs/
node_modules/
*.ts
```

---

## 6. Opérations courantes

### Ajouter un membre
1. Ajouter dans `data.js` > `PERSONNEL` array
2. Si Firebase actif : ajouter dans Firestore `personnel/{voloId}`
3. Bumper le cache SW

### Détruire un item
1. Via l'app : caisses-stock.html > modal item > ☠️ DÉTRUIRE
2. Exporter la commande `.txt` depuis le bandeau violet
3. Exécuter : `python destroy_item.py SAC-001 PAL-005`
4. Vérifier `data.js` — l'item est supprimé
5. Redéployer

### Modifier les barèmes
1. Éditer `BAREMES` dans `data.js`
2. Si Firebase actif : mettre à jour `config/app.baremes`
3. Bumper le cache SW

### Consulter les audit logs
```bash
# Via Firebase Console
# Firestore > audit_logs > filtrer par action ou userId

# Via script
firebase firestore:get audit_logs --project volo-sst-prod
```

### Backup localStorage (depuis l'app)
1. Se connecter en tant que chef
2. Accueil > 💾 BACKUP
3. Fichier JSON téléchargé avec toutes les clés `volo_*`

### Restaurer un backup
1. Accueil > 📥 RESTAURER
2. Sélectionner le fichier JSON
3. L'app recharge automatiquement

---

## 7. Dépannage

### L'app affiche un écran blanc
1. Vérifier la console navigateur (F12)
2. Cause fréquente : erreur de syntaxe dans `data.js` après modification
3. Solution : restaurer depuis `backup_YYYY-MM-DD/data.js`

### Le scan QR ne fonctionne pas
1. Vérifier HTTPS (getUserMedia nécessite HTTPS ou localhost)
2. iOS Safari : vérifier permissions caméra dans Réglages
3. Voir `qr-scanner.md` dans le dossier memory pour les solutions connues

### Le PIN équipe est oublié
- PIN par défaut : `5555` (hardcodé dans index.html ligne ~776)
- Ou effacer `volo_team_pin_ts` dans localStorage

### Les données sont incohérentes entre devices
- Sans Firebase : chaque device a son propre localStorage, pas de sync
- Avec Firebase : vérifier que le flush offline a bien envoyé les données
- Dashboard chef > vérifier les transactions récentes

### Le service worker sert une ancienne version
```javascript
// Dans la console navigateur :
navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()));
// Puis Ctrl+Shift+R (hard reload)
```

### Firebase quota dépassé
1. Vérifier Firebase Console > Usage
2. Cause probable : listener `onSnapshot` non fermé (bug)
3. Solution immédiate : désactiver le code fautif
4. Free tier : 50K reads + 20K writes/jour — suffisant en usage normal

---

## 8. Contacts & accès

### Personnes habilitées console Firebase
| Personne | Rôle | Accès |
|----------|------|-------|
| [À DÉSIGNER] | Owner | Tous les services |
| [À DÉSIGNER] | Éditeur | Firestore, Auth, RTDB |

**⚠️ Condition obligatoire #9 : 2+ personnes minimum avec accès console Firebase**

### Ressources
- **App production** : [URL Netlify à compléter]
- **Firebase Console** : [console.firebase.google.com](https://console.firebase.google.com)
- **Make.com** : Webhooks existants (sera retiré Phase 4)
- **Architecture** : `firebase_architecture_decisions.md`
- **Code source** : `volo-deploy/`

---

*VOLO SST · Golden Eagles · Runbook v1.0 · 2026-03-10*
