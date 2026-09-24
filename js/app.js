// app.js — couche INTERFACE : vues, événements, images. Les données passent par store.js.
import * as S from './store.js';
import * as Sync from './sync.js';

const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n == null || n === '' ? '–' : String(Math.round(n * 100) / 100).replace('.', ',');
const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
const stu = id => S.state.students.find(s => s.id === id);
const SEC = ['Démonstration de cours', 'Exercice 1', 'Exercice 2', 'Exercice 3'];

let view = 'sheets', cur = null, tab = 0, q = '', sel = null, focusSec = null, pending = 0;
const sheet = () => S.sheet(cur);
const slot = () => sheet().slots[tab];
const opts = id => '<option value="">— choisir un élève —</option>' +
  S.state.students.slice().sort(byName).map(s => `<option value="${s.id}" ${s.id === id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

// ---------- Vues ----------
function listHtml() {
  const t = q.toLowerCase();
  return S.state.sheets
    .filter(s => !t || (s.name + ' ' + s.tags + ' ' + s.slots.map(x => stu(x.studentId)?.name).join(' ')).toLowerCase().includes(t))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(s => `<div class="card"><div><b>${esc(s.name)}</b> <small>${s.date}</small>
      ${s.tags ? `<span class="badge">${esc(s.tags)}</span>` : ''}
      <div class="sub">${s.slots.map(x => `${esc(stu(x.studentId)?.name || '—')} : ${fmt(x.grade)}`).join(' &nbsp; ')}</div></div>
      <div class="row"><button data-act="open" data-id="${s.id}">Ouvrir</button>
      <button data-act="dup" data-id="${s.id}">Dupliquer</button>
      <button class="danger" data-act="delsheet" data-id="${s.id}">Supprimer</button></div></div>`).join('')
    || '<p class="sub">Aucune fiche. Créez-en une avec « Nouvelle fiche ».</p>';
}
const vSheets = () => `<div class="row"><input data-f="q" value="${esc(q)}" placeholder="Rechercher une fiche, un élève, un chapitre…">
  <button class="primary" data-act="new">+ Nouvelle fiche</button></div><div id="list">${listHtml()}</div>`;

function vSheet() {
  const s = sheet(), sl = slot();
  return `<button data-act="nav" data-v="sheets">← Fiches</button>
  <div class="meta row"><input data-f="name" value="${esc(s.name)}" placeholder="Nom de la fiche">
    <input type="date" data-f="date" value="${s.date}"><input data-f="tags" value="${esc(s.tags)}" placeholder="Tags / chapitres"></div>
  <div class="tabs">${s.slots.map((x, i) => `<button class="${i === tab ? 'on' : ''}" data-act="tab" data-i="${i}">${esc(stu(x.studentId)?.name || 'Élève ' + (i + 1))}</button>`).join('')}</div>
  <div class="row"><select data-f="student">${opts(sl.studentId)}</select>
    <label class="grade">Note <input type="number" min="0" max="20" step="0.25" data-f="grade" value="${sl.grade}"> /20</label></div>
  ${sl.secs.map((c, i) => `<section class="sec" data-i="${i}"><h3>${SEC[i]}</h3>
    <div class="drop" data-i="${i}">${c.img
      ? `<img data-img="${c.img}" alt=""><button class="danger sm" data-act="rmimg" data-i="${i}">✕</button>`
      : `<span>Collez (Ctrl+V), glissez une image ou <button class="sm" data-act="pick" data-i="${i}">parcourir</button></span>`}</div>
    <textarea data-f="comment" data-i="${i}" rows="2" placeholder="Commentaire">${esc(c.comment)}</textarea></section>`).join('')}`;
}

function detail(id) {
  const n = S.notesOf(id), st = S.stats(n);
  const row = x => `<li><b>${fmt(x.grade)}</b> <span class="badge">${x.type}</span> ${x.date || ''} ${esc(x.source || '')} <i>${esc(x.comment || '')}</i>
    ${x.id ? `<button class="danger sm" data-act="delnote" data-id="${x.id}">✕</button>` : ''}</li>`;
  const dated = n.filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date)), undated = n.filter(x => !x.date);
  return `<h2>${esc(stu(id).name)}</h2>
  <div class="stats"><div>Moy. globale<b>${fmt(st.all)}</b></div><div>Moy. colles<b>${fmt(st.colle)}</b></div><div>Moy. autres<b>${fmt(st.ext)}</b></div></div>
  <h3>Historique daté</h3><ul>${dated.map(row).join('') || '<li class="sub">Aucune note datée</li>'}</ul>
  <h3>Notes sans date</h3><ul>${undated.map(row).join('') || '<li class="sub">Aucune note sans date</li>'}</ul>`;
}
const vStudents = () => `<div class="row"><input id="newstu" placeholder="Nom de l'élève"><button class="primary" data-act="addstu">Ajouter</button></div>
  <details class="card"><summary>Coller une liste d'élèves</summary>
    <textarea id="bulk" rows="8" placeholder="Un élève par ligne (copiez-collez depuis votre fichier)"></textarea>
    <button class="primary" data-act="bulkstu">Importer la liste</button></details>
  <div class="cols"><div>${S.state.students.slice().sort(byName).map(s => `<div class="card ${s.id === sel ? 'on' : ''}">
    <a data-act="selstu" data-id="${s.id}"><b>${esc(s.name)}</b></a>
    <div class="row"><button class="sm" data-act="renstu" data-id="${s.id}">Renommer</button><button class="danger sm" data-act="delstu" data-id="${s.id}">Supprimer</button></div></div>`).join('')
    || '<p class="sub">Aucun élève. Ajoutez le premier.</p>'}</div>
  <div>${sel && stu(sel) ? detail(sel) : '<p class="sub">Sélectionnez un élève pour voir son historique.</p>'}</div></div>`;

function vNotes() {
  const all = S.state.notes.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<h2>Ajouter une note externe</h2><div class="form">
    <select id="n-stu">${opts(sel)}</select><input id="n-grade" type="number" min="0" max="20" step="0.25" placeholder="Note /20">
    <input id="n-date" type="date" title="Date (facultative)"><input id="n-src" placeholder="Source (DS, autre khôlleur…)">
    <input id="n-com" placeholder="Commentaire (facultatif)"><button class="primary" data-act="addnote">Ajouter la note</button></div>
  <h3>Notes externes</h3><ul>${all.map(n => `<li><b>${fmt(n.grade)}</b> ${esc(stu(n.studentId)?.name || '?')} ${n.date || '(sans date)'} ${esc(n.source || '')} <i>${esc(n.comment || '')}</i>
    <button class="danger sm" data-act="delnote" data-id="${n.id}">✕</button></li>`).join('') || '<li class="sub">Aucune note externe.</li>'}</ul>`;
}
const vGlobal = () => `<h2>Vue globale</h2><div class="scroll"><table><tr><th>Élève<th>Colles<th>Moy. colles<th>Autres<th>Moy. autres<th>Moy. globale</tr>
  ${S.state.students.slice().sort(byName).map(s => { const t = S.stats(S.notesOf(s.id));
    return `<tr><td>${esc(s.name)}<td>${t.nc}<td>${fmt(t.colle)}<td>${t.ne}<td>${fmt(t.ext)}<td><b>${fmt(t.all)}</b>`; }).join('')}</table></div>`;

const vSync = () => `<h2>Synchronisation GitHub</h2>
  <p class="sub">Vos données sont sauvegardées dans un dépôt GitHub <b>privé</b> (jamais dans le dépôt public du site).</p>
  <div class="form"><input id="gh-repo" placeholder="pseudo/nom-du-depot-prive" value="${esc(Sync.config()?.repo || '')}">
  <input id="gh-token" type="password" placeholder="${Sync.enabled() ? 'Jeton enregistré (laisser vide pour le garder)' : 'Jeton d\'accès (fine-grained)'}">
  <button class="primary" data-act="syncsave">Enregistrer et synchroniser</button>
  <button data-act="syncnow">Synchroniser maintenant</button>
  <button class="danger" data-act="syncoff">Déconnecter</button></div>`;

function render() {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view || (view === 'sheet' && b.dataset.v === 'sheets')));
  $('#main').innerHTML = { sheets: vSheets, sheet: vSheet, students: vStudents, notes: vNotes, global: vGlobal, sync: vSync }[view]();
  document.querySelectorAll('img[data-img]').forEach(async i => { i.src = await S.getImg(i.dataset.img); }); // images depuis IndexedDB
}

// ---------- Images ----------
// Redimensionne (max 1400px) et compresse en JPEG pour économiser l'espace local
const shrink = f => new Promise(res => {
  const im = new Image();
  im.onload = () => {
    const k = Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = im.width * k; c.height = im.height * k;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    res(c.toDataURL('image/jpeg', .82));
  };
  im.src = URL.createObjectURL(f);
});
async function setImg(i, file) {
  const c = slot().secs[i], id = S.uid();
  await S.putImg(id, await shrink(file));
  if (c.img) S.delImg(c.img);
  c.img = id; S.save(); render();
}
document.addEventListener('paste', e => {
  if (view !== 'sheet') return;
  const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (!it) return;
  e.preventDefault();
  setImg(focusSec ?? Math.max(0, slot().secs.findIndex(c => !c.img)), it.getAsFile());
});
document.addEventListener('dragover', e => { if (e.target.closest('.drop')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const d = e.target.closest('.drop'); if (!d) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) setImg(+d.dataset.i, f);
});
$('#file').onchange = e => { const f = e.target.files[0]; if (f) setImg(pending, f); e.target.value = ''; };

// ---------- Événements ----------
const openSheet = id => { cur = id; tab = 0; focusSec = null; view = 'sheet'; render(); };
document.addEventListener('click', async e => {
  const sec = e.target.closest('.sec'); if (sec) focusSec = +sec.dataset.i; // cible du prochain collage
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, i, v } = el.dataset;
  switch (act) {
    case 'nav': view = v; render(); break;
    case 'new': openSheet(S.newSheet().id); break;
    case 'open': openSheet(id); break;
    case 'dup': openSheet((await S.dupSheet(id)).id); break;
    case 'delsheet': if (confirm('Supprimer cette fiche ?')) { S.delSheet(id); render(); } break;
    case 'tab': tab = +i; focusSec = null; render(); break;
    case 'pick': pending = +i; $('#file').click(); break;
    case 'rmimg': { const c = slot().secs[i]; S.delImg(c.img); c.img = null; S.save(); render(); break; }
    case 'addstu': { const n = $('#newstu').value.trim(); if (n) { S.state.students.push({ id: S.uid(), name: n }); S.save(); render(); } break; }
    case 'bulkstu': {
      // Une ligne = un élève ; les tabulations (copie depuis Excel) deviennent des espaces ; doublons ignorés
      const known = new Set(S.state.students.map(s => s.name.toLowerCase()));
      const names = $('#bulk').value.split(/\r?\n/).map(l => l.replace(/\t+/g, ' ').trim()).filter(Boolean);
      let n = 0;
      for (const name of names) if (!known.has(name.toLowerCase())) { known.add(name.toLowerCase()); S.state.students.push({ id: S.uid(), name }); n++; }
      S.save(); render(); alert(`${n} élève(s) ajouté(s), ${names.length - n} doublon(s) ignoré(s).`); break;
    }
    case 'syncsave': {
      const repo = $('#gh-repo').value.trim(), token = $('#gh-token').value.trim() || Sync.config()?.token;
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return alert('Indiquez le dépôt (pseudo/nom) et le jeton.');
      Sync.setCfg({ repo, token }); if (await Sync.init()) render(); break;
    }
    case 'syncnow': if (await Sync.init()) render(); break;
    case 'syncoff': Sync.clearCfg(); Sync.set('Synchro désactivée'); break;
    case 'selstu': sel = id; render(); break;
    case 'renstu': { const s = stu(id), n = prompt('Nouveau nom :', s.name); if (n?.trim()) { s.name = n.trim(); S.save(); render(); } break; }
    case 'delstu': if (confirm('Supprimer cet élève et ses notes externes ?')) { S.delStudent(id); if (sel === id) sel = null; render(); } break;
    case 'addnote': {
      const studentId = $('#n-stu').value, grade = parseFloat($('#n-grade').value);
      if (!studentId || isNaN(grade)) return alert('Choisissez un élève et saisissez une note.');
      S.state.notes.push({ id: S.uid(), type: 'externe', studentId, grade, date: $('#n-date').value || '', source: $('#n-src').value.trim(), comment: $('#n-com').value.trim() });
      sel = studentId; S.save(); render(); break;
    }
    case 'delnote': S.state.notes = S.state.notes.filter(n => n.id !== id); S.save(); render(); break;
    case 'colle': document.body.classList.toggle('colle'); break; // mode « utilisation en colle »
    case 'theme': S.state.theme = S.state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.state.theme; S.save(); break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(await S.exportAll())], { type: 'application/json' }));
      a.download = `colles-${S.today()}.json`; a.click(); break;
    }
    case 'import': $('#imp').click(); break;
  }
});
// Saisie : mise à jour de l'état sans re-rendu (garde le focus), puis autosave
document.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f; if (!f || f === 'student') return;
  if (f === 'q') { q = t.value; $('#list').innerHTML = listHtml(); return; }
  if (view !== 'sheet') return;
  const s = sheet(), sl = slot();
  if (f === 'grade') sl.grade = t.value === '' ? '' : parseFloat(t.value);
  else if (f === 'comment') sl.secs[t.dataset.i].comment = t.value;
  else s[f] = t.value;
  S.save();
});
document.addEventListener('change', e => { if (e.target.dataset.f === 'student') { slot().studentId = e.target.value; S.save(); render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'newstu') { e.preventDefault(); document.querySelector('[data-act=addstu]').click(); } });
$('#imp').onchange = async e => {
  try { await S.importAll(JSON.parse(await e.target.files[0].text())); document.documentElement.dataset.theme = S.state.theme; view = 'sheets'; render(); Sync.push(); alert('Import réussi.'); }
  catch (err) { alert('Import impossible : ' + err.message); }
  e.target.value = '';
};

// ---------- Démarrage ----------
const start = () => { $('#login').hidden = true; $('#app').hidden = false; render(); };
$('#login').onsubmit = e => {
  e.preventDefault();
  if ($('#pw').value === 'Clotaireuh') { sessionStorage.ok = 1; start(); } else $('#err').textContent = 'Mot de passe incorrect.';
};
addEventListener('pagehide', () => S.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) S.flush(); });
(async () => {
  await S.load();
  document.documentElement.dataset.theme = S.state.theme;
  if (sessionStorage.ok) start();
  Sync.init().then(changed => changed && render()); // récupère les données GitHub si plus récentes
  navigator.serviceWorker?.register('sw.js'); // mode hors-ligne
})();
