/* ═══════════════════════════════════════════════════════════════════════════
   Résilience — D.M.P
   Coquille d'application : routage par ancre, lecteur unique persistant,
   sections repliables. Aucun reseau, aucune base : tout vient de data.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var P = window.PISTES || [];
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var ICONE = 'icon-512.png';

function el(tag, cls, txt) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function ic(nom, taille) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ic ic-' + (taille || 20));
  s.setAttribute('aria-hidden', 'true');
  var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#ic-' + nom);
  s.appendChild(u);
  return s;
}
function mmss(s) {
  if (!isFinite(s) || s < 0) return '--:--';
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function piste(num) {
  for (var i = 0; i < P.length; i++) if (P[i].num === num) return P[i];
  return null;
}

/* ═══════════════════════════ MEMOIRE LOCALE ═══════════════════════════ */
/* Aucune base : un seul objet dans localStorage. On rend a D.M.P le titre, la
   source, la position et les sections qu'il avait repliees. En navigation
   privee l'ecriture leve une exception : tout est enveloppe. */
var CLE = 'resilience.etat';
var memoire = (function () {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; }
  catch (e) { return {}; }
})();
if (!memoire.replis) memoire.replis = {};

/* Limitation de debit, PAS anti-rebond : timeupdate se declenche toutes les
   250 ms, donc un anti-rebond de 400 ms se rearmait sans fin et n'ecrivait
   jamais tant que l'audio jouait. */
var derniereEcriture = 0;
function ecrire() {
  derniereEcriture = performance.now();
  try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (e) {}
}
function retenir(force) {
  if (force || performance.now() - derniereEcriture > 2000) ecrire();
}
/* points de vidage : on n'attend jamais le prochain intervalle pour ces cas */
['pause', 'ended'].forEach(function (ev) {
  window.addEventListener('resilience:' + ev, function () { retenir(true); });
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') retenir(true);
});
window.addEventListener('pagehide', function () { retenir(true); });

/* ═══════════════════════════ LECTEUR ═══════════════════════════ */
var A = new Audio();
A.preload = 'metadata';
var lect = { num: null, src: 'maquette', joue: false };

var mini = $('#mini'), miniJauge = $('#mini-jauge'), miniNum = $('#mini-num'),
    miniBarre = $('#mini-barre'), miniPoi = $('#mini-poi'),
    miniTitre = $('#mini-titre'), miniSource = $('#mini-source'), miniPP = $('#mini-pp');
var feuille = $('#feuille'), scrim = $('#scrim'),
    flNum = $('#fl-num'), flTitre = $('#fl-titre'), flFeat = $('#fl-feat'),
    flBarre = $('#fl-barre'), flRemp = $('#fl-remplissage'), flPoi = $('#fl-poignee'),
    flT1 = $('#fl-t1'), flT2 = $('#fl-t2'), flPP = $('#fl-pp'),
    flBascule = $('#fl-bascule');

/* Les sources disponibles varient : maquette et instrumental aujourd'hui, version
   studio quand elle existera. La bascule se construit donc a partir de la piste,
   et disparait s'il n'y a qu'une seule source. */
var SOURCES = [
  { cle: 'maquette', nom: 'Maquette',     icone: 'micro'  },
  { cle: 'instru',   nom: 'Instrumental', icone: 'note'   },
  { cle: 'studio',   nom: 'Studio',       icone: 'studio' }
];

function majBascule(p, actif) {
  var dispo = SOURCES.filter(function (s) { return p[s.cle]; });
  flBascule.textContent = '';
  flBascule.hidden = dispo.length < 2;
  // a trois sources, les libelles seuls suffisent : avec les icones ca deborde
  // sur un ecran de 320 px
  flBascule.classList.toggle('serre', dispo.length >= 3);
  if (flBascule.hidden) return;
  dispo.forEach(function (s) {
    var b = el('button', 'fb' + (s.cle === actif ? ' on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s.cle === actif));
    b.appendChild(ic(s.icone, 18));
    b.appendChild(el('span', null, s.nom));
    b.addEventListener('click', function () {
      if (lect.num) charger(lect.num, s.cle, lect.joue);
    });
    flBascule.appendChild(b);
  });
}

function iconePP(bouton, enLecture) {
  var u = bouton.querySelector('use');
  if (u) u.setAttribute('href', enLecture ? '#ic-pause' : '#ic-play');
  bouton.setAttribute('aria-label', enLecture ? 'Pause' : 'Lecture');
}

function majBoutonsSource() {
  $$('.srcb').forEach(function (b) {
    var actif = lect.joue && b.dataset.num === lect.num && b.dataset.src === lect.src;
    b.classList.toggle('joue', actif);
    var pp = b.querySelector('use');
    if (pp) pp.setAttribute('href', actif ? '#ic-pause' : '#ic-play');
  });
}

function majEtatLecture() {
  iconePP(miniPP, lect.joue);
  iconePP(flPP, lect.joue);
  majBoutonsSource();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = lect.joue ? 'playing' : 'paused';
  }
}

function majMedia(p) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: p.titre,
      artist: lect.src === 'instru' ? 'Instrumental — D.M.P'
            : lect.src === 'studio' ? 'D.M.P — version studio' : 'D.M.P',
      album: 'Résilience',
      artwork: [{ src: ICONE, sizes: '512x512', type: 'image/png' }]
    });
  } catch (e) { /* MediaMetadata absent : sans consequence */ }
}

function charger(num, src, lancer) {
  var p = piste(num);
  if (!p || !p[src]) return;
  var changePiste = lect.num !== num;
  var changeSource = lect.src !== src;
  // Maquette et instrumental d'un meme titre ont exactement le meme montage :
  // on garde la position en changeant de source, sinon on perd son passage.
  var reprise = (!changePiste && changeSource) ? A.currentTime : 0;
  lect.num = num; lect.src = src;
  if (changePiste || changeSource) {
    A.src = p[src];
    if (reprise > 0) {
      A.addEventListener('loadedmetadata', function pose() {
        A.removeEventListener('loadedmetadata', pose);
        if (isFinite(A.duration)) A.currentTime = Math.min(reprise, A.duration - 0.05);
      });
    } else {
      A.currentTime = 0; placer(0);
    }
  }

  mini.hidden = false;
  document.body.classList.add('a-mini');
  miniNum.textContent = num;
  miniTitre.textContent = p.titre;
  miniSource.textContent = src === 'instru' ? 'Instrumental'
                         : src === 'studio' ? 'Version studio' : 'Maquette';
  flNum.textContent = num;
  flTitre.textContent = p.titre;
  flFeat.textContent = p.feat ? 'avec ' + p.feat : 'D.M.P';
  majBascule(p, src);
  majModeTravail();
  flT2.textContent = mmss(A.duration);
  majMedia(p);
  if (lancer) jouer();
  else majEtatLecture();
}

function jouer() {
  var pr = A.play();
  if (pr && pr.catch) pr.catch(function () { lect.joue = false; majEtatLecture(); });
}
function bascule() {
  if (!lect.num) return;
  if (A.paused) jouer(); else A.pause();
}

A.addEventListener('play', function () { lect.joue = true; majEtatLecture(); });
A.addEventListener('timeupdate', function () {
  if (!lect.num) return;
  memoire.num = lect.num; memoire.src = lect.src; memoire.t = A.currentTime;
  retenir();
});
A.addEventListener('pause', function () {
  lect.joue = false; majEtatLecture();
  window.dispatchEvent(new Event('resilience:pause'));
});
A.addEventListener('ended', function () { lect.joue = false; placer(0); majEtatLecture(); });
A.addEventListener('loadedmetadata', function () { flT2.textContent = mmss(A.duration); });
A.addEventListener('timeupdate', function () { if (!tire) placer(A.currentTime / A.duration || 0); });

function placer(f) {
  f = Math.min(1, Math.max(0, f || 0));
  var pc = (f * 100).toFixed(3) + '%';
  miniJauge.style.width = pc;
  miniPoi.style.left = pc;
  miniBarre.setAttribute('aria-valuenow', Math.round(f * 100));
  miniBarre.setAttribute('aria-valuetext', mmss(f * (A.duration || 0)) +
    (isFinite(A.duration) ? ' sur ' + mmss(A.duration) : ''));
  flRemp.style.right = (100 - f * 100).toFixed(3) + '%';
  flPoi.style.left = pc;
  flT1.textContent = mmss(f * (A.duration || 0));
  flBarre.setAttribute('aria-valuenow', Math.round(f * 100));
  // un lecteur d'ecran annoncait « 34 » : on lui donne le temps reel
  flBarre.setAttribute('aria-valuetext', mmss(f * (A.duration || 0)) +
    (isFinite(A.duration) ? ' sur ' + mmss(A.duration) : ''));
}

/* barre de lecture : glissement au doigt, a la souris et au clavier */
var tire = false;
function fraction(ev) {
  var r = flBarre.getBoundingClientRect();
  return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
}
flBarre.addEventListener('pointerdown', function (ev) {
  if (!isFinite(A.duration)) return;
  tire = true; flBarre.classList.add('tire');
  flBarre.setPointerCapture(ev.pointerId);
  placer(fraction(ev)); ev.preventDefault();
});
flBarre.addEventListener('pointermove', function (ev) { if (tire) placer(fraction(ev)); });
function lacher(ev) {
  if (!tire) return;
  tire = false; flBarre.classList.remove('tire');
  A.currentTime = fraction(ev) * A.duration;
}
flBarre.addEventListener('pointerup', lacher);
flBarre.addEventListener('pointercancel', function () { tire = false; flBarre.classList.remove('tire'); });
flBarre.addEventListener('keydown', function (ev) {
  if (!isFinite(A.duration)) return;
  var d = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -15, ArrowUp: 15 }[ev.key];
  if (d === undefined) return;
  A.currentTime = Math.min(A.duration, Math.max(0, A.currentTime + d));
  ev.preventDefault();
});

miniPP.addEventListener('click', bascule);
$('#mini-recul').addEventListener('click', function () { deplacer(-1); });
$('#mini-avance').addEventListener('click', function () { deplacer(1); });

/* Se placer dans le morceau sans ouvrir la feuille : c'est ce qui fait passer
   « reculer sur un passage » de quatre tapes a une seule. */
var tireMini = false;
function fractionMini(ev) {
  var r = miniBarre.getBoundingClientRect();
  return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
}
miniBarre.addEventListener('pointerdown', function (ev) {
  if (!isFinite(A.duration)) return;
  tireMini = true; miniBarre.classList.add('tire');
  miniBarre.setPointerCapture(ev.pointerId);
  placer(fractionMini(ev)); ev.preventDefault(); ev.stopPropagation();
});
miniBarre.addEventListener('pointermove', function (ev) {
  if (tireMini) { placer(fractionMini(ev)); ev.preventDefault(); }
});
miniBarre.addEventListener('pointerup', function (ev) {
  if (!tireMini) return;
  tireMini = false; miniBarre.classList.remove('tire');
  A.currentTime = fractionMini(ev) * A.duration;
});
miniBarre.addEventListener('pointercancel', function () {
  tireMini = false; miniBarre.classList.remove('tire');
});
miniBarre.addEventListener('keydown', function (ev) {
  if (!isFinite(A.duration)) return;
  var d = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -15, ArrowUp: 15 }[ev.key];
  if (d === undefined) return;
  A.currentTime = Math.min(A.duration, Math.max(0, A.currentTime + d));
  ev.preventDefault();
});
flPP.addEventListener('click', bascule);
/* 15 s valaient 6 a 10 mesures selon le tempo — un couplet entier. On recule
   de quatre mesures, calculees depuis le BPM reel de la piste. */
var MESURES_SAUT = 4;          // un groupe de quatre barres, l'unite du rappeur
function dureeMesures(n) {
  var p = piste(lect.num);
  if (!p || !p.bpm) return n * 2;          // repli prudent sans tempo connu
  return (60 / p.bpm) * 4 * n;             // 4 temps = 1 mesure
}
function deplacer(sens) {
  if (!isFinite(A.duration)) return;
  var d = dureeMesures(MESURES_SAUT) * sens;
  A.currentTime = Math.min(A.duration, Math.max(0, A.currentTime + d));
}
$('#fl-recul').addEventListener('click', function () { deplacer(-1); });
$('#fl-avance').addEventListener('click', function () { deplacer(1); });
/* Repeter et ralentir. preservesPitch garde la hauteur du chant : sans lui,
   ralentir descend la voix et le repere melodique est fausse. */
var boucle = $('#fl-boucle');
boucle.addEventListener('click', function () {
  A.loop = !A.loop;
  boucle.setAttribute('aria-pressed', String(A.loop));
});
$$('.fv').forEach(function (b) {
  b.addEventListener('click', function () {
    var v = parseFloat(b.dataset.vit);
    A.preservesPitch = true;
    A.mozPreservesPitch = true;
    A.webkitPreservesPitch = true;
    A.playbackRate = v;
    $$('.fv').forEach(function (x) { x.classList.toggle('on', x === b); });
  });
});

if ('mediaSession' in navigator) {
  var ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', jouer);
    ms.setActionHandler('pause', function () { A.pause(); });
    ms.setActionHandler('seekbackward', function () { A.currentTime = Math.max(0, A.currentTime - 15); });
    ms.setActionHandler('seekforward', function () {
      if (isFinite(A.duration)) A.currentTime = Math.min(A.duration, A.currentTime + 15);
    });
    ms.setActionHandler('seekto', function (d) {
      if (d.seekTime != null) A.currentTime = d.seekTime;
    });
  } catch (e) { /* certains gestionnaires non supportes */ }
}

/* ═══════════════════════════ FEUILLE ═══════════════════════════ */
var feuilleOuverte = false;
var yGele = 0, declencheur = null;
function ouvrirFeuille() {
  if (feuilleOuverte || !lect.num) return;
  feuilleOuverte = true;
  declencheur = document.activeElement;
  yGele = window.scrollY;
  scrim.hidden = false; feuille.hidden = false;
  scrim.classList.remove('sort'); feuille.classList.remove('sort');
  document.body.style.top = (-yGele) + 'px';
  document.body.classList.add('fige');
  $('#vues').setAttribute('inert', '');
  flPP.focus({ preventScroll: true });
}
function fermerFeuille() {
  if (!feuilleOuverte) return;
  feuilleOuverte = false;
  feuille.classList.add('sort'); scrim.classList.add('sort');
  document.body.classList.remove('fige');
  document.body.style.top = '';
  $('#vues').removeAttribute('inert');
  window.scrollTo(0, yGele);                 // on rend la position exacte
  if (declencheur && declencheur.focus) declencheur.focus({ preventScroll: true });
  setTimeout(function () {
    if (!feuilleOuverte) { feuille.hidden = true; scrim.hidden = true; }
  }, 220);
}
$('#mini-ouvre').addEventListener('click', ouvrirFeuille);
$('#feuille-ferme').addEventListener('click', fermerFeuille);
scrim.addEventListener('click', fermerFeuille);
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && feuilleOuverte) fermerFeuille();
});
$('#fl-vers').addEventListener('click', function () {
  var n = lect.num;
  if (!n) return;
  fermerFeuille();
  // si le hash est deja celui de la piste, aucun hashchange n'est emis : le
  // bouton ne faisait alors rien du tout
  if (location.hash === '#t' + n) versParoles();
  else { attendreParoles = true; location.hash = '#t' + n; }
});

var attendreParoles = false;
function versParoles() {
  var cible = document.querySelector('.paroles .par-sec') || document.querySelector('.paroles');
  if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* glissement vers le bas pour refermer — un bouton reste toujours disponible */
(function () {
  var y0 = null, dy = 0;
  feuille.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest('.fl-barre,.fc,.fb,.fl-vers')) return;
    y0 = ev.clientY; dy = 0;
  });
  feuille.addEventListener('pointermove', function (ev) {
    if (y0 === null) return;
    dy = Math.max(0, ev.clientY - y0);
    if (dy > 4) feuille.style.transform = 'translate3d(0,' + dy + 'px,0)';
  });
  function fin() {
    if (y0 === null) return;
    feuille.style.transform = '';
    if (dy > 90) fermerFeuille();
    y0 = null;
  }
  feuille.addEventListener('pointerup', fin);
  feuille.addEventListener('pointercancel', fin);
})();

/* ═══════════════════════════ RENDU : ALBUM ═══════════════════════════ */
function rendreAlbum() {
  var prets = P.filter(function (p) { return p.pret; });
  $('#prog-n').textContent = prets.length;
  var c = 2 * Math.PI * 52;
  requestAnimationFrame(function () {
    $('#anneau').style.strokeDashoffset = String(c - c * (prets.length / 10));
  });
  $('#prog-d').textContent = prets.length
    ? 'Texte final, instrumental final et maquette à écouter.'
    : 'Aucun titre n’est encore complet.';

  var ol = $('#lst-pistes');
  ol.textContent = '';
  P.forEach(function (p) {
    var li = el('li');
    var a = el('a', 'pl' + (p.pret ? ' pret' : ''));
    a.href = '#t' + p.num;
    a.appendChild(el('span', 'pl-n anton', p.num));
    var c2 = el('span', 'pl-c');
    c2.appendChild(el('b', null, p.titre));
    // Les huit lignes en chantier affichaient toutes « <bpm> BPM vise » : rien ne
    // les distinguait. On montre ce qui bloque reellement. Le BPM reste dans la
    // fiche technique du titre.
    var sous;
    if (p.pret) {
      sous = (p.feat ? 'avec ' + p.feat + ' · ' : '') + p.bpm + ' BPM · ' + p.duree;
    } else if (p.alerte) {
      sous = p.alerte;
    } else {
      sous = 'Texte, instru et maquette à faire';
    }
    c2.appendChild(el('s', null, sous));
    a.appendChild(c2);
    var e = el('span', 'pl-e');
    e.appendChild(el('span', 'pastille'));
    var f = ic('suivant', 20); f.classList.add('pl-fl');
    e.appendChild(f);
    a.appendChild(e);
    li.appendChild(a);
    ol.appendChild(li);
  });
}

/* ═══════════════════════════ RENDU : APPRENDRE ═══════════════════════════ */
function groupe(titre, sousTitre) {
  var g = el('section', 'grp');
  var t = el('div', 'grp-t');
  t.appendChild(el('span', null, titre));
  t.appendChild(el('i'));
  g.appendChild(t);
  if (sousTitre) g.appendChild(el('p', 'grp-p', sousTitre));
  return g;
}

function rendreApprendre() {
  var box = $('#lst-apprendre');
  box.textContent = '';
  var avec = P.filter(function (p) { return p.maquette; });
  var sans = P.filter(function (p) { return !p.maquette; });

  if (avec.length) {
    var g1 = groupe('Avec la maquette');
    avec.forEach(function (p) {
      var b = el('button', 'ec'); b.type = 'button';
      var r = el('span', 'ec-b'); r.appendChild(ic('play', 22)); b.appendChild(r);
      var c = el('span', 'ec-c');
      c.appendChild(el('b', null, p.titre));
      var info = ['Maquette'];
      if (p.feat) info.push('avec ' + p.feat);
      info.push(p.duree);
      c.appendChild(el('s', null, info.join(' · ')));
      b.appendChild(c);
      // on ouvre le texte et on lance : plus de modale intermediaire
      b.addEventListener('click', function () {
        charger(p.num, 'maquette', true);
        location.hash = '#t' + p.num;
      });
      g1.appendChild(b);
    });
    box.appendChild(g1);
  }

  if (sans.length) {
    var g2 = groupe('Texte seul — ' + sans.length + ' titres',
      'Pas encore de maquette. Le texte est là, mais il sera réécrit : ne l’apprends pas.');
    sans.forEach(function (p) {
      var a = el('a', 'tx'); a.href = '#t' + p.num;
      a.appendChild(el('span', 'tx-n anton', p.num));
      var c = el('span', 'tx-c');
      c.appendChild(el('b', null, p.titre));
      c.appendChild(el('s', null, p.nbVers + ' vers · version de travail'));
      a.appendChild(c);
      a.appendChild(ic('suivant', 18));
      g2.appendChild(a);
    });
    box.appendChild(g2);
  }
}

/* ═══════════════════════════ RENDU : STUDIO ═══════════════════════════ */
function rendreStudio() {
  var box = $('#lst-studio');
  box.textContent = '';
  var faits = P.filter(function (p) { return p.studio; });
  if (!faits.length) {
    // Etat vide utile : on dit ou on en est et ce qui declenchera l'arrivee ici.
    var v = el('div', 'vide');
    v.appendChild(ic('studio', 26));
    v.appendChild(el('p', 'vide-t', 'Rien d’enregistré pour l’instant.'));
    v.appendChild(el('p', null,
      'Les prises studio apparaîtront ici au fur et à mesure, une fois mixées. ' +
      'En attendant, les maquettes de l’onglet Apprendre servent à préparer la cabine.'));
    var a = el('a', 'vide-a'); a.href = '#apprendre';
    a.appendChild(el('span', null, 'Aller aux maquettes'));
    a.appendChild(ic('suivant', 18));
    v.appendChild(a);
    box.appendChild(v);
    return;
  }
  faits.forEach(function (p) {
    var b = el('button', 'ec'); b.type = 'button';
    var r = el('span', 'ec-b'); r.appendChild(ic('play', 22)); b.appendChild(r);
    var c = el('span', 'ec-c');
    c.appendChild(el('b', null, p.titre));
    var info = ['Version studio'];
    if (p.feat) info.push('avec ' + p.feat);
    if (p.studioDuree) info.push(p.studioDuree);
    c.appendChild(el('s', null, info.join(' · ')));
    b.appendChild(c);
    b.addEventListener('click', function () { charger(p.num, 'studio', true); ouvrirFeuille(); });
    box.appendChild(b);
  });
}

/* ═══════════════════════════ RENDU : GUIDE ═══════════════════════════ */
var GUIDE = [
  ['Maquette', 'La version d’essai du morceau, chantée par une voix générée. Elle sert à <b>apprendre</b> la mélodie, le placement des phrases et le découpage en mesures — pas à imiter la voix ni l’accent.'],
  ['Instrumental', 'Le beat seul, sans voix. C’est dessus qu’on enregistre en studio.'],
  ['Référence', 'Le morceau existant qui a servi de modèle — pour le tempo, l’ambiance et la construction. On ne le copie pas, on s’en sert de repère.'],
  ['BPM', 'Battements par minute : la vitesse du morceau. Plus le chiffre est haut, plus c’est rapide.'],
  ['Tonalité', 'La note autour de laquelle le morceau est construit. C’est elle qui décide si le chant tombe dans une zone confortable pour la voix.'],
  ['Mesure', 'L’unité de découpage du morceau — quatre temps. On compte en mesures pour placer chaque phrase exactement au bon endroit.'],
  ['Version de travail', 'Un texte encore provisoire. <b>À ne pas apprendre</b> : il sera réécrit avant l’enregistrement.'],
  ['Prêt pour la cabine', 'Texte final, instrumental final, maquette disponible. Le morceau peut être enregistré.']
];
function rendreGuide() {
  var box = $('#lst-guide');
  if (box.dataset.fait) return;
  box.dataset.fait = '1';
  var dl = el('dl');
  GUIDE.forEach(function (g) {
    var d = el('div', 'gl');
    d.appendChild(el('dt', null, g[0]));
    var dd = el('dd'); dd.innerHTML = g[1];
    d.appendChild(dd);
    dl.appendChild(d);
  });
  box.appendChild(dl);
}

/* ═══════════════════════════ RENDU : PISTE ═══════════════════════════ */
function repliable(titre, icone, compte, ouvert, remplir) {
  var b = el('div', 'bloc');
  b.dataset.ouvert = ouvert ? '1' : '0';
  var t = el('button', 'bloc-t'); t.type = 'button';
  t.setAttribute('aria-expanded', String(!!ouvert));
  t.appendChild(ic(icone, 18));
  t.appendChild(el('b', null, titre));
  if (compte) t.appendChild(el('span', 'cpt', compte));
  var chv = ic('chevron', 20); chv.classList.add('chv');
  t.appendChild(chv);
  var c = el('div', 'bloc-c'), inner = el('div'), pad = el('div', 'bloc-i');
  remplir(pad);
  inner.appendChild(pad); c.appendChild(inner);
  t.addEventListener('click', function () {
    var o = b.dataset.ouvert === '1';
    b.dataset.ouvert = o ? '0' : '1';
    t.setAttribute('aria-expanded', String(!o));
  });
  b.appendChild(t); b.appendChild(c);
  return b;
}

function rendrePiste(num) {
  var p = piste(num);
  if (!p) { location.hash = '#album'; return; }
  $('#tete-titre').textContent = p.titre;
  $('#tete-num').textContent = num + ' / 10';

  var box = $('#piste-corps');
  box.textContent = '';

  /* identite */
  var pi = el('div', 'pi' + (p.pret ? ' pret' : ''));
  pi.appendChild(el('span', 'pi-g anton', num));
  pi.appendChild(el('p', 'pi-k', 'Titre ' + num));
  pi.appendChild(el('h1', null, p.titre));
  if (p.feat) pi.appendChild(el('span', 'pi-f', 'avec ' + p.feat));
  var et = el('span', 'etat ' + (p.pret ? 'pret' : 'chantier'));
  et.appendChild(ic(p.pret ? 'check' : 'chantier', 18));
  et.appendChild(el('span', null, p.pret ? 'Prêt pour la cabine' : 'En chantier'));
  pi.appendChild(et);
  box.appendChild(pi);

  /* sources audio ou avertissement */
  if (p.pret) {
    var s = el('div', 'src');
    [['maquette', 'Maquette', 'À apprendre · ' + p.duree, true, 'micro'],
     ['instru', 'Instrumental', 'Le beat seul', false, 'note']].forEach(function (x) {
      if (!p[x[0]]) return;
      var b = el('button', 'srcb' + (x[3] ? ' fort' : ''));
      b.type = 'button'; b.dataset.num = num; b.dataset.src = x[0];
      var r = el('span', 'srcb-i'); r.appendChild(ic('play', 18)); b.appendChild(r);
      var c = el('span', 'srcb-c');
      c.appendChild(el('b', null, x[1]));
      c.appendChild(el('s', null, x[2]));
      b.appendChild(c);
      var eq = el('span', 'eq');
      eq.appendChild(el('i')); eq.appendChild(el('i')); eq.appendChild(el('i'));
      b.appendChild(eq);
      b.addEventListener('click', function () {
        if (lect.num === num && lect.src === x[0]) bascule();
        else charger(num, x[0], true);
      });
      s.appendChild(b);
    });
    box.appendChild(s);
  } else {
    var av = el('div', 'avert');
    av.appendChild(ic('chantier', 20));
    var d2 = el('div');
    d2.appendChild(el('b', null, 'Version de travail'));
    d2.appendChild(el('p', null, 'Le texte ci-dessous n’est pas définitif et il n’y a pas encore de maquette. Ne l’apprends pas — il sera réécrit avant l’enregistrement.'));
    av.appendChild(d2);
    box.appendChild(av);
  }

  /* l'intention du morceau — ouvert */
  box.appendChild(repliable('L’idée du morceau', 'reglages', '', true, function (c) {
    c.appendChild(el('p', 'note', p.note));
    if (p.reste && p.reste.length) {
      var r = el('div', 'reste');
      p.reste.forEach(function (x) { r.appendChild(el('span', 'rj', x)); });
      c.appendChild(r);
    }
  }));

  if (p.alerte) {
    var al = el('div', 'alerte');
    al.appendChild(ic('chantier', 20));
    al.appendChild(el('p', null, p.alerte));
    box.appendChild(al);
  }

  /* fiche technique — repliee par defaut */
  box.appendChild(repliable('Fiche technique', 'album', '', false, function (c) {
    var dl = el('dl', 'fiche');
    var lignes = [['Tempo', p.bpm + ' BPM' + (p.pret ? '' : ' visé')]];
    if (p.ton) lignes.push(['Tonalité', p.ton]);
    lignes.push(['Durée', p.duree]);
    if (p.mesures) lignes.push(['Mesures', String(p.mesures)]);
    if (p.refrain) lignes.push(['Refrain à', p.refrain]);
    lignes.push(['Référence', p.ref]);
    lignes.forEach(function (L) {
      var d = el('div');
      d.appendChild(el('dt', null, L[0]));
      d.appendChild(el('dd', null, L[1]));
      dl.appendChild(d);
    });
    c.appendChild(dl);
    var a = el('a', 'ext');
    a.href = p.refUrl; a.target = '_blank'; a.rel = 'noopener';
    a.appendChild(ic('externe', 18));
    a.appendChild(el('span', null, 'Écouter la référence'));
    a.appendChild(ic('suivant', 18));
    c.appendChild(a);
  }));

  /* Paroles — PAS d'accordeon englobant. Chaque section se replie seule ; un
     repliable dans un repliable obligeait a deux ouvertures pour lire un vers. */
  // une section dont aucun « vers » ne contient de lettre n'est pas du texte a
  // apprendre (piste 01 : une « Intro » qui ne contient que des points)
  var sections = p.paroles.filter(function (s) {
    return s.vers.some(function (v) { return /[a-zà-ÿ0-9]/i.test(v); });
  });
  if (sections.length) {
    var par = el('section', 'paroles');

    var tete = el('div', 'par-tete');
    tete.appendChild(ic('texte', 18));
    tete.appendChild(el('b', null, 'Paroles'));
    var nbReels = sections.reduce(function (n, s) { return n + s.vers.length; }, 0);
    tete.appendChild(el('span', 'cpt', nbReels + ' vers'));
    var btTout = el('button', 'par-tout'); btTout.type = 'button';
    btTout.appendChild(el('span', null, 'Tout replier'));
    var chvTout = ic('chevron', 16); chvTout.classList.add('chv');
    btTout.appendChild(chvTout);
    // avec une seule section, un « tout replier » et un chevron n'ont pas de sens
    if (sections.length > 1) tete.appendChild(btTout);
    par.appendChild(tete);

    // « Refrain » apparait deux fois dans plusieurs titres, avec des contenus
    // differents : on numerote les occurrences pour qu'elles se distinguent
    var compte = {};
    sections.forEach(function (s) { compte[s.tag] = (compte[s.tag] || 0) + 1; });
    var vus = {};

    var replis = memoire.replis[num] || [];
    var secs = [];
    sections.forEach(function (s, iSec) {
      // seul le vrai refrain passe en or : le pre-refrain doit rester distinct
      var est = /^(refrain|dernier refrain)/i.test(s.tag);
      var sec = el('div', 'par-sec' + (est ? ' refrain' : ''));
      var ouvert = replis[iSec] === 0 ? '0' : '1';
      sec.dataset.ouvert = ouvert;
      var t = el('button', 'par-t'); t.type = 'button';
      t.setAttribute('aria-expanded', ouvert === '1' ? 'true' : 'false');
      var libelle = s.tag;
      if (compte[s.tag] > 1) {
        vus[s.tag] = (vus[s.tag] || 0) + 1;
        libelle = s.tag + ' ' + vus[s.tag];
      }
      t.appendChild(el('span', null, libelle));
      if (s.voix) t.appendChild(el('em', null, '\u00b7 ' + s.voix));
      t.appendChild(el('i'));
      var ch = ic('chevron', 18); ch.classList.add('chv');
      t.appendChild(ch);
      var cc = el('div', 'par-c'), inner = el('div');
      s.vers.forEach(function (v) { inner.appendChild(el('p', 'vers', v)); });
      cc.appendChild(inner);
      t.addEventListener('click', function () {
        var o = sec.dataset.ouvert === '1';
        sec.dataset.ouvert = o ? '0' : '1';
        t.setAttribute('aria-expanded', String(!o));
        majOutil();
        retenirReplis();
      });
      sec.appendChild(t); sec.appendChild(cc);
      secs.push(sec);
      par.appendChild(sec);
    });

    function retenirReplis() {
      memoire.replis[num] = secs.map(function (x) { return x.dataset.ouvert === '1' ? 1 : 0; });
      retenir();
    }
    function majOutil() {
      var ouverts = secs.filter(function (s) { return s.dataset.ouvert === '1'; }).length;
      btTout.firstChild.textContent = ouverts ? 'Tout replier' : 'Tout d\u00e9plier';
      chvTout.style.transform = ouverts ? '' : 'rotate(-90deg)';
    }
    btTout.addEventListener('click', function () {
      var ouverts = secs.filter(function (s) { return s.dataset.ouvert === '1'; }).length;
      var cible = ouverts ? '0' : '1';
      secs.forEach(function (s) {
        s.dataset.ouvert = cible;
        s.querySelector('.par-t').setAttribute('aria-expanded', cible === '1' ? 'true' : 'false');
      });
      majOutil();
      retenirReplis();
    });

    box.appendChild(par);
  }

  /* titre suivant : une seule invitation a continuer, pas un bloc de navigation */
  var i = P.indexOf(p);
  if (i < P.length - 1) {
    var nx = P[i + 1];
    var a2 = el('a', 'suite'); a2.href = '#t' + nx.num;
    var c3 = el('span', 'suite-c');
    c3.appendChild(el('s', null, 'Titre suivant'));
    c3.appendChild(el('b', null, nx.titre));
    a2.appendChild(c3);
    a2.appendChild(ic('suivant', 20));
    box.appendChild(a2);
  }
  majBoutonsSource();
}

/* Le mini-lecteur devient barre de travail quand on lit le texte du titre qui
   joue : memes dimensions, meme emplacement, mais toutes les commandes utiles. */
function majModeTravail(r) {
  r = r || route();
  var travail = (r.vue === 'piste' && lect.num === r.num);
  mini.classList.toggle('travail', travail);
}

/* ═══════════════════════════ ROUTAGE ═══════════════════════════ */
var VUES = { album: '#v-album', apprendre: '#v-apprendre', studio: '#v-studio',
              guide: '#v-guide', piste: '#v-piste' };
var defilement = {};
var courant = null;
/* Retour hierarchique : on memorise l'onglet d'ou vient la piste plutot que de
   suivre l'historique, qui comptait aussi les enchainements « titre suivant ». */
var origine = 'album';

function route() {
  var h = (location.hash || '#album').slice(1);
  var m = /^t(\d\d)$/.exec(h);
  return m ? { vue: 'piste', num: m[1], cle: h } : { vue: VUES[h] ? h : 'album', num: null, cle: VUES[h] ? h : 'album' };
}

function afficher() {
  var r = route();
  if (r.vue !== 'piste' && VUES[r.vue]) origine = r.vue;
  if (courant) defilement[courant] = window.scrollY;

  Object.keys(VUES).forEach(function (k) { $(VUES[k]).hidden = (k !== r.vue); });
  // sur une vue piste, l'onglet d'ou l'on vient reste allume : une barre
  // entierement eteinte ne dit plus ou l'on se trouve
  var ongActif = (r.vue === 'piste') ? origine : r.vue;
  $$('.ong').forEach(function (o) {
    if (o.dataset.ong === ongActif) o.setAttribute('aria-current', 'page');
    else o.removeAttribute('aria-current');
  });

  if (r.vue === 'piste') rendrePiste(r.num);
  else if (r.vue === 'apprendre') rendreApprendre();
  else if (r.vue === 'studio') rendreStudio();
  else if (r.vue === 'guide') rendreGuide();

  var y = defilement[r.cle];
  // 'auto' suit scroll-behavior:smooth du CSS : le changement de vue s'animait
  window.scrollTo({ top: y || 0, behavior: 'instant' });
  courant = r.cle;
  document.title = (r.vue === 'piste' && piste(r.num))
    ? piste(r.num).titre + ' — Résilience' : 'Résilience — D.M.P';

  majModeTravail(r);

  var t = $('.tete');
  if (t) t.classList.toggle('decolle', window.scrollY > 24);

  if (attendreParoles && r.vue === 'piste') {
    attendreParoles = false;
    requestAnimationFrame(versParoles);
  }
}

window.addEventListener('hashchange', function () { afficher(); });
$('#btn-retour').addEventListener('click', function () { location.hash = '#' + origine; });

/* la barre de piste ne montre son trait et son titre qu'une fois decollee */
var tic = false;
window.addEventListener('scroll', function () {
  if (tic) return;
  tic = true;
  requestAnimationFrame(function () {
    var t = $('.tete');
    if (t && !$('#v-piste').hidden) t.classList.toggle('decolle', window.scrollY > 24);
    tic = false;
  });
}, { passive: true });

/* ═══════════════════════════ DEMARRAGE ═══════════════════════════ */
rendreAlbum();
if (!location.hash) location.replace('#album');
afficher();

/* Reprise silencieuse : on remonte le mini-lecteur a l'arret, a la position
   quittee. Pas de boite de dialogue — il tape sur lecture s'il veut reprendre. */
if (memoire.num && piste(memoire.num) && piste(memoire.num)[memoire.src || 'maquette']) {
  charger(memoire.num, memoire.src || 'maquette', false);
  if (memoire.t > 1) {
    A.addEventListener('loadedmetadata', function reprise() {
      A.removeEventListener('loadedmetadata', reprise);
      if (isFinite(A.duration) && memoire.t < A.duration - 1) A.currentTime = memoire.t;
    });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
  });
}
})();
