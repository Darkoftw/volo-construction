// ══════════════════════════════════════════════════════════════
//  VOLO SST — Base de connaissances CNESST
//  Source: LSST (S-2.1), RSST (S-2.1 r.13), Code securite construction (S-2.1 r.4)
//  Scrapped: 2026-03-11
// ══════════════════════════════════════════════════════════════

const CNESST_REGLEMENTS = {

  // ═══════════════════════════════════════
  //  LSST — Loi sur la sante et securite du travail (S-2.1)
  // ═══════════════════════════════════════
  LSST: {
    obligations_employeur: [
      {art: "51", resume: "L'employeur doit prendre les mesures necessaires pour proteger la sante, securite et integrite physique et psychique du travailleur: etablissements equipes, organisation du travail securitaire, hygiene, formation appropriee."},
      {art: "51(7)", resume: "Fournir un materiel securitaire et assurer son maintien en bon etat."},
      {art: "51(9)", resume: "Informer adequatement le travailleur sur les risques et lui assurer la formation, l'entrainement et la supervision appropries."},
      {art: "51(11)", resume: "Fournir gratuitement tous les EPI choisis par le comite SST et en assurer l'utilisation."},
      {art: "51(15)", resume: "Mettre a disposition du comite SST les equipements, locaux et personnel necessaires."},
      {art: "52", resume: "Dresser et maintenir a jour un registre des contaminants et matieres dangereuses."},
      {art: "58", resume: "Employeur de 20+ travailleurs doit elaborer un programme de prevention pour chaque etablissement."},
      {art: "59", resume: "Le programme de prevention doit inclure les mesures de surveillance, evaluation, entretien et suivi."},
      {art: "59(3)", resume: "Le programme doit prevoir les mesures de surveillance, entretien et suivi pour elimination/controle des risques."},
      {art: "62", resume: "Signaler a la Commission dans 24h: deces, perte de membre, blessures multiples, dommages >150 000$."}
    ],
    epi: [
      {art: "51(11)", resume: "EPI fournis gratuitement, choisis par le comite SST. Employeur assure leur utilisation."},
      {art: "3", resume: "La mise a disposition des EPI ne doit pas diminuer les efforts d'elimination des dangers a la source."}
    ],
    formation: [
      {art: "51(9)", resume: "Formation, entrainement et supervision appropries sur les risques du travail."},
      {art: "62.1", resume: "Interdiction d'utiliser un produit dangereux sans formation prealable du travailleur."},
      {art: "62.5", resume: "Programme de formation et information sur les produits dangereux obligatoire."}
    ],
    comite_sst: [
      {art: "59", resume: "Programme de prevention elabore en consultation avec le comite SST."},
      {art: "60", resume: "Transmettre le programme au comite et faire rapport tous les 3 ans sur les priorites d'action."}
    ],
    droit_refus: [
      {art: "12", resume: "Le travailleur peut refuser un travail s'il a des motifs raisonnables de croire a un danger pour sa sante/securite."},
      {art: "13", resume: "Le droit de refus ne s'applique pas si le refus mettrait en peril autrui ou si les conditions sont normales pour ce type de travail."},
      {art: "14", resume: "Pendant le refus, l'employeur ne peut faire executer le travail par un autre. Le travailleur est repute au travail."},
      {art: "15-19", resume: "Processus: notification du superieur, examen avec representant SST, intervention inspecteur, decision motivee."},
      {art: "30", resume: "Interdiction de congedier/suspendre/deplacer un travailleur pour exercice du droit de refus."}
    ]
  },

  // ═══════════════════════════════════════
  //  RSST — Reglement sur la sante et securite du travail (S-2.1 r.13)
  // ═══════════════════════════════════════
  RSST: {
    chutes: [
      {art: "33.1", resume: "Protection obligatoire si exposition a chute >3m, ou risque de chute dans liquide/substance dangereuse, equipement en mouvement, ou >1.5m dans puits/bassin."},
      {art: "33.2", resume: "Mesures: modifier position de travail, installer garde-corps, utiliser filet, equiper de harnais antichute."},
      {art: "33.3", resume: "Garde-corps obligatoire en bordure du vide aux endroits a risque de chute >3m ou >1.5m selon contexte."},
      {art: "33.5", resume: "Toiture <=15 degres: ligne d'avertissement peut remplacer garde-corps, harnais obligatoire hors zone delimitee."},
      {art: "347", resume: "Harnais et liaison antichute doivent etre conformes aux normes CSA applicables."}
    ],
    espaces_clos: [
      {art: "1 (def)", resume: "Espace totalement/partiellement ferme (reservoir, silo, cuve, fosse, egout) presentant risque d'asphyxie, ensevelissement ou noyade."}
    ],
    epi: [
      {art: "66", resume: "Vetements de protection exclusifs pour travaux avec plomb, amiante ou mercure."},
      {art: "69", resume: "Cagoule de sablage a adduction d'air obligatoire pour nettoyage par jet d'abrasif."}
    ],
    inspection: [
      {art: "5", resume: "Tout equipement de ventilation, eclairage ou securite doit etre en etat de fonctionnement optimal pendant exploitation."},
      {art: "104", resume: "Systemes de ventilation mecanique: inspection et reglage au moins 1x/an, filtres entretenus ou remplaces."}
    ]
  },

  // ═══════════════════════════════════════
  //  CODE DE SECURITE CONSTRUCTION (S-2.1 r.4)
  // ═══════════════════════════════════════
  CODE_CONSTRUCTION: {
    chutes: [
      {art: "2.9.1", resume: "Garde-corps obligatoire a max 300mm du vide, hauteur variable selon risque (1.2m a 3m)."},
      {art: "2.9.2", resume: "Exceptions au garde-corps: modification du procede, systeme de limitation, filet de securite, ou harnais relie a ancrage."},
      {art: "2.9.3", resume: "Filet de securite conforme ANSI-ASSE A10.11 ou NF EN 1263-1 et 1263-2."},
      {art: "2.10.12", resume: "Harnais de securite conforme CSA Z259.10, limite a 6 kN de force ou 1.8m de chute libre."},
      {art: "2.10.15", resume: "Systeme d'ancrage minimum 18 kN ou concu par ingenieur selon CSA Z259.16."},
      {art: "2.10.16", resume: "Systeme de limitation de deplacement: ne permet pas s'approcher a moins 0.9m du vide."}
    ],
    sauvetage: [
      {art: "2.9.5", resume: "Travailleur suspendu doit etre degage dans MAXIMUM 15 MINUTES."},
      {art: "2.9.5.1", resume: "Formation obligatoire sur procedure de sauvetage AVANT les travaux; exercices tous les 6 MOIS."},
      {art: "2.9.5.2", resume: "Maitre d'oeuvre assure disponibilite d'equipements et presence d'intervenant en sauvetage FORME."},
      {art: "2.9.5.3", resume: "Equipement conforme NFPA 2500 ou ANSI Z359.4 doit etre DISPONIBLE sur le chantier."}
    ],
    epi_obligatoires: [
      {art: "2.10.3", resume: "CASQUE conforme CAN/CSA Z94.1 pour tous sur chantier."},
      {art: "2.10.5", resume: "Protection YEUX/VISAGE CAN/CSA-Z94.3 si exposition a particules, substances dangereuses ou rayonnement."},
      {art: "2.10.6", resume: "CHAUSSURES Classe 1 CAN/CSA-Z195 obligatoires."},
      {art: "2.10.10", resume: "GANTS/moufles pour objets aux aretes vives ou substances corrosives."},
      {art: "2.10.13", resume: "Vetement de flottaison individuel approuve Transports Canada (150 N minimum) si travail pres de l'eau."}
    ],
    inspection_equipements: [
      {art: "2.15.1(1)", resume: "Appareils verifies AVANT utilisation initiale et inspectes periodiquement selon fabricant."},
      {art: "2.15.1(1)(e)", resume: "Inspection quotidienne visuelle et test de fonctionnement REQUIS."},
      {art: "2.15.12(8)", resume: "Registre des inspections et reparations OBLIGATOIRE pour appareils de levage de personnes."}
    ],
    formation_obligatoire: [
      {art: "2.4.2(i)", resume: "Cours 'Sante et securite generale' obligatoire pour personnel et travailleurs."},
      {art: "2.8.3", resume: "Signaleur: formation obligatoire sur risques circulation, regles securite, positionnement, communication."},
      {art: "2.9.5.1", resume: "Formation sauvetage obligatoire AVANT travaux critiques; exercices reguliers requis."}
    ],
    espaces_clos: [
      {art: "1.1 (def)", resume: "Espace non concu pour occupation humaine (reservoirs, silos, cuves, caissons, puits)."},
      {art: "2.4.1(6d)", resume: "Employeur doit assurer moyen facile d'evacuation et ventilation appropriee."}
    ]
  },

  // ═══════════════════════════════════════
  //  NORMES CSA APPLICABLES
  // ═══════════════════════════════════════
  NORMES_CSA: [
    {code: "CSA Z259.10", desc: "Harnais de securite - Conception, fabrication et inspection", equipement: "Harnais"},
    {code: "CSA Z259.16", desc: "Systemes d'ancrage - Conception et installation", equipement: "Ancrage"},
    {code: "CSA Z259.11", desc: "Absorbeurs d'energie", equipement: "Longe avec absorbeur"},
    {code: "CSA Z259.12", desc: "Systemes de ligne de vie horizontale", equipement: "Ligne de vie"},
    {code: "CSA Z259.13", desc: "Liaison antichute auto-retractable", equipement: "Enrouleur"},
    {code: "CSA Z259.14", desc: "Dispositifs d'arret de chute sur plan incline", equipement: "Coulisseau"},
    {code: "CSA Z259.15", desc: "Connecteurs", equipement: "Mousquetons, anneaux"},
    {code: "CAN/CSA Z94.1", desc: "Casques de securite industriels", equipement: "Casque"},
    {code: "CAN/CSA Z94.3", desc: "Protection des yeux et du visage", equipement: "Lunettes, visiere"},
    {code: "CAN/CSA Z195", desc: "Chaussures de protection", equipement: "Bottes de securite"},
    {code: "NFPA 2500", desc: "Operations de sauvetage technique", equipement: "Equipement sauvetage"},
    {code: "ANSI Z359.4", desc: "Systemes de sauvetage", equipement: "Kit sauvetage"}
  ],

  // ═══════════════════════════════════════
  //  FREQUENCES D'INSPECTION RECOMMANDEES
  // ═══════════════════════════════════════
  INSPECTIONS: [
    {equipement: "Harnais de securite", avant_usage: true, periodique: "Annuelle par personne competente", retrait: "Apres une chute, 5-7 ans selon fabricant, defaut visible"},
    {equipement: "Longes et absorbeurs", avant_usage: true, periodique: "Annuelle", retrait: "Apres une chute, degradation visible, deformation"},
    {equipement: "Mousquetons/connecteurs", avant_usage: true, periodique: "Annuelle", retrait: "Corrosion, deformation du mecanisme, jeu excessif"},
    {equipement: "Cordes/cordages", avant_usage: true, periodique: "Annuelle + apres usage intensif", retrait: "Coupure, usure >10% diametre, contamination chimique"},
    {equipement: "Ancrages", avant_usage: true, periodique: "Annuelle par ingenieur", retrait: "Deformation, corrosion, charge >18kN subie"},
    {equipement: "Casque", avant_usage: true, periodique: "Selon fabricant (3-5 ans)", retrait: "Impact, fissure, decoloration UV"},
    {equipement: "Appareil respiratoire (APRIA)", avant_usage: true, periodique: "Mensuelle + annuelle complete", retrait: "Valve defectueuse, fuite, bouteille expiree"},
    {equipement: "Bouteilles O2", avant_usage: true, periodique: "Hydrostatique aux 5 ans", retrait: "Date expiree, corrosion, choc visible"},
    {equipement: "Treuil/palan", avant_usage: true, periodique: "Annuelle", retrait: "Cable use, frein defectueux, deformation"},
    {equipement: "Civiere/brancard", avant_usage: true, periodique: "Semestrielle", retrait: "Sangles usees, structure deformee"},
    {equipement: "Detecteur de gaz", avant_usage: true, periodique: "Calibration mensuelle", retrait: "Capteur expire, calibration impossible"}
  ],

  // ═══════════════════════════════════════
  //  CERTIFICATIONS OBLIGATOIRES
  // ═══════════════════════════════════════
  CERTIFICATIONS: [
    {id: "rcr", nom: "RCR/DEA", duree_mois: 24, obligatoire: true, source: "Reglement sur les normes minimales de premiers secours", desc: "Reanimation cardiorespiratoire et defibrillateur"},
    {id: "pdsb", nom: "PDSB", duree_mois: 36, obligatoire: false, desc: "Principes de deplacement securitaire des beneficiaires"},
    {id: "simdut", nom: "SIMDUT 2015", duree_mois: 24, obligatoire: true, source: "LSST art. 62.5", desc: "Systeme d'information sur les matieres dangereuses"},
    {id: "nacelle", nom: "Nacelle elevatrice", duree_mois: 36, obligatoire: true, source: "RSST + fabricant", desc: "Operation d'engins elevateurs a nacelle"},
    {id: "chariot", nom: "Chariot elevateur", duree_mois: 36, obligatoire: true, source: "RSST art. 256.1", desc: "Conduite de chariots elevateurs"},
    {id: "espace_clos", nom: "Espace clos", duree_mois: 24, obligatoire: true, source: "RSST Section XXVI", desc: "Entree en espace clos, procedures, surveillance"},
    {id: "hauteur", nom: "Travail en hauteur", duree_mois: 36, obligatoire: true, source: "Code construction 2.9.5.1", desc: "Protection contre les chutes, utilisation harnais, sauvetage"},
    {id: "sauvetage", nom: "Sauvetage technique", duree_mois: 12, obligatoire: true, source: "Code construction 2.9.5.1", desc: "Procedures de sauvetage, exercices aux 6 mois"},
    {id: "electricite", nom: "Securite electrique", duree_mois: 36, obligatoire: true, source: "RSST + CSA Z462", desc: "Travaux pres de lignes electriques, verrouillage"},
    {id: "premiers_soins", nom: "Premiers soins", duree_mois: 36, obligatoire: true, source: "Reglement premiers secours", desc: "Secourisme en milieu de travail"}
  ],

  // ═══════════════════════════════════════
  //  POINTS DE CONFORMITE (checklist audit)
  // ═══════════════════════════════════════
  CHECKLIST_CONFORMITE: [
    {id: 1, categorie: "Organisation", item: "Programme de prevention ecrit et a jour", ref: "LSST art. 58-59", critique: true},
    {id: 2, categorie: "Organisation", item: "Comite SST en place avec proces-verbaux", ref: "LSST art. 59-60", critique: true},
    {id: 3, categorie: "Organisation", item: "Registre des accidents et incidents", ref: "LSST art. 62", critique: true},
    {id: 4, categorie: "Organisation", item: "Procedure de droit de refus connue et affichee", ref: "LSST art. 12-19", critique: false},
    {id: 5, categorie: "EPI", item: "EPI fournis gratuitement a tous les travailleurs", ref: "LSST art. 51(11)", critique: true},
    {id: 6, categorie: "EPI", item: "Casques CSA Z94.1 pour tous sur chantier", ref: "Code const. 2.10.3", critique: true},
    {id: 7, categorie: "EPI", item: "Chaussures CSA Z195 Classe 1 pour tous", ref: "Code const. 2.10.6", critique: true},
    {id: 8, categorie: "EPI", item: "Harnais CSA Z259.10 inspectes annuellement", ref: "Code const. 2.10.12, RSST 347", critique: true},
    {id: 9, categorie: "EPI", item: "Registre d'inspection des EPI tenu a jour", ref: "Code const. 2.15.12(8)", critique: true},
    {id: 10, categorie: "Chutes", item: "Protection contre les chutes >3m en place", ref: "RSST 33.1", critique: true},
    {id: 11, categorie: "Chutes", item: "Ancrages minimum 18 kN ou concu par ingenieur", ref: "Code const. 2.10.15", critique: true},
    {id: 12, categorie: "Chutes", item: "Force d'arret limitee a 6 kN", ref: "Code const. 2.10.12", critique: true},
    {id: 13, categorie: "Sauvetage", item: "Degagement travailleur suspendu en max 15 min", ref: "Code const. 2.9.5", critique: true},
    {id: 14, categorie: "Sauvetage", item: "Exercices de sauvetage aux 6 mois", ref: "Code const. 2.9.5.1", critique: true},
    {id: 15, categorie: "Sauvetage", item: "Intervenant sauvetage forme present sur site", ref: "Code const. 2.9.5.2", critique: true},
    {id: 16, categorie: "Sauvetage", item: "Equipement conforme NFPA 2500 ou ANSI Z359.4", ref: "Code const. 2.9.5.3", critique: true},
    {id: 17, categorie: "Formation", item: "Cours SST general complete par tous", ref: "Code const. 2.4.2(i)", critique: true},
    {id: 18, categorie: "Formation", item: "Formation SIMDUT a jour pour tous", ref: "LSST art. 62.5", critique: true},
    {id: 19, categorie: "Formation", item: "Formation sauvetage avant travaux critiques", ref: "Code const. 2.9.5.1", critique: true},
    {id: 20, categorie: "Formation", item: "RCR/DEA a jour pour secouristes designes", ref: "Reg. premiers secours", critique: true},
    {id: 21, categorie: "Espaces clos", item: "Procedure d'entree ecrite et approuvee", ref: "RSST Section XXVI", critique: true},
    {id: 22, categorie: "Espaces clos", item: "Surveillant forme en permanence a l'entree", ref: "RSST + Code const.", critique: true},
    {id: 23, categorie: "Espaces clos", item: "Detection atmospherique avant entree", ref: "RSST", critique: true},
    {id: 24, categorie: "Inspection", item: "Inspection quotidienne visuelle des equipements", ref: "Code const. 2.15.1(1)(e)", critique: true},
    {id: 25, categorie: "Inspection", item: "Inspections periodiques selon fabricant documentees", ref: "Code const. 2.15.1(1)", critique: true},
    {id: 26, categorie: "Urgence", item: "Procedure d'urgence affichee et connue", ref: "LSST art. 51", critique: true},
    {id: 27, categorie: "Urgence", item: "Trousse premiers soins conforme et accessible", ref: "Reg. premiers secours", critique: true},
    {id: 28, categorie: "Urgence", item: "Notification CNESST dans 24h pour evenements graves", ref: "LSST art. 62", critique: true}
  ]
};

// Export pour usage dans rapport-cnesst.html et plan-sauvetage.html
if (typeof window !== 'undefined') window.CNESST_REGLEMENTS = CNESST_REGLEMENTS;
