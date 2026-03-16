/**
 * VOLO SST — volo-icons.js
 * SVG Icon System — Tactic Gold V7
 * Replaces all emojis with clean gold SVG icons
 *
 * 19 data.js icon keys + 19 SST equipment types + 9 certification icons
 * Style: 24x24 viewBox, stroke #C9A84C, stroke-width 1.5, no fill
 *
 * Usage:
 *   <script src="volo-icons.js"></script>
 *   getItemIcon(item)              // returns gold SVG from item.icon key
 *   getItemIcon(item, 32)          // gold SVG at custom size
 *   getItemIcon(item, 16, true)    // colored SVG by category
 *   getItemIcon('wrench', 24)      // accepts string key directly
 *   getIconByKey('wrench')         // gold SVG by key name
 *   getIconByKey('wrench', 24, true) // colored SVG by key name
 *   getCertIcon('espace-clos')     // returns SVG for certification key
 */

// ============================================================
// SVG TEMPLATE HELPER
// ============================================================
var _S = 'xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

function _svg(paths) {
  return '<svg ' + _S + '>' + paths + '</svg>';
}


// ============================================================
// ICON_SVG — 19 data.js keys (matching actual icon field values)
// + 19 SST equipment types for keyword/category matching
// ============================================================
var ICON_SVG = {

  // -------------------------------------------------------
  // DATA.JS ICON KEYS (19 keys used in 823 items)
  // -------------------------------------------------------

  // wrench — 265 items: rappel, ancrage, descentes, sangles, outils
  wrench: _svg(
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
  ),

  // box — 209 items: caisses, kits, conteneurs
  box: _svg(
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
    '<path d="m3.3 7 8.7 5 8.7-5"/>' +
    '<path d="M12 22V12"/>'
  ),

  // backpack — 148 items: sacs, equipement portable
  backpack: _svg(
    '<path d="M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"/>' +
    '<path d="M9 8V5a3 3 0 0 1 6 0v3"/>' +
    '<path d="M8 14h8"/>' +
    '<path d="M8 18h8"/>'
  ),

  // chain — 98 items: mousquetons, connecteurs
  chain: _svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
  ),

  // knot — 43 items: protecteur corde, noeuds
  knot: _svg(
    '<path d="M4 12c0-3 2.5-5 5-5s4 1.5 3 4c-1 2.5-4 3-3 6s3 4 5 4"/>' +
    '<path d="M20 12c0 3-2.5 5-5 5s-4-1.5-3-4c1-2.5 4-3 3-6s-3-4-5-4"/>'
  ),

  // circle-blue — 34 items: prussiks, anneaux
  'circle-blue': _svg(
    '<circle cx="12" cy="12" r="9"/>' +
    '<circle cx="12" cy="12" r="4"/>'
  ),

  // coat — 29 items: vetements, harnais, combinaisons
  coat: _svg(
    '<path d="M12 2L8 6H4v4l-2 2v8h8v-4h4v4h8v-8l-2-2V6h-4L12 2z"/>' +
    '<path d="M12 2v6"/>'
  ),

  // safety-vest — 21 items: harnais sauveteur, gilets
  'safety-vest': _svg(
    '<path d="M12 3L8 7H5v5l-2 1v6h7v-3h4v3h7v-6l-2-1V7h-3L12 3z"/>' +
    '<path d="M6 10l4 2v5"/>' +
    '<path d="M18 10l-4 2v5"/>'
  ),

  // arrow-down — 17 items: nacelle, descente
  'arrow-down': _svg(
    '<path d="M12 5v14"/>' +
    '<path d="m19 12-7 7-7-7"/>'
  ),

  // lungs — 13 items: respirateur, SCBA
  lungs: _svg(
    '<path d="M12 4v8"/>' +
    '<path d="M12 12c-3 0-5 2-6 4s-2 5-1 6h4c1 0 2-1 3-3"/>' +
    '<path d="M12 12c3 0 5 2 6 4s2 5 1 6h-4c-1 0-2-1-3-3"/>' +
    '<path d="M10 2h4"/>'
  ),

  // mask — 7 items: protection respiratoire, masques
  mask: _svg(
    '<path d="M12 4C8 4 4 7 4 11v1c0 3 3 6 8 8 5-2 8-5 8-8v-1c0-4-4-7-8-7z"/>' +
    '<path d="M8 12h8"/>' +
    '<path d="M8 15h8"/>' +
    '<path d="M4 11H2"/>' +
    '<path d="M22 11h-2"/>'
  ),

  // tshirt — 6 items: vetement, uniforme
  tshirt: _svg(
    '<path d="M15.5 2H8.5L4 6l3 2v12h10V8l3-2-4.5-4z"/>' +
    '<path d="M8.5 2C9 4 10.5 5 12 5s3-1 3.5-3"/>'
  ),

  // ribbon — 4 items: ruban, sangles plates
  ribbon: _svg(
    '<path d="M12 3c-2.5 0-5 2-5 5s2.5 5 5 5 5-2 5-5-2.5-5-5-5z"/>' +
    '<path d="M8 13l-3 9 4.5-2L12 22l2.5-2L19 22l-3-9"/>'
  ),

  // boot — 2 items: crampon, bottes securite
  boot: _svg(
    '<path d="M7 21h14v-3l-4-2-1-5V4h-5v7l-1 5-4 2v3z"/>' +
    '<path d="M11 7h3"/>' +
    '<path d="M11 10h3"/>' +
    '<path d="M5 21h2"/>'
  ),

  // gear — 2 items: palan, mecanisme
  gear: _svg(
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>'
  ),

  // shield — 1 item: protection
  shield: _svg(
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
  ),

  // prohibited — 1 item: interdit, hors service
  prohibited: _svg(
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'
  ),

  // building — 1 item: construction, chantier
  building: _svg(
    '<rect x="4" y="8" width="16" height="14"/>' +
    '<path d="M2 22h20"/>' +
    '<path d="M12 2l-4 6h8L12 2z"/>' +
    '<path d="M9 12v3"/>' +
    '<path d="M15 12v3"/>' +
    '<path d="M9 18v2"/>' +
    '<path d="M15 18v2"/>'
  ),

  // biohazard — 1 item: matiere dangereuse
  biohazard: _svg(
    '<circle cx="12" cy="12" r="2"/>' +
    '<path d="M12 2a7.5 7.5 0 0 0-5 2l5 8 5-8a7.5 7.5 0 0 0-5-2z"/>' +
    '<path d="M4.5 16a7.5 7.5 0 0 0 3 4.5l2-9h-6.5a7.5 7.5 0 0 0 1.5 4.5z"/>' +
    '<path d="M19.5 16a7.5 7.5 0 0 1-3 4.5l-2-9h6.5a7.5 7.5 0 0 1-1.5 4.5z"/>'
  ),


  // -------------------------------------------------------
  // SST EQUIPMENT TYPES (19 additional — keyword/category match)
  // -------------------------------------------------------

  // rope — corde, cordage de sauvetage, rappel
  rope: _svg(
    '<path d="M4 20c2-2 4-1 6-3s2-4 4-4 4 2 6 4"/>' +
    '<path d="M4 14c2-2 4-1 6-3s2-4 4-4 4 2 6 4"/>' +
    '<path d="M4 8c2-2 4-1 6-3s2-4 4-4 4 2 6 4"/>'
  ),

  // helmet — casque de securite, hard hat
  helmet: _svg(
    '<path d="M12 2C7.58 2 4 5.58 4 10v2h16v-2c0-4.42-3.58-8-8-8z"/>' +
    '<path d="M2 14h20"/>' +
    '<path d="M4 14v2a2 2 0 0 0 2 2"/>' +
    '<path d="M20 14v2a2 2 0 0 1-2 2"/>' +
    '<path d="M9 12V8"/>' +
    '<path d="M15 12V8"/>'
  ),

  // harness — harnais integral, anti-chute
  harness: _svg(
    '<circle cx="12" cy="4" r="2"/>' +
    '<path d="M12 6v4"/>' +
    '<path d="M8 10h8"/>' +
    '<path d="M8 10l-2 6h2l2-3"/>' +
    '<path d="M16 10l2 6h-2l-2-3"/>' +
    '<path d="M10 13v9"/>' +
    '<path d="M14 13v9"/>' +
    '<path d="M8 18h8"/>'
  ),

  // bottle — bouteille air, cylindre SCBA, reservoir
  bottle: _svg(
    '<rect x="8" y="6" width="8" height="14" rx="4"/>' +
    '<path d="M10 6V4a2 2 0 0 1 4 0v2"/>' +
    '<path d="M12 2v2"/>' +
    '<path d="M10 10h4"/>' +
    '<path d="M10 14h4"/>'
  ),

  // flashlight — lampe torche, eclairage secours
  flashlight: _svg(
    '<path d="M9 2h6l2 5v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7l2-5z"/>' +
    '<rect x="8" y="11" width="8" height="8" rx="1"/>' +
    '<path d="M10 19v3"/>' +
    '<path d="M14 19v3"/>' +
    '<circle cx="12" cy="6" r="1.5"/>'
  ),

  // radio — radio communication, walkie-talkie
  radio: _svg(
    '<rect x="6" y="6" width="12" height="16" rx="2"/>' +
    '<path d="M10 2l2-0.5 2 0.5"/>' +
    '<path d="M12 2v4"/>' +
    '<circle cx="12" cy="12" r="2"/>' +
    '<path d="M9 17h6"/>' +
    '<path d="M9 19h6"/>'
  ),

  // gloves — gants de protection, gants techniques
  gloves: _svg(
    '<path d="M6 12V7a1 1 0 0 1 2 0v4"/>' +
    '<path d="M8 8V5a1 1 0 0 1 2 0v6"/>' +
    '<path d="M10 7V4a1 1 0 0 1 2 0v7"/>' +
    '<path d="M12 7V5a1 1 0 0 1 2 0v5"/>' +
    '<path d="M14 10l1.5-1a1 1 0 0 1 1.5.5v0a1 1 0 0 1-.2.8L14 14"/>' +
    '<path d="M6 12c0 0-1 2-1 4a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-3"/>'
  ),

  // boots — bottes de securite, chaussures de protection
  boots: _svg(
    '<path d="M5 22h14"/>' +
    '<path d="M7 22v-8a2 2 0 0 1 2-2h1V6a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v6h1a2 2 0 0 1 2 2v8"/>' +
    '<path d="M5 22l-1-3h3"/>' +
    '<path d="M19 22l1-3h-3"/>' +
    '<path d="M10 14h4"/>'
  ),

  // vest — gilet haute visibilite, gilet de securite
  vest: _svg(
    '<path d="M12 2L6 6v4l-3 2v8h6v-4h6v4h6v-8l-3-2V6l-6-4z"/>' +
    '<path d="M6 8l3 2v6"/>' +
    '<path d="M18 8l-3 2v6"/>' +
    '<line x1="12" y1="2" x2="12" y2="8"/>'
  ),

  // carabiner — mousqueton de securite, connecteur
  carabiner: _svg(
    '<path d="M8 4a6 6 0 0 1 8 0"/>' +
    '<path d="M16 4v10a6 6 0 0 1-12 0V7"/>' +
    '<path d="M8 4v3"/>' +
    '<line x1="16" y1="8" x2="16" y2="12"/>' +
    '<path d="M16 12l1-1.5"/>' +
    '<path d="M16 8l1 1.5"/>'
  ),

  // pulley — poulie de sauvetage, renvoi
  pulley: _svg(
    '<circle cx="12" cy="12" r="4"/>' +
    '<circle cx="12" cy="12" r="1.5"/>' +
    '<path d="M12 4v4"/>' +
    '<path d="M8 4h8"/>' +
    '<path d="M12 4V2"/>' +
    '<path d="M4 20l4-4"/>' +
    '<path d="M20 20l-4-4"/>'
  ),

  // descender — descendeur, frein de rappel, ID, rack
  descender: _svg(
    '<path d="M12 2v4"/>' +
    '<rect x="7" y="6" width="10" height="12" rx="2"/>' +
    '<circle cx="12" cy="10" r="2"/>' +
    '<path d="M10 14h4"/>' +
    '<path d="M12 18v4"/>' +
    '<path d="M9 22h6"/>'
  ),

  // tripod — trepied de sauvetage, point d'ancrage portable
  tripod: _svg(
    '<path d="M12 2v6"/>' +
    '<path d="M12 8L4 22"/>' +
    '<path d="M12 8l8 14"/>' +
    '<path d="M8 15h8"/>' +
    '<circle cx="12" cy="2" r="1"/>' +
    '<path d="M2 22l3-7"/>' +
    '<path d="M22 22l-3-7"/>'
  ),

  // stretcher — civiere, planche dorsale, panier de sauvetage
  stretcher: _svg(
    '<rect x="3" y="9" width="18" height="6" rx="1"/>' +
    '<path d="M7 9v-3"/>' +
    '<path d="M17 9v-3"/>' +
    '<path d="M7 15v3"/>' +
    '<path d="M17 15v3"/>' +
    '<path d="M1 12h3"/>' +
    '<path d="M20 12h3"/>' +
    '<path d="M10 11h4"/>' +
    '<path d="M10 13h4"/>'
  ),

  // first-aid — trousse premiers soins, kit medical
  'first-aid': _svg(
    '<rect x="3" y="7" width="18" height="13" rx="2"/>' +
    '<path d="M8 7V5a4 4 0 0 1 8 0v2"/>' +
    '<path d="M12 11v5"/>' +
    '<path d="M9.5 13.5h5"/>'
  )

};


// ============================================================
// ICON_COLORS — Category color map for colored rendering
// ============================================================
var ICON_COLORS = {
  // data.js keys
  'wrench':      '#C9A84C',  // gold — tools/rappel/ancrage
  'box':         '#E67E22',  // orange — caisses
  'backpack':    '#C9A84C',  // gold — sacs
  'chain':       '#8E8E93',  // silver — connecteurs
  'knot':        '#D4650E',  // rescue orange — cordes
  'circle-blue': '#3B82F6',  // blue — prussiks
  'coat':        '#9B59B6',  // purple — vetements
  'safety-vest': '#E65100',  // rescue — harnais
  'arrow-down':  '#3B82F6',  // blue — nacelle/descent
  'lungs':       '#27AE60',  // green — respirateur
  'mask':        '#27AE60',  // green — protection resp
  'tshirt':      '#9B59B6',  // purple — vetement
  'ribbon':      '#E74C3C',  // red — ruban
  'boot':        '#8B4513',  // brown — crampon
  'gear':        '#8E8E93',  // silver — palan
  'shield':      '#C9A84C',  // gold — shield
  'prohibited':  '#E74C3C',  // red — interdit
  'building':    '#8E8E93',  // silver — construction
  'biohazard':   '#E74C3C',  // red — danger
  // SST equipment types
  'rope':        '#D4650E',  // rescue orange
  'helmet':      '#E67E22',  // orange
  'harness':     '#E65100',  // rescue
  'bottle':      '#3B82F6',  // blue
  'flashlight':  '#F1C40F',  // yellow
  'radio':       '#8E8E93',  // silver
  'gloves':      '#8B4513',  // brown
  'boots':       '#8B4513',  // brown
  'vest':        '#E65100',  // rescue
  'carabiner':   '#8E8E93',  // silver
  'pulley':      '#C9A84C',  // gold
  'descender':   '#C9A84C',  // gold
  'tripod':      '#E67E22',  // orange
  'stretcher':   '#E74C3C',  // red
  'first-aid':   '#E74C3C'   // red
};


// ============================================================
// CERT_ICON_SVG — 9 certification icons (gold stroke)
// ============================================================
var CERT_ICON_SVG = {

  // Espace clos
  'espace-clos': _svg(
    '<circle cx="12" cy="12" r="9"/>' +
    '<ellipse cx="12" cy="12" rx="5" ry="3"/>' +
    '<path d="M12 9v6"/>'
  ),

  // Climbing / escalade
  climbing: _svg(
    '<circle cx="12" cy="4" r="2"/>' +
    '<path d="M14 8l3 4-3 2v8"/>' +
    '<path d="M10 8L7 12l3 2v8"/>' +
    '<path d="M8 14h8"/>'
  ),

  // Heart / premiers soins
  heart: _svg(
    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
  ),

  // Biohazard / matieres dangereuses (cert version)
  biohazard: _svg(
    '<circle cx="12" cy="12" r="2"/>' +
    '<path d="M12 2a7.5 7.5 0 0 0-5 2l5 8 5-8a7.5 7.5 0 0 0-5-2z"/>' +
    '<path d="M4.5 16a7.5 7.5 0 0 0 3 4.5l2-9h-6.5a7.5 7.5 0 0 0 1.5 4.5z"/>' +
    '<path d="M19.5 16a7.5 7.5 0 0 1-3 4.5l-2-9h6.5a7.5 7.5 0 0 1-1.5 4.5z"/>'
  ),

  // Lock / cadenassage
  lock: _svg(
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
    '<circle cx="12" cy="16" r="1"/>'
  ),

  // Mask / protection respiratoire (cert version)
  mask: _svg(
    '<path d="M12 4C8 4 4 7 4 11v1c0 3 3 6 8 8 5-2 8-5 8-8v-1c0-4-4-7-8-7z"/>' +
    '<path d="M8 12h8"/>' +
    '<path d="M8 15h8"/>' +
    '<path d="M4 11H2"/>' +
    '<path d="M22 11h-2"/>'
  ),

  // Building / travail en hauteur (cert version)
  building: _svg(
    '<rect x="4" y="8" width="16" height="14"/>' +
    '<path d="M2 22h20"/>' +
    '<path d="M12 2l-4 6h8L12 2z"/>' +
    '<path d="M9 12v3"/>' +
    '<path d="M15 12v3"/>' +
    '<path d="M9 18v2"/>' +
    '<path d="M15 18v2"/>'
  ),

  // Arrow up / travail en hauteur avance
  'arrow-up': _svg(
    '<path d="M12 19V5"/>' +
    '<path d="m5 12 7-7 7 7"/>'
  ),

  // Factory / sauvetage industriel
  factory: _svg(
    '<path d="M2 22h20"/>' +
    '<path d="M2 22V8l5 4V8l5 4V4h4v18"/>' +
    '<path d="M20 22V10l-4 4"/>' +
    '<rect x="10" y="16" width="4" height="6"/>'
  )
};


// ============================================================
// EMOJI_TO_KEY — Map emoji characters to ICON_SVG keys
// (kept for backward compat if any emoji references remain)
// ============================================================
var EMOJI_TO_KEY = {
  '\u{1F527}': 'wrench',
  '\u{1F4E6}': 'box',
  '\u{1F392}': 'backpack',
  '\u{1F517}': 'chain',
  '\u{1FAA2}': 'knot',
  '\u{1F535}': 'circle-blue',
  '\u{1F9E5}': 'coat',
  '\u{1F9BA}': 'safety-vest',
  '\u2B07\uFE0F': 'arrow-down',
  '\u2B07': 'arrow-down',
  '\u{1FAC1}': 'lungs',
  '\u{1F637}': 'mask',
  '\u{1F455}': 'tshirt',
  '\u{1F397}\uFE0F': 'ribbon',
  '\u{1F397}': 'ribbon',
  '\u{1F97E}': 'boot',
  '\u2699\uFE0F': 'gear',
  '\u2699': 'gear',
  '\u{1F6E1}\uFE0F': 'shield',
  '\u{1F6E1}': 'shield',
  '\u{1F6AB}': 'prohibited',
  '\u{1F3D7}\uFE0F': 'building',
  '\u{1F3D7}': 'building',
  '\u2622\uFE0F': 'biohazard',
  '\u2622': 'biohazard'
};


// ============================================================
// CERT_EMOJI_TO_KEY — Map cert emoji characters to CERT_ICON_SVG keys
// ============================================================
var CERT_EMOJI_TO_KEY = {
  '\u{1F573}\uFE0F': 'espace-clos',
  '\u{1F573}': 'espace-clos',
  '\u{1F9D7}': 'climbing',
  '\u2764\uFE0F': 'heart',
  '\u2764': 'heart',
  '\u2623\uFE0F': 'biohazard',
  '\u2623': 'biohazard',
  '\u{1F512}': 'lock',
  '\u{1F637}': 'mask',
  '\u{1F3D7}\uFE0F': 'building',
  '\u{1F3D7}': 'building',
  '\u2B06\uFE0F': 'arrow-up',
  '\u2B06': 'arrow-up',
  '\u{1F3ED}': 'factory'
};


// ============================================================
// KEYWORD_TO_ICON — Smart keyword matching for item names/categories
// Used by getItemIcon when icon field does not match a known key
// ============================================================
var KEYWORD_TO_ICON = [
  // Order matters: first match wins. More specific patterns first.
  { re: /civiere|stretcher|panier|planche dorsale/i, key: 'stretcher' },
  { re: /trepied|tripod|tripode/i, key: 'tripod' },
  { re: /premiers soins|first.?aid|trousse.*med/i, key: 'first-aid' },
  { re: /descendeur|descend|i.?d\b|rack.*frein/i, key: 'descender' },
  { re: /poulie|pulley|renvoi/i, key: 'pulley' },
  { re: /mousqueton|carabiner|mousketon/i, key: 'carabiner' },
  { re: /harnais|harness|anti.?chute/i, key: 'harness' },
  { re: /casque|helmet|hard.?hat/i, key: 'helmet' },
  { re: /corde|cordage|rope|rappel/i, key: 'rope' },
  { re: /bouteille|bottle|cylindre|scba|reservoir.*air/i, key: 'bottle' },
  { re: /lampe|flashlight|eclairage|torche/i, key: 'flashlight' },
  { re: /radio|walkie|talkie|communication/i, key: 'radio' },
  { re: /gant|glove/i, key: 'gloves' },
  { re: /botte|boots|chaussure|crampon/i, key: 'boots' },
  { re: /gilet|vest|haute.?visib/i, key: 'vest' },
  { re: /masque|mask|respir/i, key: 'mask' },
  { re: /sangle|sling|strap/i, key: 'ribbon' },
  { re: /palan|winch|treuil/i, key: 'gear' },
  { re: /sac\b|backpack|bag/i, key: 'backpack' },
  { re: /caisse|box|kit|conteneur/i, key: 'box' }
];


// ============================================================
// getItemIcon(item, size, colored) — Get SVG icon from item object or key
// ============================================================
/**
 * Returns an inline SVG string for the given item's icon.
 * Resolution order:
 *   1. Direct key match on item.icon
 *   2. Emoji-to-key lookup on item.icon
 *   3. Keyword match on item.name
 *   4. Keyword match on item.cat
 *   5. Fallback to 'box'
 *
 * @param {Object|string} item - Item object with .icon/.name/.cat, or string key
 * @param {number} [size=20] - Desired icon size in pixels
 * @param {boolean} [colored=false] - Use category-specific colors instead of gold
 * @returns {string} SVG markup string
 */
function getItemIcon(item, size, colored) {
  size = size || 20;
  var key;

  if (typeof item === 'string') {
    key = item;
  } else if (item) {
    // 1. Direct key match
    if (item.icon && ICON_SVG[item.icon]) {
      key = item.icon;
    }
    // 2. Emoji-to-key
    else if (item.icon && EMOJI_TO_KEY[item.icon]) {
      key = EMOJI_TO_KEY[item.icon];
    }
    // 3. Keyword match on name
    else if (item.name) {
      for (var i = 0; i < KEYWORD_TO_ICON.length; i++) {
        if (KEYWORD_TO_ICON[i].re.test(item.name)) {
          key = KEYWORD_TO_ICON[i].key;
          break;
        }
      }
    }
    // 4. Keyword match on cat
    if (!key && item.cat) {
      for (var j = 0; j < KEYWORD_TO_ICON.length; j++) {
        if (KEYWORD_TO_ICON[j].re.test(item.cat)) {
          key = KEYWORD_TO_ICON[j].key;
          break;
        }
      }
    }
  }

  key = key || 'box';
  var svg = ICON_SVG[key] || ICON_SVG['box'];

  // Resize if needed
  if (size !== 20) {
    svg = svg
      .replace(/width="20"/g, 'width="' + size + '"')
      .replace(/height="20"/g, 'height="' + size + '"');
  }

  // Apply category color if requested
  if (colored) {
    var color = ICON_COLORS[key] || '#C9A84C';
    svg = svg.replace(/stroke="#C9A84C"/g, 'stroke="' + color + '"');
  }

  return svg;
}


// ============================================================
// getIconByKey(key, size, colored) — Get SVG icon by key name
// ============================================================
/**
 * Returns an inline SVG string for the given icon key.
 * Checks ICON_SVG first, then CERT_ICON_SVG, then fallback to 'box'.
 *
 * @param {string} key - Icon key name (e.g. 'wrench', 'helmet', 'rope')
 * @param {number} [size=20] - Desired icon size in pixels
 * @param {boolean} [colored=false] - Use category-specific colors
 * @returns {string} SVG markup string
 */
function getIconByKey(key, size, colored) {
  size = size || 20;
  var svg = ICON_SVG[key] || CERT_ICON_SVG[key] || ICON_SVG['box'];

  if (size !== 20) {
    svg = svg
      .replace(/width="20"/g, 'width="' + size + '"')
      .replace(/height="20"/g, 'height="' + size + '"');
  }

  if (colored) {
    var color = ICON_COLORS[key] || '#C9A84C';
    svg = svg.replace(/stroke="#C9A84C"/g, 'stroke="' + color + '"');
  }

  return svg;
}


// ============================================================
// getCertIcon(emoji, size) — Get cert SVG icon from emoji or key
// ============================================================
/**
 * Returns an inline SVG string for a certification emoji or key.
 * Falls back to shield icon if not found.
 *
 * @param {string} emoji - Certification emoji character or key name
 * @param {number} [size=20] - Desired icon size in pixels
 * @returns {string} SVG markup string
 */
function getCertIcon(emoji, size) {
  size = size || 20;
  var key = CERT_EMOJI_TO_KEY[emoji] || (CERT_ICON_SVG[emoji] ? emoji : 'shield');
  var svg = CERT_ICON_SVG[key] || ICON_SVG['shield'];

  if (size !== 20) {
    svg = svg
      .replace(/width="20"/g, 'width="' + size + '"')
      .replace(/height="20"/g, 'height="' + size + '"');
  }

  return svg;
}


// ============================================================
// getAllIconKeys() — List all available icon keys
// ============================================================
function getAllIconKeys() {
  var keys = [];
  for (var k in ICON_SVG) {
    if (ICON_SVG.hasOwnProperty(k)) keys.push(k);
  }
  return keys;
}


// ============================================================
// Expose everything on window scope
// ============================================================
window.ICON_SVG = ICON_SVG;
window.ICON_COLORS = ICON_COLORS;
window.CERT_ICON_SVG = CERT_ICON_SVG;
window.EMOJI_TO_KEY = EMOJI_TO_KEY;
window.CERT_EMOJI_TO_KEY = CERT_EMOJI_TO_KEY;
window.KEYWORD_TO_ICON = KEYWORD_TO_ICON;
window.getItemIcon = getItemIcon;
window.getIconByKey = getIconByKey;
window.getCertIcon = getCertIcon;
window.getAllIconKeys = getAllIconKeys;
