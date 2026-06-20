const CACHE="alzipedia-v52";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>{}));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("alzipedia-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  // Supabase nie cachen (immer frische Daten/Bilder ueber das Netz)
  if(/supabase\.(co|in)/.test(url.hostname)||/fonts\.(googleapis|gstatic)/.test(url.hostname)){return;}
  if(req.mode==="navigate"){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put("./index.html",cp).catch(()=>{}));return r;}).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(c=>c||fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp).catch(()=>{}));return r;}).catch(()=>c)));
});