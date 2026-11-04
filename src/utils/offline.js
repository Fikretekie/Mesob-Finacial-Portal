// Offline mode for the phone app (installed from index.js in the app shell only).
//
// Reads: every successful GET to our API is kept on the phone (IndexedDB); with
// no connection the last copy is served instead of an error.
// Writes: new transactions, trips and fuel purchases made offline are queued
// and sent, in order, when the connection returns. A receipt scan is queued as
// one job (photo upload → transaction with its link → IFTA fuel purchase).
//
// Everything is tagged with the signed-in userId and ignored for anyone else.

const DB_NAME = "mksv-offline";
const API_HOST = "execute-api.us-east-1.amazonaws.com";
const QUEUEABLE = /\/(Transaction|MileageTrip|FuelPurchase)(\?|$)/;
export const QUEUE_CHANGED = "mksv-offline-queue";

const currentUser = () => localStorage.getItem("userId") || "";
const isApi = (url) => typeof url === "string" && url.includes(API_HOST);

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("cache");
        req.result.createObjectStore("queue", { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Read cache ──────────────────────────────────────────────────────────────
export function cachePut(url, body) {
  return run("cache", "readwrite", (s) => s.put({ user: currentUser(), body, at: Date.now() }, url)).catch(() => {});
}

export async function cacheGet(url) {
  try {
    const hit = await run("cache", "readonly", (s) => s.get(url));
    return hit && hit.user === currentUser() ? hit.body : null;
  } catch (e) {
    return null;
  }
}

// ── Write queue ─────────────────────────────────────────────────────────────
async function announce() {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED, { detail: await queueCount() }));
}

export async function enqueue(job) {
  await run("queue", "readwrite", (s) => s.add({ ...job, user: currentUser(), at: Date.now() }));
  announce();
}

export async function queueCount() {
  try {
    const all = await run("queue", "readonly", (s) => s.getAll());
    return (all || []).filter((j) => j.user === currentUser()).length;
  } catch (e) {
    return 0;
  }
}

// The signed-in fetch underneath our wrapper: replays must not be re-queued by it.
let networkFetch = (...args) => window.fetch(...args);

async function post(url, body) {
  const res = await networkFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (res.status >= 500) throw new Error(`server ${res.status}`);
  return res;
}

async function send(job) {
  if (job.type === "http") {
    await post(job.url, job.body);
    return;
  }
  if (job.type === "scan") {
    let receiptUrl = "";
    if (job.upload) {
      const res = await post(job.upload.url, job.upload.body);
      receiptUrl = (await res.json().catch(() => ({}))).url || "";
    }
    await post(job.transaction.url, JSON.stringify({ ...job.transaction.data, receiptUrl }));
    if (job.fuel) await post(job.fuel.url, JSON.stringify(job.fuel.data));
  }
}

let flushing = null;

/** Sends queued writes in order; stops at the first network/server failure. */
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    const d = await db();
    const keys = await new Promise((resolve) => {
      const req = d.transaction("queue", "readonly").objectStore("queue").getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    let sent = 0;
    for (const key of keys) {
      const job = await run("queue", "readonly", (s) => s.get(key));
      if (!job) continue;
      if (job.user !== currentUser()) continue; // someone else's — waits for them
      try {
        await send(job);
      } catch (e) {
        break; // still offline or server trouble — keep the rest for next time
      }
      await run("queue", "readwrite", (s) => s.delete(key));
      sent++;
    }
    if (sent) {
      // Screens listening for these refetch, so synced items appear.
      window.dispatchEvent(new CustomEvent("mesob:transactionAdded", { detail: { source: "offline-sync" } }));
      window.dispatchEvent(new Event("mksv-trips-changed"));
    }
    announce();
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ── Wiring ──────────────────────────────────────────────────────────────────
const queuedResponse = () =>
  new Response(JSON.stringify({ queued: true }), { status: 202, headers: { "Content-Type": "application/json" } });

/** Call once at startup (phone app only), after the auth wrappers are installed. */
export function installOffline(axios) {
  const baseFetch = window.fetch;
  networkFetch = baseFetch;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!isApi(url)) return baseFetch(input, init);
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET") {
      try {
        const res = await baseFetch(input, init);
        if (res.ok) res.clone().text().then((body) => cachePut(url, body));
        return res;
      } catch (e) {
        const body = await cacheGet(url);
        if (body != null) return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
        throw e;
      }
    }
    if (method === "POST" && QUEUEABLE.test(url) && typeof init.body === "string") {
      try {
        if (navigator.onLine === false) throw new TypeError("offline");
        return await baseFetch(input, init);
      } catch (e) {
        await enqueue({ type: "http", url, body: init.body });
        return queuedResponse();
      }
    }
    return baseFetch(input, init);
  };

  axios.interceptors.response.use(
    (res) => {
      const { config } = res;
      if ((config.method || "get").toLowerCase() === "get" && isApi(config.url)) {
        cachePut(axios.getUri(config), JSON.stringify(res.data));
      }
      return res;
    },
    async (error) => {
      const config = error.config || {};
      // error.response set = the server answered (4xx/5xx): not an offline problem.
      if (error.response || !isApi(config.url)) throw error;
      const method = (config.method || "get").toLowerCase();
      if (method === "get") {
        const body = await cacheGet(axios.getUri(config));
        if (body != null) return { data: JSON.parse(body), status: 200, statusText: "OK", headers: {}, config, fromCache: true };
      } else if (method === "post" && QUEUEABLE.test(config.url) && typeof config.data === "string") {
        await enqueue({ type: "http", url: axios.getUri(config), body: config.data });
        return { data: { queued: true }, status: 202, statusText: "Queued", headers: {}, config };
      }
      throw error;
    }
  );

  window.addEventListener("online", () => flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) flushQueue();
  });
  if (navigator.onLine) flushQueue();
}

/** Signing out: drop this phone's cached data and anything unsent. */
export async function clearOfflineData() {
  try {
    await run("cache", "readwrite", (s) => s.clear());
    await run("queue", "readwrite", (s) => s.clear());
  } catch (e) {
    // Nothing stored.
  }
}
