// store.js — couche DONNÉES : IndexedDB, état en mémoire, autosave, calcul des notes.
// Aucune manipulation du DOM ici.
let db;
const open = () => new Promise((ok, ko) => {
  const r = indexedDB.open('colles', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('img'); };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
// Petite transaction promisifiée
const tx = (store, mode, fn) => new Promise((ok, ko) => {
  const t = db.transaction(store, mode);
  const req = fn(t.objectStore(store));
  t.oncomplete = () => ok(req && req.result);
  t.onerror = () => ko(t.error);
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// État unique : élèves, fiches, notes externes. (Les notes "colle" sont DÉDUITES des fiches.)
export const state = { students: [], sheets: [], notes: [], theme: 'light', updated: 0, unsynced: [] };
export const hooks = {}; // sync.js s'y branche pour envoyer vers GitHub après chaque sauvegarde

export async function load() {
  db = await open();
  Object.assign(state, (await tx('kv', 'readonly', o => o.get('state'))) || {});
}
let timer;
export const flush = () => { clearTimeout(timer); return tx('kv', 'readwrite', o => o.put(state, 'state')); };
export const save = () => { state.updated = Date.now(); clearTimeout(timer); timer = setTimeout(async () => { await flush(); hooks.saved?.(); }, 300); }; // autosave

// Images stockées à part (dataURL) pour ne pas alourdir l'état
export const putImg = (id, data, remote = false) => { if (!remote && !state.unsynced.includes(id)) state.unsynced.push(id); return tx('img', 'readwrite', o => o.put(data, id)); };
export const imgKeys = () => tx('img', 'readonly', o => o.getAllKeys());
export const getImg = id => tx('img', 'readonly', o => o.get(id));
export const delImg = id => tx('img', 'readwrite', o => o.delete(id));

// ---- Fiches ----
export const sheet = id => state.sheets.find(s => s.id === id);
export function newSheet() {
  const d = today();
  const s = {
    id: uid(), name: 'Colle du ' + d, date: d, tags: '',
    slots: [0, 1, 2].map(() => ({ studentId: '', grade: '', secs: [0, 1, 2, 3].map(() => ({ img: null, comment: '' })) }))
  };
  state.sheets.push(s); save(); return s;
}
export async function dupSheet(id) {
  const s = JSON.parse(JSON.stringify(sheet(id)));
  s.id = uid(); s.name += ' (copie)'; s.date = today();
  for (const sl of s.slots) for (const c of sl.secs) if (c.img) { const n = uid(); await putImg(n, await getImg(c.img)); c.img = n; }
  state.sheets.push(s); save(); return s;
}
export function delSheet(id) {
  const s = sheet(id);
  s.slots.forEach(sl => sl.secs.forEach(c => c.img && delImg(c.img)));
  state.sheets = state.sheets.filter(x => x !== s); save();
}

// ---- Élèves ----
export function delStudent(id) {
  state.students = state.students.filter(s => s.id !== id);
  state.notes = state.notes.filter(n => n.studentId !== id);
  state.sheets.forEach(s => s.slots.forEach(sl => { if (sl.studentId === id) sl.studentId = ''; }));
  save();
}

// ---- Notes : structure unifiée {type, studentId, grade, date?, comment?, source?} ----
export const notesOf = sid => [
  ...state.notes.filter(n => n.studentId === sid).map(n => ({ ...n, type: 'externe' })),
  ...state.sheets.flatMap(s => s.slots.filter(x => x.studentId === sid && x.grade !== '')
    .map(x => ({ type: 'colle', studentId: sid, grade: x.grade, date: s.date, comment: '', source: s.name, sheetId: s.id })))
];
const avg = a => a.length ? a.reduce((x, y) => x + y.grade, 0) / a.length : null;
export const stats = n => {
  const c = n.filter(x => x.type === 'colle'), e = n.filter(x => x.type === 'externe');
  return { all: avg(n), colle: avg(c), ext: avg(e), nc: c.length, ne: e.length };
};

// ---- Export / import JSON (état + images) ----
export async function exportAll() {
  const keys = await tx('img', 'readonly', o => o.getAllKeys());
  const vals = await tx('img', 'readonly', o => o.getAll());
  return { v: 1, state, images: Object.fromEntries(keys.map((k, i) => [k, vals[i]])) };
}
export async function importAll(d) {
  if (!Array.isArray(d?.state?.students)) throw Error('Fichier invalide');
  await tx('img', 'readwrite', o => o.clear());
  for (const [k, v] of Object.entries(d.images || {})) await putImg(k, v);
  Object.assign(state, { students: [], sheets: [], notes: [] }, d.state);
  state.unsynced = Object.keys(d.images || {}); state.updated = Date.now();
  await flush();
}
