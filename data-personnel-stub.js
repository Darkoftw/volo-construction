// ============================================================
// VOLO SST — data-personnel-stub.js
// Données personnel ANONYMISÉES pour développement et tests
// En production : ces données viennent de Firestore (personnel/{voloId})
// ============================================================
// AVERTISSEMENT : Ce fichier ne contient PAS de vraies données personnelles.
// Les vrais noms/villes/rôles sont dans Firestore, protégés par Security Rules.
// ============================================================

const PERSONNEL = [
  // --- ESTRIE (13 sauveteurs + surveillants) ---
  {id:"SAUV-AG-075",volo:"V0075",name:"Chef Estrie 1",role:"CHEF D'EQUIPE",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-A",email:""},
  {id:"SAUV-MB-180",volo:"V0180",name:"Chef Estrie 2",role:"CHEF D'EQUIPE",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-YB-077",volo:"V0077",name:"Chef Estrie 3",role:"CHEF D'EQUIPE",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-A",email:""},
  {id:"SAUV-AD-076",volo:"V0076",name:"Coordo Estrie 1",role:"COORDONNATEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-CS-178",volo:"V0178",name:"Sauveteur Estrie 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-C",email:""},
  {id:"SAUV-CL-115",volo:"V0115",name:"Sauveteur Estrie 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-DB-172",volo:"V0172",name:"Sauveteur Estrie 3",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-D",email:""},
  {id:"SAUV-FM-182",volo:"V0182",name:"Sauveteur Estrie 4",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-GM-206",volo:"V0206",name:"Sauveteur Estrie 5",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-E",email:""},
  {id:"SAUV-JM-205",volo:"V0205",name:"Sauveteur Estrie 6",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-ML-113",volo:"V0113",name:"Sauveteur Estrie 7",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-F",email:""},
  {id:"SAUV-ML-339",volo:"V0339",name:"Sauveteur Estrie 8",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SAUV-OL-114",volo:"V0114",name:"Sauveteur Estrie 9",role:"SAUVETEUR",type:"SAUVETEUR",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SURV-AA-364",volo:"V0364",name:"Surveillant Estrie 1",role:"SURVEILLANT",type:"SURVEILLANT",region:"ESTRIE",ville:"Ville-B",email:""},
  {id:"SURV-AM-359",volo:"V0359",name:"Surveillant Estrie 2",role:"SURVEILLANT",type:"SURVEILLANT",region:"ESTRIE",ville:"Ville-G",email:""},
  {id:"SURV-AB-272",volo:"V0272",name:"Surveillant Estrie 3",role:"SURVEILLANT",type:"SURVEILLANT",region:"ESTRIE",ville:"Ville-B",email:""},

  // --- CAPITALE-NATIONALE ---
  {id:"SAUV-PM-089",volo:"V0089",name:"Chef CapNat 1",role:"CHEF D'EQUIPE",type:"SAUVETEUR",region:"CAPITALE-NATIONALE",ville:"Ville-H",email:""},
  {id:"SAUV-DF-088",volo:"V0088",name:"Sauveteur CapNat 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"CAPITALE-NATIONALE",ville:"Ville-I",email:""},
  {id:"SAUV-TD-157",volo:"V0157",name:"Sauveteur CapNat 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"CAPITALE-NATIONALE",ville:"Ville-I",email:""},
  {id:"SAUV-YG-327",volo:"V0327",name:"Sauveteur CapNat 3",role:"SAUVETEUR",type:"SAUVETEUR",region:"CAPITALE-NATIONALE",ville:"Ville-J",email:""},

  // --- MAURICIE ---
  {id:"SAUV-BG-105",volo:"V0105",name:"Sauveteur Maur 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"MAURICIE",ville:"Ville-K",email:""},
  {id:"SAUV-DA-116",volo:"V0116",name:"Sauveteur Maur 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"MAURICIE",ville:"Ville-L",email:""},
  {id:"SAUV-TR-121",volo:"V0121",name:"Sauveteur Maur 3",role:"SAUVETEUR",type:"SAUVETEUR",region:"MAURICIE",ville:"Ville-M",email:""},

  // --- LANAUDIÈRE ---
  {id:"SAUV-CV-181",volo:"V0181",name:"Sauveteur Lan 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"LANAUDIÈRE",ville:"Ville-N",email:""},
  {id:"SAUV-HD-179",volo:"V0179",name:"Sauveteur Lan 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"LANAUDIÈRE",ville:"Ville-O",email:""},

  // --- MONTRÉAL ---
  {id:"SAUV-AP-183",volo:"V0183",name:"Sauveteur Mtl 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"MONTRÉAL",ville:"Ville-P",email:""},
  {id:"SAUV-NF-209",volo:"V0209",name:"Sauveteur Mtl 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"MONTRÉAL",ville:"Ville-P",email:""},

  // --- BAS-ST-LAURENT ---
  {id:"SAUV-JM-357",volo:"V0357",name:"Chef BSL 1",role:"CHEF D'EQUIPE",type:"SAUVETEUR",region:"BAS-ST-LAURENT",ville:"Ville-Q",email:""},
  {id:"SAUV-AD-389",volo:"V0389",name:"Sauveteur BSL 1",role:"SAUVETEUR",type:"SAUVETEUR",region:"BAS-ST-LAURENT",ville:"Ville-Q",email:""},
  {id:"SAUV-DR-388",volo:"V0388",name:"Sauveteur BSL 2",role:"SAUVETEUR",type:"SAUVETEUR",region:"BAS-ST-LAURENT",ville:"Ville-Q",email:""},
];
const SAUVETEURS = PERSONNEL;

// ============================================================
// NOTE: Ce stub contient seulement ~30 entrées représentatives.
// Le vrai data.js a 156 membres. Les IDs (volo) sont conservés
// pour que les lookups par VOLO ID fonctionnent en dev.
//
// En production avec Firebase :
//   1. Ce fichier n'est PAS chargé
//   2. PERSONNEL est peuplé via Firestore onAuthStateChanged
//   3. Le code utilise la même interface : PERSONNEL.find(p => p.volo === pin)
// ============================================================
