# VOLO SST — Firebase Architecture Decisions

## Brainstorm Agent Team · 2026-03-10

**Participants :**
- ARCHITECTE — Structure Firestore, migration, coûts
- SÉCURITÉ — LPRPDE/Loi 25, auth, Security Rules
- TERRAIN — Offline, performance mobile, UX chantier
- DIABLE — Cas limites, risques, points de défaillance

**Format :** 3 rounds de discussion contradictoire + synthèse Team Lead

---

## SYNTHÈSE TEAM LEAD

### Verdict global : FEU VERT CONDITIONNEL

Les 4 agents convergent vers une **architecture hybride progressive**. Aucun blocage fondamental. Le plan est réaliste sous 9 conditions obligatoires.

---

## DÉCISIONS RETENUES

### 1. Architecture "Read Static, Write Firestore"

| Couche | Rôle | Justification |
|--------|------|---------------|
| `data-inventory.js` (statique, SW cache) | Source PRIMAIRE de lecture | Zéro latence, offline natif, zéro coût reads |
| `localStorage` | Cache opérationnel terrain + queue offline | Fonctionne à -25° sans réseau, prouvé fiable |
| Firestore | Writes uniquement (scans, transferts, pointages, certs) | Sync multi-device, audit trail, Security Rules |
| Firebase RTDB | Chat temps réel (déjà en place) | Meilleur pour messages haute fréquence |

**Principe :** fichier statique pour lire, Firestore pour écrire, localStorage pour survivre offline.

**Consensus :** UNANIME (4/4 agents)

---

### 2. data.js scindé — Retrait des PII

**Décision :** `data.js` est scindé en :
- `data-inventory.js` — items (823), catégories, caisses (80), dépôts, destinations, remorques, certifications template, barèmes. **Aucune donnée personnelle.**
- Données nominatives (noms, rôles, villes, VOLO IDs) → **Firestore `personnel/{voloId}`**, protégées par Security Rules + Firebase Auth.

**Raison :** Conformité Loi 25 du Québec. Un fichier JS public avec noms/villes de 156 personnes = violation directe.

**Consensus :** UNANIME (4/4)

---

### 3. Authentification à 2 niveaux

| Contexte | Méthode | Justification |
|----------|---------|---------------|
| **Terrain** (scan, pointage, inventaire) | PIN 6+ chiffres, hashé bcrypt/Argon2, stocké Firestore | Praticité à -25° avec gants, <3 sec d'accès |
| **Bureau** (admin, rapports, données sensibles) | Firebase Auth (email/password ou Anonymous + upgrade) | Vrai contrôle d'accès, Custom Claims pour rôles |

**PIN actuel (5555 en dur) : ABANDONNÉ.** Inacceptable — visible via View Source.

**Custom Claims :** Assignées via Netlify Function `set-claims` (pas de Cloud Functions GCP).

**Consensus :** 4/4 (SÉCURITÉ exige bcrypt minimum + rate limiting 5 tentatives)

---

### 4. Migration progressive en 5 phases

| Phase | Contenu | Durée | Critère de passage |
|-------|---------|-------|-------------------|
| **0** | Scinder data.js, modulariser JS, écrire tests de référence | 2 sem | Tests verts, data-inventory.js déployé |
| **1** | Firebase Auth + Security Rules + Netlify Function claims | 2 sem | Auth fonctionnel, rules testées via émulateur |
| **2** | Shadow-write Firestore (localStorage reste master, feature flags) | 3 sem | 95% des writes répliqués sans erreur sur 7 jours |
| **3** | Dashboard bureau lit Firestore, réconciliation offline/online | 2 sem | Dashboard temps réel fonctionnel |
| **4** | Firestore source de vérité writes, localStorage = cache seulement | 2 sem | Zéro divergence localStorage/Firestore sur 14 jours |

**Total : 11 semaines.** Rollback possible à chaque phase.

**Consensus :** 4/4 (DIABLE exige critères de graduation écrits AVANT le code)

---

### 5. Collections Firestore

```
firestore/
  personnel/{voloId}         # 156 docs — noms, rôles, régions (PII protégées)
  items/{itemId}             # 823 docs — statuts temps réel (deploye/disponible)
  caisses/{caisseId}         # 80 docs
  transactions/{autoId}      # PICK-ON, PICK-OFF, ANNULÉ, RETOURNÉ
  pointages/{autoId}         # Arrivée/Départ terrain
  certifications/{voloId}    # 1 doc par membre, map de certs
  km_logs/{autoId}           # Kilométrage véhicule perso
  photos/{autoId}            # Métadonnées photos (pas le base64)
  urgences/{autoId}          # Alertes urgence terrain
  destroyed_items/{itemId}   # Audit trail destructions
  config/app                 # Annonces, version, barèmes
```

**Collections plates (pas de sous-collections)** — justifié par le volume faible (823 items, 156 users).

**Pas de `onSnapshot` sur items/personnel.** Lectures via `data-inventory.js` statique.

**Consensus :** 4/4

---

### 6. Coûts estimés

| Scénario | Reads/jour | Writes/jour | Coût/mois |
|----------|-----------|-------------|-----------|
| Normal (30 users actifs/jour) | 3000-5000 | 500-800 | **$0** (free tier) |
| Pic (inventaire annuel, 100+ users) | 15000-25000 | 2000-3000 | **$0** (free tier) |
| Bug listener non fermé | 100K+ | — | **$3-5/jour** |

**Free tier Firestore :** 50K reads + 20K writes/jour. Suffisant pour le volume actuel.

**Consensus :** ARCHITECTE ($0), DIABLE ($15-80/mois avec marge), convergence à $0-20/mois en régime normal.

---

### 7. Région Firebase

**`northamerica-northeast1` (Montréal)** — Conformité Loi 25 sur la localisation des données au Canada.

**Consensus :** UNANIME

---

## DÉCISIONS REJETÉES

### 1. Migration full Firestore (tout dans Firestore, retrait data.js)

**Proposé par :** ARCHITECTE (R1 initial)
**Rejeté par :** TERRAIN, DIABLE
**Raison :** Premier lancement offline = écran blanc si cache Firestore vide. iOS Safari purge IndexedDB après 7 jours d'inactivité. Le SDK Firebase ajoute ~200KB au chargement. Incompatible avec les conditions terrain.

### 2. Garder le système actuel tel quel (Make.com + Sheets + localStorage)

**Proposé par :** DIABLE (R1)
**Rejeté par :** SÉCURITÉ, ARCHITECTE
**Raison :** 5 RED FLAGS sécurité (PIN en dur, data.js public, webhooks sans token, localStorage non chiffré, pas de rules). Non-conforme Loi 25. Pas de sync multi-device.

### 3. Email/password Firebase Auth pour tout le monde

**Proposé par :** SÉCURITÉ (R1)
**Rejeté par :** TERRAIN
**Raison :** Impraticable sur le terrain — mot de passe oublié sans réseau = pas d'accès. Gants + écran mouillé + email = frustration. Remplacé par auth 2 niveaux (PIN hashé terrain + Auth bureau).

### 4. Listeners `onSnapshot` sur l'inventaire

**Proposé par :** Personne explicitement, mais risque identifié
**Rejeté par :** TOUS
**Raison :** Explose les coûts (823 reads x N users x N ouvertures). Drain batterie. Inutile — l'inventaire ne change pas en temps réel pendant un shift.

### 5. Cloud Functions GCP comme backend

**Proposé par :** SÉCURITÉ (implicite)
**Rejeté par :** ARCHITECTE, DIABLE
**Raison :** Ajoute un service GCP à maintenir. Netlify Functions suffit pour les Custom Claims. Moins de vendor lock-in.

---

## 9 CONDITIONS OBLIGATOIRES

Issues des 3 rounds, toutes acceptées par consensus :

| # | Condition | Source |
|---|-----------|--------|
| 1 | `data-inventory.js` purgé de TOUT PII avant Phase 1 | SÉCURITÉ |
| 2 | Security Rules écrites et testées via émulateur AVANT production | SÉCURITÉ |
| 3 | Firebase Auth fonctionnel avec Custom Claims via Netlify Function | SÉCURITÉ + DIABLE |
| 4 | Phase 0 (modularisation + tests) complétée AVANT tout Firebase | DIABLE + ARCHITECTE |
| 5 | Critères de graduation inter-phases écrits et approuvés | DIABLE |
| 6 | Circuit breaker + alertes quota Firestore dès Phase 2 | DIABLE |
| 7 | Test offline en conditions réelles (site, connexion coupée) | TERRAIN |
| 8 | Indicateur visuel offline + compteur de writes en attente | TERRAIN |
| 9 | Runbook opérationnel (2+ personnes habilitées console Firebase) | DIABLE |

---

## CONFORMITÉ LOI 25 — CHECKLIST

| Exigence | Statut après migration | Action |
|----------|----------------------|--------|
| Données personnelles protégées | OK — Firestore + Security Rules | Phase 1 |
| Consentement éclairé | À FAIRE — bandeau d'information | Phase 1 |
| Registre des incidents | À FAIRE — collection Firestore `incidents` | Phase 1 |
| Politique de conservation (TTL) | À FAIRE — TTL 90 jours sur logs | Phase 2 |
| Localisation Canada | OK — région Montréal | Phase 1 |
| Responsable vie privée | À DÉSIGNER | Pré-Phase 0 |
| Audit trail | OK — `lastModifiedBy` + `timestamp` sur chaque doc | Phase 2 |

---

## ARCHITECTURE FINALE — SCHÉMA

```
┌─────────────────────────────────────────────────────┐
│                    TERRAIN                           │
│                                                     │
│  data-inventory.js ──→ Lecture inventaire (SW cache) │
│  localStorage ──→ Queue offline writes              │
│  PIN hashé (bcrypt) ──→ Auth terrain rapide         │
│                                                     │
│  ┌─── Quand réseau disponible ───┐                  │
│  │  localStorage flush ──→ Firestore writes         │
│  └───────────────────────────────┘                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    BUREAU                            │
│                                                     │
│  Firebase Auth (email) ──→ Login sécurisé           │
│  Firestore reads ──→ Dashboard, rapports, admin     │
│  Firestore writes ──→ CRUD certifications, config   │
│  Custom Claims ──→ Rôles (chef/sauveteur/surveillant)│
│  Firebase RTDB ──→ Chat temps réel (existant)       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    FIREBASE                          │
│                                                     │
│  Firestore (northamerica-northeast1)                │
│  ├── personnel/{voloId}     # PII protégées         │
│  ├── transactions/{autoId}  # PICK-ON/OFF           │
│  ├── pointages/{autoId}     # Heures terrain        │
│  ├── certifications/{voloId}# Certs par membre      │
│  ├── urgences/{autoId}      # Alertes               │
│  └── config/app             # Annonces, version     │
│                                                     │
│  Security Rules : auth required, role-based         │
│  Realtime DB : chat (existant)                      │
│                                                     │
│  Netlify Function : set-claims (Custom Claims)      │
└─────────────────────────────────────────────────────┘
```

---

*Brainstorm réalisé par 4 agents Claude — VOLO SST Golden Eagles · 2026-03-10*
