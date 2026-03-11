# VOLO SST — Document Master de Refonte
> Référence complète · Design System + Blueprint Technique · 10 mars 2026

---

## 🦅 Identité visuelle

### Logos
| Usage | Fichier | Description |
|---|---|---|
| **Splash screen / App principale** | `FkhI9CnnSjCZrmCn1Gamfg_2k.webp` | Eagle IA — faucon noir couronne gold, brancard, trou noir cosmique, texte "Sauvetage Technique / Volo Rescue" |
| **King logo (backup / header)** | `king_logo.jpg` | Aigle noir couronne gold, fond sombre circulaire |
| **Dashboard client** | `eagle_orange.jpeg` | Identité terrain VOLO classique orange |

### Règle logos
- Eagle IA → splash screen + page de présentation
- King logo → header app interne, petits formats
- Eagle orange → dashboard Responsable Industrie (token URL)

---

## 🎨 Design System — Luxury Dark

### Palette principale
```css
--noir-0:     #000000;   /* Trou noir, fond splash */
--noir-1:     #05050A;   /* Background principal app */
--noir-2:     #0C0C14;   /* Background secondaire */
--noir-3:     #13131E;   /* Cards, sections */
--noir-4:     #1A1A28;   /* Éléments surélevés */

--gold:       #C9A84C;   /* Or standard */
--gold-bright:#F0C040;   /* Or lumineux, horloge, glow */
--gold-dark:  #8A6020;   /* Or sombre, ombres */
--gold-ghost: rgba(201,168,76,0.08); /* Fond subtle */

--blanc:      #F2EEE8;   /* Texte principal */
--blanc-dim:  #8A8690;   /* Texte secondaire */
--blanc-ghost:#2E2C38;   /* Séparateurs */
```

### Couleurs de rôles — CRITIQUE
```css
--chef:       #E53935;   /* Rouge  — Chef d'équipe */
--sauveteur:  #E65100;   /* Orange — Sauveteur */
--surveillant:#2979FF;   /* Bleu   — Surveillant */
--actif:      #00C853;   /* Vert   — En ligne / Actif */
```
Ces couleurs s'appliquent partout : badges, bordures avatar, stats cards, bannières, alertes.

### Typographie
```css
/* Titres — élégance serif */
font-family: 'Cormorant Garamond', serif;
/* → Golden Eagles, titres de sections, taglines */

/* Interface — clarté industrielle */
font-family: 'Oswald', sans-serif;
/* → Labels, boutons, navigation, badges */

/* Données — précision monospace */
font-family: 'JetBrains Mono', monospace;
/* → Horloge, IDs, codes, numéros de série */

/* Corps — lisibilité */
font-family: 'Inter', sans-serif;
/* → Texte courant, descriptions */
```

### Effets visuels
```css
/* Grain texture — noise subtil */
body::after {
  background: fractalNoise url (svg);
  opacity: 0.028;
}

/* Cards — glassmorphism sombre */
.card {
  background: linear-gradient(160deg, rgba(19,19,30,0.92), rgba(12,12,20,0.96));
  border: 1px solid rgba(201,168,76,0.15);
  border-radius: 16px;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 40px rgba(0,0,0,0.7);
}

/* Ligne gold en haut de chaque card */
.card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, #F0C040, #C9A84C, transparent);
}

/* Logo glow animation */
@keyframes logoGlow {
  0%,100% { box-shadow: 0 0 20px rgba(201,168,76,0.25); }
  50%      { box-shadow: 0 0 35px rgba(201,168,76,0.5); }
}
```

---

## 💫 Splash Screen — Trou Noir

### Fichier de référence
`volo_splash_FINAL.html` — version avec Eagle IA, trou noir canvas

### Description de l'effet
- **Fond** : noir absolu `#000` + canvas trou noir animé
- **Trou noir** : 200 particules anneau d'accrétion + 30 filaments spiralés + 60 étoiles aspirées + motion blur `rgba(0,0,0,0.82)`
- **Vignette** : fenêtre centrale 28% — bords noirs absolus, coins `rgba(0,0,0,1)`
- **Logo** : Eagle IA rogné en cercle, `brightness(1.5)`, glow gold pulsant
- **Animation entrée** : plonge depuis le vide — `scale(0.04)` → `scale(1)` en 2.4s
- **Ondes d'impact** : 3 cercles concentriques gold qui explosent à l'atterrissage

### Typographie du splash
```
"The"             → Oswald 200, 10px, spacing 0.6em, gold 45%
"Golden Eagles"   → Cormorant Garamond 300, ~42px, dégradé or métallique
séparateur        → lignes + diamant gold
"VOLO · SST"      → Oswald 300, 14px, spacing 0.65em, gold 70%
"Sauvetage Technique" → Cormorant italic 300, 22px, gold 55%
loader            → barre 100px, gradient gold animé
```

### Timing
```
0.0s  → Splash démarre, Firebase charge en arrière-plan
0.2s  → Eagle commence à plonger
2.1s  → Impact + ondes de choc
2.5s  → Logo stabilisé, anneaux orbitaux apparaissent
2.8s  → Texte fade in
5.0s  → "— Entrer —" clignote
5.5s  → Fade out + redirect index.html (déjà en cache)
```

---

## 🏗️ Architecture de l'app

### Structure des pages
```
index.html          ← App principale (splash intégré)
splash.html         ← Splash standalone (Canva / partage)
dashboard-superviseur.html ← Dashboard Responsable Industrie
```

### Sections dans index.html
```
HEADER sticky
  └── Logo King (46px, glow gold)
  └── Brand name gradient
  └── Pill "En ligne" vert
  └── Notif btn (badge rouge)

BANNIÈRE PICK ON ACTIF (conditionnelle)
  └── Orange pulsant — visible toutes les pages

HERO / HOME
  └── User card (avatar couleur rôle)
  └── Pointage hero (horloge JetBrains Mono gradient gold)
  └── Pick grid (On = orange, Off = rouge)
  └── Stats grid (Sauveteurs/Chefs/Surveil/Items)
  └── Alertes équipement (expiration)
  └── Dernières transactions (5 dernières)

BOTTOM NAV (5 items, indicateur gold actif)
  └── Accueil | Pointage | Pick | Véhicules | Plan
```

---

## 🔥 Architecture Firestore

```
/orgs/{orgId}/
  chantiers/{chantierId}     ← Projets actifs
  membres/{userId}           ← Équipe + rôles

/users/{userId}
  { orgIds: [{id, role, joinedAt}] }

/transactions/{userId}/{transactionId}
  { items, horodatage, statut, detailItems[] }

/inspections/{inspectionId}
/incidents/{incidentId}

/client_tokens/{token}
  { clientNom, chantierId, createdAt, expiresAt, actif }

/audit_logs/{logId}          ← IMMUABLE
```

### Items AVEC inspection obligatoire
Harnais, Casques, Longes, Absorbeurs (Asap Lock, Asap Sorber Axess), Antichutes mobiles, Cordes

### Items SANS date d'expiration
Mousquetons (Vulcan, Bm'D, CMC DNA Twist, acier SMC), Palans (Harken Wingman), Sacs contenants

---

## 🐛 Corrections UX prioritaires (Pick On/Off)

### 1. Indicateur Pick On actif
Bannière orange en haut, visible toutes les pages, tant que Pick Off non complété. Bouton Pick On grisé.

### 2. Stack des items (groupes dépliables)
Items du même type regroupés. Clic → déplie liste individuelle avec numéros de série + checkboxes. Aucun scroll vers le haut à l'ouverture.

### 3. Pick Off mis en valeur
Bordure pulsante + badge "Pick Off (X items)" quand Pick On actif.

### 4. Supprimer QR du flux Pick On/Off
QR code retiré complètement (HTML + JS + event listeners supprimés). Reste uniquement dans Caisse/Stock.

### 5. Bouton Chat sans reset
Chat n'ouvre plus depuis le début — navigue directement au module Chat sans réinitialiser l'état.

### 6. Mémoire transactions
5 dernières transactions sur l'accueil. Chaque transaction cliquable → détail complet (items + numéros de série + qui + quand + statut).

---

## 📋 Checklist APRIA (Pick Off obligatoire)

Avant de valider un Pick Off, checklist complète :
- **A** — Anomalie détectée ?
- **P** — Pièces manquantes ?
- **R** — Retrait nécessaire ?
- **I** — Inspection requise ?
- **A** — Autre commentaire ?

Règle : Oui sur un point → note OBLIGATOIRE. Impossible de valider sans compléter.

---

## 🔐 Sécurité

- ⚠️ Clé service account exposée → À RÉVOQUER dans Firebase Console
- Security Rules Phase 2 → en attente
- `volo_pin` retiré du code source → remplacé par `volo_last_volo` hashé SHA-256
- Audit logs immuables sur toutes les actions sensibles

---

## 🚀 Stack & Déploiement

```
Frontend     → HTML / CSS / JavaScript vanilla
Auth         → Firebase Authentication
Database     → Cloud Firestore (northamerica-northeast1)
Functions    → Firebase Cloud Functions
Hosting      → Netlify (voloinv7.netlify.app)
Firebase ID  → volo-sst-prod
Site Netlify → c8bef998-b996-4e08-b734-e30a668e76f7
```

### Compte test
```
Email    : admin@volosst.com
Password : Volo2026!
```

---

## 📁 Fichiers clés

| Fichier | Description |
|---|---|
| `index.html` | App principale — tout est là |
| `splash.html` | Splash standalone déployé |
| `dashboard-superviseur.html` | Dashboard client Responsable Industrie |
| `PROMPT_MASTER_VOLO.md` | Contexte complet pour Claude Code |
| `firestore.rules` | Règles de sécurité Firestore |
| `firebase-config.js` | Config Firebase (ne pas exposer) |

---

*Ce document est la référence master. Mettre à jour à chaque changement majeur.*
