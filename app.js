import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, onSnapshot, addDoc, setDoc, updateDoc, getDoc,
  arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- hulpjes ---------- */
const $ = s => document.querySelector(s);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
};
const eur = c => (c/100).toLocaleString('nl-NL',{style:'currency',currency:'EUR'});
const kmf = n => Math.round(n).toLocaleString('nl-NL');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const fmtDate = d => d ? new Date(d+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : '';
function parseNum(s){
  s = String(s||'').trim().replace(/\s|€/g,'');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
  else if (s.includes(',')) s = s.replace(',','.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  return Number(s);
}
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,3000); }
function status(msg){ const s=$('#status'); s.textContent=msg||''; s.hidden=!msg; }
function show(id){ ['setup','auth','join','main','empty','newcar','accountMenu'].forEach(x => $('#'+x).hidden = x !== id); }

/* ---------- state ---------- */
const state = { user:null, cars:[], carId:null, entries:[], carsLoaded:false };
let unsubCars = null, unsubEntries = null;
const params = new URLSearchParams(location.search);
let pendingJoin = params.get('join') || sessionStorage.getItem('pendingJoin') || null;
if (pendingJoin) try { sessionStorage.setItem('pendingJoin', pendingJoin); } catch(e){}

/* ---------- Firebase ---------- */
if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'VUL_IN'){
  show('setup');
  throw new Error('Firebase is nog niet ingesteld (firebase-config.js).');
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

function fail(e){
  console.error(e);
  const code = e?.code || '';
  if (code.includes('permission-denied')) toast('Dat mag niet: je bent geen lid van deze auto.');
  else if (code.includes('unavailable')) toast('Geen verbinding. Het wordt opgeslagen zodra je weer online bent.');
  else toast('Opslaan mislukt. Probeer het opnieuw.');
}
// Firestore bewaart schrijfacties offline en stuurt ze later door; we wachten daarom niet op de server.
const fire = p => { p.catch(fail); };

/* ---------- inloggen ---------- */
let signupMode = false;
function setAuthMode(signup){
  signupMode = signup;
  $('#authTitle').textContent = signup ? 'Account maken' : 'Inloggen';
  $('#authSubmit').textContent = signup ? 'Account maken' : 'Inloggen';
  $('#authToggle').textContent = signup ? 'Heb je al een account? Log in' : 'Nog geen account? Maak er een';
  $('#nameField').hidden = !signup;
  $('#authName').required = signup;
  $('#authPass').autocomplete = signup ? 'new-password' : 'current-password';
}
const authErrors = {
  'auth/invalid-credential':'E-mailadres of wachtwoord klopt niet.',
  'auth/wrong-password':'E-mailadres of wachtwoord klopt niet.',
  'auth/user-not-found':'Er is geen account met dit e-mailadres. Maak er een aan.',
  'auth/email-already-in-use':'Er bestaat al een account met dit e-mailadres. Log in.',
  'auth/weak-password':'Kies een wachtwoord van minstens 6 tekens.',
  'auth/invalid-email':'Dit e-mailadres klopt niet.',
  'auth/too-many-requests':'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth/popup-closed-by-user':'Inloggen met Google is afgebroken.',
  'auth/unauthorized-domain':'Dit webadres staat nog niet in Firebase bij "Geautoriseerde domeinen". Zie de README.',
  'auth/network-request-failed':'Geen verbinding. Controleer je internet.'
};
const authMsg = e => authErrors[e?.code] || 'Inloggen lukte niet. Probeer het opnieuw.';

$('#authToggle').addEventListener('click', () => setAuthMode(!signupMode));
$('#authForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
  try {
    if (signupMode){
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: $('#authName').value.trim() });
      onUser(auth.currentUser);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch(e){ toast(authMsg(e)); }
});
$('#authReset').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  if (!email){ toast('Vul eerst je e-mailadres in.'); $('#authEmail').focus(); return; }
  try { await sendPasswordResetEmail(auth, email); toast('Je krijgt een e-mail om een nieuw wachtwoord te kiezen.'); }
  catch(e){ toast(authMsg(e)); }
});
$('#googleBtn').addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e){ toast(authMsg(e)); }
});
$('#logout').addEventListener('click', () => signOut(auth));
$('#accountBtn').addEventListener('click', () => {
  const m = $('#accountMenu'); m.hidden = !m.hidden;
});

onAuthStateChanged(auth, onUser);

function onUser(user){
  state.user = user;
  if (unsubCars) { unsubCars(); unsubCars = null; }
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
  state.cars = []; state.entries = []; state.carId = null; state.carsLoaded = false;
  if (!user){
    $('#topright').hidden = true;
    status('');
    setAuthMode(false);
    if (pendingJoin) $('#authIntro').textContent = 'Log in of maak een account om mee te doen met de auto waarvoor je bent uitgenodigd.';
    show('auth');
    return;
  }
  $('#topright').hidden = false;
  $('#accountBtn').textContent = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
  $('#accountBtn').setAttribute('aria-label', 'Account');
  $('#accountEmail').textContent = user.email || user.displayName || '';
  show(null);
  if (pendingJoin){ startJoin(); return; }
  listenCars();
}

/* ---------- uitnodiging ---------- */
async function startJoin(){
  const id = pendingJoin;
  try {
    const snap = await getDoc(doc(db, 'cars', id));
    if (snap.exists()){ finishJoin(id); return; }   // al lid
    toast('Deze uitnodiging hoort bij een auto die niet meer bestaat.');
    finishJoin(null);
  } catch(e){
    if (String(e.code).includes('permission-denied')){
      $('#joinName').value = (state.user.displayName || '').split(' ')[0];
      show('join');
    } else { toast('De uitnodiging kon niet worden geopend. Controleer je verbinding.'); finishJoin(null); }
  }
}
function finishJoin(carId){
  pendingJoin = null;
  try { sessionStorage.removeItem('pendingJoin'); } catch(e){}
  history.replaceState(null, '', location.pathname);
  if (carId) store.set('lastCar', carId);
  show(null);
  listenCars();
}
$('#joinForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const name = $('#joinName').value.trim(), id = pendingJoin;
  if (!name) return;
  try {
    await updateDoc(doc(db, 'cars', id), { memberUids: arrayUnion(state.user.uid), members: arrayUnion(name) });
    store.set('me:'+id, name);
    toast('Je doet nu mee');
    finishJoin(id);
  } catch(e){
    console.error(e);
    toast('Meedoen lukte niet. Vraag om een nieuwe uitnodigingslink.');
  }
});
$('#joinCancel').addEventListener('click', () => finishJoin(null));

$('#inviteBtn').addEventListener('click', async () => {
  const c = car(); if (!c) return;
  const url = location.origin + location.pathname + '?join=' + encodeURIComponent(c.id);
  const text = `Doe mee met ${c.name} in Deelrit, dan houden we samen de kilometers en tankbonnen bij.`;
  if (navigator.share){
    try { await navigator.share({ title:'Deelrit', text, url }); return; } catch(e){ if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link gekopieerd. Plak hem in je groepsapp.'); }
  catch(e){ window.prompt?.('Kopieer deze link:', url); }
});

/* ---------- gegevens volgen ---------- */
function listenCars(){
  if (unsubCars) return;
  status('Gegevens laden…');
  const q = query(collection(db, 'cars'), where('memberUids', 'array-contains', state.user.uid));
  unsubCars = onSnapshot(q, snap => {
    state.cars = snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
    state.carsLoaded = true;
    status('');
    if (!car()){
      const last = store.get('lastCar');
      const pick = state.cars.find(c => c.id === last) || state.cars[0];
      if (pick) selectCar(pick.id); else { state.carId = null; render(); }
    } else render();
  }, e => { console.error(e); status('De auto\'s konden niet worden geladen. Herlaad de app.'); });
}
function selectCar(id){
  state.carId = id; state.entries = [];
  tripPicked = null;
  store.set('lastCar', id);
  $('#tripStart').dataset.touched = '';
  if (unsubEntries) unsubEntries();
  unsubEntries = onSnapshot(collection(db, 'cars', id, 'entries'), snap => {
    state.entries = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render();
  }, e => { console.error(e); });
  render();
}

/* ---------- rekenen ---------- */
const car = () => state.cars.find(c => c.id === state.carId);
const sorted = () => [...state.entries].sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
// Wie zaten in de auto? Oudere ritten hebben één 'person', nieuwe een lijst 'people'.
const peopleOf = e => (e.people && e.people.length) ? e.people : (e.person ? [e.person] : []);
const ALL = '__iedereen';
function currentKm(){
  let km = Number(car()?.odoStart) || 0;
  for (const e of state.entries){
    if (e.type === 'trip') km = Math.max(km, e.endKm || 0);
    if (e.type === 'fuel' && e.odometer) km = Math.max(km, e.odometer);
  }
  return km;
}
// Kilometers per persoon sinds de laatste tankbeurt. Samen gereden km worden gelijk gedeeld.
export function kmSinceFuel(entries){
  const es = [...entries].sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
  let last = -1;
  es.forEach((e,i) => { if (e.type === 'fuel') last = i; });
  const kmBy = {};
  for (const t of es.slice(last+1)){
    if (t.type !== 'trip') continue;
    const ppl = peopleOf(t); if (!ppl.length) continue;
    const each = (t.endKm - t.startKm) / ppl.length;
    for (const p of ppl) kmBy[p] = (kmBy[p]||0) + each;
  }
  return kmBy;
}
const openPeriod = () => kmSinceFuel(state.entries);
// Ontbrekende kilometers: de nieuwe stand ligt hoger dan de laatst bekende.
function gapFor(newStart){ const last = currentKm(); return (!isNaN(newStart) && newStart > last) ? { from:last, to:newStart, km:newStart-last } : null; }
function gapPeople(sel){ return sel.value === ALL ? [...(car()?.members||[])] : [sel.value]; }
function fillGapSelect(sel){
  const members = car()?.members || [];
  const cur = sel.value;
  sel.innerHTML = `<option value="${ALL}">Weet ik niet, verdeel over iedereen</option>` + members.map(n => `<option>${esc(n)}</option>`).join('');
  sel.value = (cur === ALL || members.includes(cur)) ? cur : ALL;
}
let tripPicked = null; // namen die aangevinkt zijn in het ritformulier
export function splitCents(cents, kmBy, members){
  let weights = Object.fromEntries(Object.entries(kmBy).filter(([,k]) => k > 0));
  let byKm = true;
  if (!Object.keys(weights).length){ weights = Object.fromEntries(members.map(m => [m,1])); byKm = false; }
  const total = Object.values(weights).reduce((a,b)=>a+b,0);
  const raw = Object.entries(weights).map(([n,w]) => ({ n, exact: cents*w/total }));
  raw.forEach(r => r.c = Math.floor(r.exact));
  let rest = cents - raw.reduce((a,r)=>a+r.c,0);
  raw.sort((a,b) => (b.exact-b.c) - (a.exact-a.c));
  for (let i=0; rest>0 && raw.length; i=(i+1)%raw.length, rest--) raw[i].c++;
  return { shares: Object.fromEntries(raw.map(r => [r.n, r.c])), byKm };
}
const lastFuel = () => sorted().filter(e => e.type === 'fuel').pop();
const amountText = c => (c/100).toFixed(2).replace('.', ',');

/* ---------- weergave ---------- */
function fillSelect(sel, names, preferred){
  const cur = sel.value;
  sel.innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
  sel.value = names.includes(cur) ? cur : (names.includes(preferred) ? preferred : names[0] || '');
}
function me(){
  const saved = store.get('me:'+state.carId);
  if (saved) return saved;
  const first = (state.user?.displayName || '').split(' ')[0];
  return (car()?.members||[]).find(m => m.toLowerCase() === first.toLowerCase()) || '';
}

function renderCars(){
  $('#cars').innerHTML = state.cars.map(c => `<button class="chip" type="button" data-car="${esc(c.id)}" aria-pressed="${c.id===state.carId}">${esc(c.name)}</button>`).join('')
    + `<button class="chip add" type="button" id="addCar">+ Auto</button>`;
  const busy = !$('#newcar').hidden || !$('#join').hidden || !$('#accountMenu').hidden;
  $('#empty').hidden = busy || !state.carsLoaded || state.cars.length > 0;
  $('#main').hidden = !car();
}

function render(){
  renderCars();
  const c = car(); if (!c) return;
  const members = c.members || [];
  $('#carTitle').textContent = c.name;
  const pv = $('#carPlateView'); pv.textContent = c.plate || ''; pv.hidden = !c.plate;

  const km = currentKm();
  const digits = String(Math.round(km)).padStart(6,'0').split('');
  $('#odo').innerHTML = digits.map((d,i) => `<span class="d${i===digits.length-1?' last':''}">${d}</span>`).join('') + '<span class="u">km</span>';

  fillSelect($('#meSel'), members, me());
  fillSelect($('#fuelPerson'), members, me());
  renderPeople();
  fillGapSelect($('#tripGapWho'));
  fillGapSelect($('#fuelGapWho'));
  const ts = $('#tripStart');
  if (!ts.dataset.touched) ts.value = km || '';
  tripHint();
  fuelGap();
  fuelPreview();

  // Tikkies van de laatste tankbeurt: wie getankt heeft, ziet wie hij wat moet vragen.
  const f = lastFuel();
  if (!f){
    $('#tikkie').innerHTML = `<p class="muted">Nog niet getankt. Na de eerste tankbon zie je hier aan wie je een Tikkie stuurt en voor hoeveel.</p>`;
  } else {
    const rows = Object.entries(f.shares || {}).filter(([n,c]) => n !== f.person && c > 0).sort((a,b) => b[1]-a[1]);
    const iPaid = me() === f.person;
    const mine = f.shares?.[me()];
    const head = iPaid ? 'Stuur een Tikkie naar' : `${esc(f.person)} stuurt een Tikkie naar`;
    $('#tikkie').innerHTML =
      `<div class="tk-head"><span class="label">Laatste tankbeurt · ${fmtDate(f.date)}</span>
        <div><b>${iPaid ? 'Jij' : esc(f.person)}</b> ${iPaid ? 'hebt' : 'heeft'} getankt voor <b class="num">${eur(f.amountCents)}</b></div></div>` +
      (!iPaid && mine ? `<div class="tk-you">Jouw deel: <b class="num">${eur(mine)}</b> aan ${esc(f.person)}</div>` : '') +
      (rows.length
        ? `<div class="label">${head}</div><ul class="tk-list">${rows.map(([n,c]) =>
            `<li class="${n === me() ? 'is-me' : ''}"><span>${esc(n)}${f.kmBy?.[n] ? ` <span class="muted">${kmf(f.kmBy[n])} km</span>` : ''}</span>
             <span class="num amt">${eur(c)}</span>
             ${iPaid ? `<button class="copy" type="button" data-copy="${amountText(c)}" aria-label="Bedrag voor ${esc(n)} kopiëren">Kopieer</button>` : ''}</li>`).join('')}</ul>`
        : `<p class="muted">${esc(f.person)} heeft als enige gereden, dus er hoeft niemand iets te betalen.</p>`);
  }

  const p = openPeriod();
  const pt = Object.values(p).reduce((a,b)=>a+b,0);
  $('#period').innerHTML = `<div class="label">Gereden sinds de laatste tankbeurt</div>` + (pt
    ? Object.entries(p).sort((a,b)=>b[1]-a[1]).map(([n,k]) => `<div class="bal-row"><span>${esc(n)}</span><span class="num">${kmf(k)} km <span class="muted">· ${Math.round(k/pt*100)}%</span></span></div>`).join('')
    : `<span class="muted">Nog geen ritten. De volgende tankbon wordt naar deze kilometers verdeeld.</span>`);

  const es = sorted().reverse();
  $('#log').innerHTML = es.length ? es.map(e => {
    let pill, main, meta;
    if (e.type === 'trip' && e.gap){
      const ppl = peopleOf(e), all = ppl.length > 1 && ppl.length === members.length && members.every(m => ppl.includes(m));
      pill = '<span class="pill miss">Niet ingevuld</span>';
      main = `${kmf(e.endKm - e.startKm)} km zonder rit`;
      meta = `${fmtDate(e.date)} · ${kmf(e.startKm)} → ${kmf(e.endKm)} · ${all ? 'verdeeld over iedereen' : 'toegewezen aan ' + ppl.map(esc).join(', ')}`;
    } else if (e.type === 'trip'){
      const ppl = peopleOf(e), d = e.endKm - e.startKm;
      pill = '<span class="pill trip">Rit</span>';
      main = ppl.length > 1
        ? `${ppl.map(esc).join(' en ').replace(/ en (?=.* en )/g, ', ')} reden samen ${kmf(d)} km`
        : `${esc(ppl[0])} reed ${kmf(d)} km`;
      meta = `${fmtDate(e.date)} · ${kmf(e.startKm)} → ${kmf(e.endKm)}${ppl.length > 1 ? ` · ${kmf(d/ppl.length)} km per persoon` : ''}`;
    } else if (e.type === 'fuel'){
      pill = '<span class="pill fuel">Tanken</span>';
      main = `${esc(e.person)} tankte voor ${eur(e.amountCents)}${e.liters ? ` <span class="muted">(${String(e.liters).replace('.',',')} L)</span>` : ''}`;
      const parts = Object.entries(e.shares||{}).map(([n,ct]) => `${esc(n)} ${eur(ct)}${e.kmBy?.[n] ? ` (${kmf(e.kmBy[n])} km)` : ''}`).join(' · ');
      meta = `${fmtDate(e.date)}${e.odometer ? ` · bij ${kmf(e.odometer)} km` : ''} · ${e.byKm === false ? 'gelijk verdeeld' : 'verdeeld'}: ${parts}`;
    } else {
      return ''; // oudere regels die niet meer gebruikt worden
    }
    return `<li>${pill}<div style="min-width:0"><div class="main">${main}</div><div class="meta">${meta}</div></div><button class="del" type="button" data-del="${esc(e.id)}">Verwijder</button></li>`;
  }).join('') : `<li style="grid-template-columns:1fr"><span class="muted">Nog niets vastgelegd. Begin met je eerste rit hierboven.</span></li>`;

  $('#members').innerHTML = members.map(m => `<span class="member">${esc(m)}<button type="button" data-rm="${esc(m)}" aria-label="${esc(m)} verwijderen">×</button></span>`).join('');
  const n = (c.memberUids||[]).length;
  $('#accountsHint').textContent = `${n} ${n === 1 ? 'account heeft' : 'accounts hebben'} toegang tot deze auto.`;
}

function renderPeople(){
  const members = car()?.members || [];
  if (!tripPicked) tripPicked = new Set(me() ? [me()] : []);
  for (const n of [...tripPicked]) if (!members.includes(n)) tripPicked.delete(n);
  $('#tripPeople').innerHTML = members.map((n,i) =>
    `<label><input type="checkbox" id="pp${i}" value="${esc(n)}" ${tripPicked.has(n) ? 'checked' : ''}>${esc(n)}</label>`).join('');
  peopleHint();
}
function peopleHint(){
  const n = tripPicked?.size || 0;
  const e = parseNum($('#tripEnd').value), s = parseNum($('#tripStart').value);
  const d = (!isNaN(e) && !isNaN(s) && e > s) ? e - s : 0;
  $('#peopleHint').textContent = n > 1
    ? (d ? `Samen ${kmf(d)} km, dat is ${kmf(d/n)} km per persoon.` : `Jullie delen de kilometers van deze rit met ${({2:"z'n tweeën",3:"z'n drieën",4:"z'n vieren",5:"z'n vijven"})[n] || n + ' personen'}.`)
    : 'Rijden jullie samen? Vink iedereen aan, dan worden de kilometers gedeeld.';
}
function tripHint(){
  const s = parseNum($('#tripStart').value), e = parseNum($('#tripEnd').value);
  const h = $('#tripHint'), last = currentKm();
  const g = gapFor(s);
  $('#tripGap').hidden = !g;
  if (g) $('#tripGapText').innerHTML = `<b>Er missen ${kmf(g.km)} km.</b> De laatst bekende stand is ${kmf(g.from)}, maar je beginstand is ${kmf(g.to)}. Iemand is vergeten zijn rit in te vullen.`;
  if (!isNaN(s) && s < last) h.textContent = `Let op: je beginstand is lager dan de laatst bekende stand (${kmf(last)}). Zo worden kilometers dubbel geteld.`;
  else if (!isNaN(s) && !isNaN(e)) h.textContent = e > s ? `Dat is ${kmf(e-s)} km.` : 'De eindstand moet hoger zijn dan de beginstand.';
  else h.textContent = 'De beginstand is de laatst bekende stand. Klopt die niet met de teller? Pas hem aan.';
  peopleHint();
}
function fuelGap(){
  const g = gapFor(parseNum($('#fuelOdo').value));
  $('#fuelGap').hidden = !g;
  if (g) $('#fuelGapText').innerHTML = `<b>Er missen ${kmf(g.km)} km.</b> De laatst bekende stand is ${kmf(g.from)}. Die kilometers tellen mee in deze tankbon.`;
}
// De ritten van deze periode plus eventuele ontbrekende km uit het tankformulier.
function periodWithFuelGap(){
  const g = gapFor(parseNum($('#fuelOdo').value));
  if (!g) return openPeriod();
  return kmSinceFuel([...state.entries, { type:'trip', people:gapPeople($('#fuelGapWho')), startKm:g.from, endKm:g.to, createdAt:Date.now() }]);
}
function fuelPreview(){
  const c = car(); if (!c) return;
  const amt = parseNum($('#fuelAmount').value);
  const p = periodWithFuelGap();
  const box = $('#fuelPreview');
  if (isNaN(amt) || amt <= 0){
    const pt = Object.values(p).reduce((a,b)=>a+b,0);
    box.innerHTML = pt ? `<span>Vul het bedrag in om te zien wie wat betaalt. Er is ${kmf(pt)} km gereden sinds de vorige tankbeurt.</span>`
                       : `<span>Er zijn nog geen ritten sinds de vorige tankbeurt. Het bedrag wordt dan gelijk verdeeld over alle leden.</span>`;
    return;
  }
  const { shares, byKm } = splitCents(Math.round(amt*100), p, c.members||[]);
  box.innerHTML = `<span class="label">${byKm ? 'Verdeling naar gereden km' : 'Gelijk verdeeld (geen ritten)'}</span>` +
    Object.entries(shares).map(([n,ct]) => `<div class="bal-row"><span>${esc(n)}${p[n] ? ` <span class="muted">${kmf(p[n])} km</span>` : ''}</span><span class="num amt">${eur(ct)}</span></div>`).join('');
}

/* ---------- acties ---------- */
const entriesCol = () => collection(db, 'cars', state.carId, 'entries');

document.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.copy){
    navigator.clipboard.writeText(t.dataset.copy)
      .then(() => { t.textContent = 'Gekopieerd'; setTimeout(() => t.textContent = 'Kopieer', 1800); })
      .catch(() => toast(`Bedrag: € ${t.dataset.copy}`));
    return;
  }
  if (t.dataset.car){ $('#accountMenu').hidden = true; selectCar(t.dataset.car); return; }
  if (t.id === 'addCar' || t.id === 'emptyAdd'){
    $('#newcar').hidden = false; $('#empty').hidden = true; $('#accountMenu').hidden = true;
    const first = (state.user?.displayName || '').split(' ')[0];
    if (first && !$('#carMembers').value) $('#carMembers').value = first + ', ';
    $('#carName').focus(); return;
  }
  if (t.id === 'cancelCar'){ $('#newcar').hidden = true; renderCars(); return; }
  if (t.dataset.tab){
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b === t));
    document.querySelectorAll('form[data-pane]').forEach(f => f.hidden = f.dataset.pane !== t.dataset.tab);
    return;
  }
  if (t.dataset.del){
    if (!confirmTap(t, 'Zeker?')) return;
    const ref = doc(db, 'cars', state.carId, 'entries', t.dataset.del);
    fire(writeBatch(db).delete(ref).commit());
    toast('Verwijderd');
    return;
  }
  if (t.dataset.rm){
    if (!confirmTap(t, '✓')) return;
    fire(updateDoc(doc(db, 'cars', state.carId), { members: arrayRemove(t.dataset.rm) }));
    toast(`${t.dataset.rm} is uit de lijst gehaald`);
    return;
  }
  if (t.id === 'leaveCar'){
    if (!confirmTap(t, 'Klik nogmaals om de auto te verlaten')) return;
    const id = state.carId;
    state.carId = null;
    if (unsubEntries){ unsubEntries(); unsubEntries = null; }
    fire(updateDoc(doc(db, 'cars', id), { memberUids: arrayRemove(state.user.uid) }));
    toast('Je hebt de auto verlaten');
    return;
  }
  if (t.id === 'delCar'){
    if (!confirmTap(t, 'Klik nogmaals: auto en logboek wissen voor iedereen')) return;
    const id = state.carId, ids = state.entries.map(e => e.id);
    state.carId = null;
    if (unsubEntries){ unsubEntries(); unsubEntries = null; }
    // per 400 regels in één keer verwijderen; de auto zelf als laatste
    const chunks = [];
    for (let i = 0; i < ids.length; i += 400) chunks.push(ids.slice(i, i+400));
    (async () => {
      for (const ch of chunks){ const b = writeBatch(db); ch.forEach(eid => b.delete(doc(db,'cars',id,'entries',eid))); await b.commit(); }
      const b = writeBatch(db); b.delete(doc(db,'cars',id)); await b.commit();
    })().catch(fail);
    toast('Auto verwijderd');
  }
});
function confirmTap(btn, label){
  if (btn.classList.contains('confirm')) return true;
  const old = btn.textContent;
  btn.classList.add('confirm'); btn.textContent = label;
  setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = old; }, 3500);
  return false;
}

$('#meSel').addEventListener('change', e => { store.set('me:'+state.carId, e.target.value); render(); });
$('#tripStart').addEventListener('input', e => { e.target.dataset.touched = '1'; tripHint(); });
$('#tripEnd').addEventListener('input', tripHint);
$('#tripPeople').addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  if (e.target.checked) tripPicked.add(e.target.value); else tripPicked.delete(e.target.value);
  peopleHint();
});
$('#fuelAmount').addEventListener('input', fuelPreview);
$('#fuelOdo').addEventListener('input', () => { fuelGap(); fuelPreview(); });
$('#fuelGapWho').addEventListener('change', fuelPreview);

// Slaat ontbrekende km op als aparte regel, vlak vóór de rit of tankbon die ze aan het licht bracht.
function saveGap(g, sel, t){
  fire(addDoc(entriesCol(), { type:'trip', gap:true, people:gapPeople(sel), startKm:Math.round(g.from), endKm:Math.round(g.to),
    date:today(), createdAt:t - 1, by: state.user.uid }));
}

$('#carForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('#carName').value.trim();
  const members = [...new Set($('#carMembers').value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean))];
  const odo = parseNum($('#carOdo').value);
  if (!name || !members.length || isNaN(odo)){ toast('Vul een naam, de kilometerstand en minstens één persoon in.'); return; }
  const ref = doc(collection(db, 'cars'));
  fire(setDoc(ref, {
    name, plate: $('#carPlate').value.trim(), members, odoStart: Math.round(odo),
    ownerUid: state.user.uid, memberUids: [state.user.uid], createdAt: Date.now()
  }));
  const first = (state.user.displayName || '').split(' ')[0];
  const mine = members.find(m => m.toLowerCase() === first.toLowerCase());
  if (mine) store.set('me:'+ref.id, mine);
  ev.target.reset(); $('#newcar').hidden = true;
  toast(`${name} is aangemaakt. Nodig nu de anderen uit.`);
  store.set('lastCar', ref.id);
  state.carId = null; // de snapshot kiest de nieuwe auto
  selectCar(ref.id);
});

$('#tripForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const s = parseNum($('#tripStart').value), e = parseNum($('#tripEnd').value);
  if (isNaN(s) || isNaN(e) || e <= s){ toast('Controleer de begin- en eindstand.'); return; }
  if (e - s > 3000){ toast('Meer dan 3000 km in één rit? Controleer de standen.'); return; }
  const people = (car().members || []).filter(n => tripPicked.has(n));
  if (!people.length){ toast('Vink aan wie er mee reden.'); return; }
  const t = Date.now(), g = gapFor(s);
  if (g) saveGap(g, $('#tripGapWho'), t);
  fire(addDoc(entriesCol(), { type:'trip', people, person:people[0], startKm:Math.round(s), endKm:Math.round(e), date:$('#tripDate').value || today(), createdAt:t, by: state.user.uid }));
  $('#tripEnd').value = ''; $('#tripStart').dataset.touched = '';
  $('#tripGapWho').value = ALL;
  tripPicked = null;
  toast(g ? `Rit en ${kmf(g.km)} ontbrekende km opgeslagen` : 'Rit opgeslagen');
});

$('#fuelForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const amt = parseNum($('#fuelAmount').value);
  if (isNaN(amt) || amt <= 0){ toast('Vul het bedrag van de tankbon in.'); return; }
  const odo = parseNum($('#fuelOdo').value);
  if (!isNaN(odo) && odo < currentKm()){ toast(`De stand bij de pomp is lager dan de laatst bekende stand (${kmf(currentKm())}). Controleer hem.`); return; }
  const cents = Math.round(amt*100), kmBy = periodWithFuelGap();
  const { shares, byKm } = splitCents(cents, kmBy, car().members || []);
  const liters = parseNum($('#fuelLiters').value);
  const t = Date.now(), g = gapFor(odo);
  if (g) saveGap(g, $('#fuelGapWho'), t);
  const rounded = Object.fromEntries(Object.entries(kmBy).map(([n,k]) => [n, Math.round(k*10)/10]));
  fire(addDoc(entriesCol(), { type:'fuel', person:$('#fuelPerson').value, amountCents:cents, liters:isNaN(liters) ? null : liters,
    odometer:isNaN(odo) ? null : Math.round(odo), shares, kmBy:rounded, byKm, date:$('#fuelDate').value || today(), createdAt:t, by: state.user.uid }));
  $('#fuelAmount').value = ''; $('#fuelLiters').value = ''; $('#fuelOdo').value = '';
  $('#fuelGapWho').value = ALL;
  toast('Tankbon verdeeld. Hieronder zie je de Tikkies.');
  setTimeout(() => $('#tikkie').scrollIntoView({ behavior:'smooth', block:'center' }), 150);
});

$('#memberForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const n = $('#memberName').value.trim(), c = car();
  if (!n || c.members.includes(n)) return;
  fire(updateDoc(doc(db, 'cars', c.id), { members: arrayUnion(n) }));
  $('#memberName').value = '';
  toast(`${n} is toegevoegd`);
});

['#tripDate','#fuelDate'].forEach(s => $(s).value = today());

/* ---------- offline werken ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('offline', () => status('Je bent offline. Wat je invoert, wordt opgeslagen zodra je weer verbinding hebt.'));
window.addEventListener('online', () => status(''));
