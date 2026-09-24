// sync.js — sauvegarde/synchronisation dans un dépôt GitHub PRIVÉ via l'API REST (aucun serveur).
// Fichiers créés dans le dépôt : state.json (données) et img/<id>.jpg (images).
import * as S from './store.js';

export const config = () => JSON.parse(localStorage.gh || 'null');
export const setCfg = c => { localStorage.gh = JSON.stringify(c); };
export const clearCfg = () => localStorage.removeItem('gh');
export const enabled = () => !!config();
export const set = m => { const el = document.getElementById('sync-status'); if (el) el.textContent = m; };

const shas = {}; // dernier sha connu de chaque fichier (requis par GitHub pour modifier un fichier)
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
const api = (path, opt = {}) => fetch(`https://api.github.com/repos/${config().repo}/contents/${path}`, {
  cache: 'no-store', ...opt,
  headers: { Authorization: 'Bearer ' + config().token, Accept: 'application/vnd.github+json', ...(opt.headers || {}) }
});

// Écrit un fichier ; en cas de conflit de sha, relit et réessaie une fois (dernier écrit gagne)
async function put(path, content, message) {
  for (let t = 0; t < 2; t++) {
    if (!(path in shas)) { const r = await api(path); shas[path] = r.ok ? (await r.json()).sha : null; }
    const r = await api(path, { method: 'PUT', body: JSON.stringify({ message, content, ...(shas[path] ? { sha: shas[path] } : {}) }) });
    if (r.ok) { shas[path] = (await r.json()).content.sha; return; }
    delete shas[path];
    if (t) throw Error(r.status === 401 || r.status === 403 ? 'jeton refusé (droits ou expiration)' : 'GitHub ' + r.status);
  }
}

let busy = false, again = false;
export async function push() {
  if (!enabled()) return;
  if (busy) { again = true; return; }
  busy = true; set('Synchronisation…');
  try {
    for (const id of [...S.state.unsynced]) { // images pas encore envoyées
      const d = await S.getImg(id);
      if (d) await put(`img/${id}.jpg`, d.split(',')[1], 'image');
      S.state.unsynced = S.state.unsynced.filter(x => x !== id);
    }
    const { unsynced, ...data } = S.state;
    await put('state.json', b64(JSON.stringify(data)), 'sauvegarde');
    await S.flush();
    set('Synchronisé à ' + new Date().toLocaleTimeString('fr'));
  } catch (e) { set('Erreur de synchro : ' + e.message); }
  busy = false;
  if (again) { again = false; push(); }
}

const toDataURL = b => new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(new Blob([b], { type: 'image/jpeg' })); });
async function pullImgs() {
  const ids = S.state.sheets.flatMap(s => s.slots.flatMap(x => x.secs.map(c => c.img))).filter(Boolean);
  for (const id of ids) if (!(await S.getImg(id))) {
    const r = await api(`img/${id}.jpg`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (r.ok) await S.putImg(id, await toDataURL(await r.blob()), true);
  }
}

// À appeler au démarrage et à la demande. Renvoie true si des données distantes ont remplacé les locales.
export async function init() {
  if (!enabled()) return false;
  set('Synchronisation…');
  try {
    const r = await api('state.json');
    if (r.status === 404) { S.state.unsynced = await S.imgKeys(); await push(); return false; } // 1re synchro : tout envoyer
    if (!r.ok) throw Error(r.status === 401 || r.status === 403 ? 'jeton refusé (droits ou expiration)' : 'GitHub ' + r.status);
    const j = await r.json(); shas['state.json'] = j.sha;
    const remote = JSON.parse(unb64(j.content));
    if ((remote.updated || 0) > (S.state.updated || 0)) { // le distant est plus récent : on le récupère
      Object.assign(S.state, { students: [], sheets: [], notes: [] }, remote);
      await S.flush(); await pullImgs(); set('Données GitHub récupérées.'); return true;
    }
    await push();
  } catch (e) { set('Erreur de synchro : ' + e.message); }
  return false;
}

S.hooks.saved = push; // envoi automatique après chaque sauvegarde locale
