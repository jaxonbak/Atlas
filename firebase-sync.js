// Atlas - Firebase sync layer
// One private document per signed-in owner. localStorage stays as the offline cache.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const OWNER_EMAIL = 'jaxonbak@gmail.com';

const app = initializeApp(window.__ATLAS_CONFIG__);
const auth = getAuth(app);
const db = getFirestore(app);

let ref = null;
let unsub = null;
let saveTimer = null;
let lastPushed = '';

function notify() { if (window.onCloudStatus) window.onCloudStatus(); }
function fail(err) {
  AT.status = 'error';
  AT.lastError = (err && err.code) ? err.code : String(err);
  notify();
}

const AT = {
  user: null,
  isOwner: false,
  status: 'signed-out',
  lastError: '',

  signIn: function () { signInWithPopup(auth, new GoogleAuthProvider()).catch(fail); },
  signOut: function () { signOut(auth); },

  push: function (payload) {
    if (!AT.isOwner || !ref) return;
    const body = JSON.stringify(payload);
    if (body === lastPushed) return;
    lastPushed = body;
    if (saveTimer) clearTimeout(saveTimer);
    AT.status = 'saving';
    notify();
    saveTimer = setTimeout(function () {
      setDoc(ref, {
        world: payload.world || {},
        us: payload.us || {},
        updatedAt: Date.now()
      }).then(function () { AT.status = 'synced'; notify(); }).catch(fail);
    }, 400);
  }
};

window.AT = AT;

onAuthStateChanged(auth, async function (user) {
  if (unsub) { unsub(); unsub = null; }
  AT.user = user || null;
  AT.isOwner = !!(user && user.email === OWNER_EMAIL);
  ref = AT.isOwner ? doc(db, 'users', user.uid) : null;
  AT.status = user ? (AT.isOwner ? 'connecting' : 'not-owner') : 'signed-out';
  notify();
  if (!ref) return;

  try {
    // First sign-in on a new backend: seed the cloud with whatever this browser already has.
    const snap = await getDoc(ref);
    if (!snap.exists() && window.getLocalAtlas) {
      const local = window.getLocalAtlas();
      if (Object.keys(local.world).length || Object.keys(local.us).length) {
        lastPushed = JSON.stringify(local);
        await setDoc(ref, { world: local.world, us: local.us, updatedAt: Date.now() });
      }
    }
  } catch (err) { fail(err); return; }

  unsub = onSnapshot(ref, function (snap) {
    const data = snap.exists() ? snap.data() : {};
    if (AT.status !== 'saving') AT.status = 'synced';
    lastPushed = JSON.stringify({ world: data.world || {}, us: data.us || {} });
    if (window.onCloudState) window.onCloudState({ world: data.world || {}, us: data.us || {} });
    notify();
  }, fail);
});
