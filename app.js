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

/* ═══════════════════════════ LECTEUR ═══════════════════════════ */
var A = new Audio();
A.preload = 'metadata';
var lect = { num: null, src: 'maquette', joue: false };

var mini = $('#mini'), miniJauge = $('#mini-jauge'), miniNum = $('#mini-num'),
    miniTitre = $('#mini-titre'), miniSource = $('#mini-source'), miniPP = $('#mini-pp');
var feuille = $('#feuille'), scrim = $('#scrim'),
    flNum = $('#fl-num'), flTitre = $('#fl-titre'), flFeat = $('#fl-feat'),
    flBarre = $('#fl-barre'), flRemp = $('#fl-remplissage'), flPoi = $('#fl-poignee'),
    flT1 = $('#fl-t1'), flT2 = $('#fl-t2'), flPP = $('#fl-pp'),
    fbMaq = $('#fb-maq'), fbIns = $('#fb-ins');

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
      artist: lect.src === 'instru' ? 'Instrumental — D.M.P' : 'D.M.P',
      album: 'Résilience',
      artwork: [{ src: ICONE, sizes: '512x512', type: 'image/png' }]
    });
  } catch (e) { /* MediaMetadata absent : sans consequence */ }
}

function charger(num, src, lancer) {
  var p = piste(num);
  if (!p || !p[src]) return;
  var change = lect.num !== num || lect.src !== src;
  lect.num = num; lect.src = src;
  if (change) { A.src = p[src]; A.currentTime = 0; placer(0); }

  mini.hidden = false;
  document.body.classList.add('a-mini');
  miniNum.textContent = num;
  miniTitre.textContent = p.titre;
  miniSource.textContent = src === 'instru' ? 'Instrumental' : 'Maquette';
  flNum.textContent = num;
  flTitre.textContent = p.titre;
  flFeat.textContent = p.feat ? 'avec ' + p.feat : 'D.M.P';
  fbMaq.classList.toggle('on', src === 'maquette');
  fbMaq.setAttribute('aria-pressed', String(src === 'maquette'));
  fbIns.classList.toggle('on', src === 'instru');
  fbIns.setAttribute('aria-pressed', String(src === 'instru'));
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
A.addEventListener('pause', function () { lect.joue = false; majEtatLecture(); });
A.addEventListener('ended', function () { lect.joue = false; placer(0); majEtatLecture(); });
A.addEventListener('loadedmetadata', function () { flT2.textContent = mmss(A.duration); });
A.addEventListener('timeupdate', function () { if (!tire) placer(A.currentTime / A.duration || 0); });

function placer(f) {
  f = Math.min(1, Math.max(0, f || 0));
  var pc = (f * 100).toFixed(3) + '%';
  miniJauge.style.width = pc;
  flRemp.style.right = (100 - f * 100).toFixed(3) + '%';
  flPoi.style.left = pc;
  flT1.textContent = mmss(f * (A.duration || 0));
  flBarre.setAttribute('aria-valuenow', Math.round(f * 100));
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
flPP.addEventListener('click', bascule);
$('#fl-recul').addEventListener('click', function () { A.currentTime = Math.max(0, A.currentTime - 15); });
$('#fl-avance').addEventListener('click', function () {
  if (isFinite(A.duration)) A.currentTime = Math.min(A.duration, A.currentTime + 15);
});
fbMaq.addEventListener('click', function () { if (lect.num) charger(lect.num, 'maquette', lect.joue); });
fbIns.addEventListener('click', function () { if (lect.num) charger(lect.num, 'instru', lect.joue); });

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
function ouvrirFeuille() {
  if (feuilleOuverte || !lect.num) return;
  feuilleOuverte = true;
  scrim.hidden = false; feuille.hidden = false;
  scrim.classList.remove('sort'); feuille.classList.remove('sort');
  document.body.classList.add('fige');
  flPP.focus({ preventScroll: true });
}
function fermerFeuille() {
  if (!feuilleOuverte) return;
  feuilleOuverte = false;
  feuille.classList.add('sort'); scrim.classList.add('sort');
  document.body.classList.remove('fige');
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
  var n = lect.num; fermerFeuille();
  if (n) location.hash = '#t' + n;
});

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
    // une seule ligne : la tonalite est dans la fiche technique du titre
    var bits = [];
    if (p.feat) bits.push('avec ' + p.feat);
    bits.push(p.bpm + ' BPM' + (p.pret ? '' : ' visé'));
    c2.appendChild(el('s', null, bits.join(' · ')));
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

/* ═══════════════════════════ RENDU : ECOUTER ═══════════════════════════ */
function rendreEcoute() {
  var box = $('#lst-ecoute');
  box.textContent = '';
  var prets = P.filter(function (p) { return p.pret; });
  if (!prets.length) {
    var v = el('div', 'vide');
    v.appendChild(el('p', null, 'Aucune maquette n’est prête pour le moment. Elles apparaîtront ici dès qu’un titre sera complet.'));
    box.appendChild(v);
    return;
  }
  prets.forEach(function (p) {
    var b = el('button', 'ec');
    b.type = 'button';
    var r = el('span', 'ec-b'); r.appendChild(ic('play', 22)); b.appendChild(r);
    var c = el('span', 'ec-c');
    c.appendChild(el('b', null, p.titre));
    c.appendChild(el('s', null, p.feat ? 'Maquette · avec ' + p.feat : 'Maquette'));
    b.appendChild(c);
    b.appendChild(el('span', 'ec-d', p.duree));
    b.addEventListener('click', function () { charger(p.num, 'maquette', true); ouvrirFeuille(); });
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

  /* jalons */
  var j = el('div', 'jalons');
  [['Texte', p.pret], ['Instru', p.pret], ['Maquette', p.pret]].forEach(function (x) {
    var d = el('div', 'jalon ' + (x[1] ? 'ok' : 'non'));
    d.appendChild(ic(x[1] ? 'check' : 'chantier', 18));
    d.appendChild(el('span', null, x[0]));
    j.appendChild(d);
  });
  box.appendChild(j);

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
    if (p.alerte) {
      var n = el('p', 'note'); n.style.marginTop = '16px';
      n.style.color = 'var(--tx3)'; n.style.fontSize = '15px';
      n.textContent = p.alerte;
      c.appendChild(n);
    }
  }));

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

  /* paroles */
  if (p.paroles.length) {
    box.appendChild(repliable('Paroles', 'texte', p.nbVers + ' vers', true, function (c) {
      var outils = el('div', 'par-outils');
      var bt = el('button'); bt.type = 'button';
      bt.appendChild(el('span', null, 'Tout replier'));
      var chv = ic('chevron', 16);
      bt.appendChild(chv);
      outils.appendChild(bt);
      c.appendChild(outils);

      var secs = [];
      p.paroles.forEach(function (s) {
        // seul le vrai refrain passe en or : le pre-refrain doit rester distinct
        var est = /^(refrain|dernier refrain)/i.test(s.tag);
        var sec = el('div', 'par-sec' + (est ? ' refrain' : ''));
        sec.dataset.ouvert = '1';
        var t = el('button', 'par-t'); t.type = 'button';
        t.setAttribute('aria-expanded', 'true');
        t.appendChild(el('span', null, s.tag));
        if (s.voix) t.appendChild(el('em', null, '· ' + s.voix));
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
        });
        sec.appendChild(t); sec.appendChild(cc);
        secs.push(sec);
        c.appendChild(sec);
      });

      function majOutil() {
        var ouverts = secs.filter(function (s) { return s.dataset.ouvert === '1'; }).length;
        bt.firstChild.textContent = ouverts ? 'Tout replier' : 'Tout déplier';
        chv.style.transform = ouverts ? '' : 'rotate(-90deg)';
      }
      bt.addEventListener('click', function () {
        var ouverts = secs.filter(function (s) { return s.dataset.ouvert === '1'; }).length;
        var cible = ouverts ? '0' : '1';
        secs.forEach(function (s) {
          s.dataset.ouvert = cible;
          s.querySelector('.par-t').setAttribute('aria-expanded', cible === '1' ? 'true' : 'false');
        });
        majOutil();
      });
    }));
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

/* ═══════════════════════════ ROUTAGE ═══════════════════════════ */
var VUES = { album: '#v-album', ecouter: '#v-ecouter', guide: '#v-guide', piste: '#v-piste' };
var defilement = {};
var courant = null, navInternes = 0;

function route() {
  var h = (location.hash || '#album').slice(1);
  var m = /^t(\d\d)$/.exec(h);
  return m ? { vue: 'piste', num: m[1], cle: h } : { vue: VUES[h] ? h : 'album', num: null, cle: VUES[h] ? h : 'album' };
}

function afficher() {
  var r = route();
  if (courant) defilement[courant] = window.scrollY;

  Object.keys(VUES).forEach(function (k) { $(VUES[k]).hidden = (k !== r.vue); });
  $$('.ong').forEach(function (o) {
    if (o.dataset.ong === r.vue) o.setAttribute('aria-current', 'page');
    else o.removeAttribute('aria-current');
  });

  if (r.vue === 'piste') rendrePiste(r.num);
  else if (r.vue === 'ecouter') rendreEcoute();
  else if (r.vue === 'guide') rendreGuide();

  var y = defilement[r.cle];
  window.scrollTo({ top: y || 0, behavior: 'auto' });
  courant = r.cle;
  document.title = (r.vue === 'piste' && piste(r.num))
    ? piste(r.num).titre + ' — Résilience' : 'Résilience — D.M.P';

  var t = $('.tete');
  if (t) t.classList.toggle('decolle', window.scrollY > 24);
}

window.addEventListener('hashchange', function () { navInternes++; afficher(); });
$('#btn-retour').addEventListener('click', function () {
  if (navInternes > 0) history.back();
  else location.hash = '#album';
});

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
  });
}
})();
