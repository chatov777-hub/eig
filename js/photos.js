/* photos.js — фото в IndexedDB: сжатие, миниатюры, сетка, полноэкранный вьюер.
   Экспортирует: Photos, addPhotos(), renderPhotoGrid(), openViewer(), bindPhotoUI(),
   photoDates(). Фото не входят в JSON-экспорт. */

const DB_NAME = "eig", DB_VER = 1, PH_STORE = "photos";
var _dbP = null;
var _urlCache = new Map();

var Photos = {
  open(){
    if(_dbP) return _dbP;
    _dbP = new Promise((res, rej)=>{
      if(!window.indexedDB){ rej(new Error("IndexedDB недоступна")); return; }
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = ()=>{
        const db = rq.result;
        if(!db.objectStoreNames.contains(PH_STORE))
          db.createObjectStore(PH_STORE, {keyPath:"id"}).createIndex("date", "date");
      };
      rq.onsuccess = ()=>res(rq.result);
      rq.onerror = ()=>rej(rq.error);
    });
    return _dbP;
  },
  async _tx(mode){
    const db = await Photos.open();
    return db.transaction(PH_STORE, mode).objectStore(PH_STORE);
  },
  async add(date, fileList){
    const ids = [];
    for(const f of Array.from(fileList||[])){
      if(!/^image\//.test(f.type||"")) continue;
      const blob  = await compress(f, 1280, 0.8);
      const thumb = await compress(f, 240, 0.7);
      const dim   = await dims(blob);
      const rec = {id: uid("p"), date, blob, thumb, w: dim.w, h: dim.h, createdAt: nowISO()};
      await new Promise(async (res, rej)=>{
        const st = await Photos._tx("readwrite");
        const rq = st.add(rec);
        rq.onsuccess = res; rq.onerror = ()=>rej(rq.error);
      });
      ids.push(rec.id);
    }
    return ids;
  },
  async list(date){
    const st = await Photos._tx("readonly");
    return new Promise((res, rej)=>{
      const out = [];
      const rq = st.index("date").openCursor(IDBKeyRange.only(date));
      rq.onsuccess = ()=>{
        const c = rq.result;
        if(!c){ res(out); return; }
        const v = c.value;
        out.push({id:v.id, date:v.date, w:v.w, h:v.h, createdAt:v.createdAt});
        c.continue();
      };
      rq.onerror = ()=>rej(rq.error);
    });
  },
  async get(id){
    const st = await Photos._tx("readonly");
    return new Promise((res, rej)=>{
      const rq = st.get(id);
      rq.onsuccess = ()=>res(rq.result || null);
      rq.onerror = ()=>rej(rq.error);
    });
  },
  async url(id, thumb){
    const key = id + (thumb ? ":t" : ":f");
    if(_urlCache.has(key)) return _urlCache.get(key);
    const rec = await Photos.get(id);
    if(!rec) return null;
    const u = URL.createObjectURL(thumb ? (rec.thumb || rec.blob) : rec.blob);
    _urlCache.set(key, u);
    return u;
  },
  async remove(id){
    const st = await Photos._tx("readwrite");
    await new Promise((res, rej)=>{
      const rq = st.delete(id);
      rq.onsuccess = res; rq.onerror = ()=>rej(rq.error);
    });
    ["", ":t", ":f"].forEach(sfx=>{
      const k = id + sfx;
      if(_urlCache.has(k)){ try{ URL.revokeObjectURL(_urlCache.get(k)); }catch(e){} _urlCache.delete(k); }
    });
  },
  async count(date){ return (await Photos.list(date)).length; },
  /* Set дат с фото — один проход по индексу, для маркеров месяца */
  async dates(){
    const st = await Photos._tx("readonly");
    return new Promise((res, rej)=>{
      const set = new Set();
      const rq = st.index("date").openKeyCursor();
      rq.onsuccess = ()=>{
        const c = rq.result;
        if(!c){ res(set); return; }
        set.add(c.key); c.continue();
      };
      rq.onerror = ()=>rej(rq.error);
    });
  },
  async put(rec){
    const st = await Photos._tx("readwrite");
    return new Promise((res, rej)=>{
      const rq = st.put(rec);
      rq.onsuccess = res; rq.onerror = ()=>rej(rq.error);
    });
  }
};

/* длинная сторона ≤ max, JPEG указанного качества; EXIF-поворот из файла */
async function compress(file, max, q){
  let bmp = null;
  try{ bmp = await createImageBitmap(file, {imageOrientation:"from-image"}); }
  catch(e){
    try{ bmp = await createImageBitmap(file); }
    catch(e2){ bmp = await imgFallback(file); }
  }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width*scale)), h = Math.max(1, Math.round(bmp.height*scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if(bmp.close) bmp.close();
  return new Promise(res=>{
    if(c.toBlob) c.toBlob(b=>res(b || file), "image/jpeg", q);
    else res(file);
  });
}
function imgFallback(file){
  return new Promise((res, rej)=>{
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = ()=>{ URL.revokeObjectURL(u); res(im); };
    im.onerror = ()=>{ URL.revokeObjectURL(u); rej(new Error("Не удалось прочитать изображение")); };
    im.src = u;
  });
}
async function dims(blob){
  try{
    const b = await createImageBitmap(blob);
    const d = {w: b.width, h: b.height};
    if(b.close) b.close();
    return d;
  }catch(e){ return {w:0, h:0}; }
}

/* ---------- UI ---------- */
var _photoTarget = today();
function addPhotos(date){
  _photoTarget = date || today();
  const inp = $("photoInput");
  inp.value = "";
  inp.click();
}
async function renderPhotoGrid(box, date){
  if(!box) return;
  let list = [];
  try{ list = await Photos.list(date); }
  catch(e){ box.innerHTML = ""; return; }
  if(!list.length){ box.innerHTML = ""; return; }
  const urls = await Promise.all(list.map(p=>Photos.url(p.id, true)));
  box.innerHTML = list.map((p,i)=>
    '<img src="'+urls[i]+'" alt="Фото '+esc(p.date)+'" data-photo="'+p.id+'" data-pdate="'+esc(p.date)+'" loading="lazy">'
  ).join("");
}

var _viewer = {ids:[], i:0, date:null};
async function openViewer(date, id){
  const list = await Photos.list(date);
  if(!list.length) return;
  _viewer = {ids: list.map(p=>p.id), i: Math.max(0, list.findIndex(p=>p.id === id)), date};
  await showViewer();
  const d = $("viewer");
  if(d.showModal && !d.open) d.showModal();
}
async function showViewer(){
  const id = _viewer.ids[_viewer.i];
  if(!id){ closeViewer(); return; }
  const u = await Photos.url(id, false);
  $("viewerImg").innerHTML = '<img src="'+u+'" alt="Фото">';
  const d = new Date(_viewer.date + "T00:00:00").toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"});
  $("viewerCap").textContent = d + " · " + (_viewer.i+1) + " из " + _viewer.ids.length;
}
function closeViewer(){
  const d = $("viewer");
  if(d.open) d.close();
}
function viewerStep(n){
  if(!_viewer.ids.length) return;
  _viewer.i = (_viewer.i + n + _viewer.ids.length) % _viewer.ids.length;
  showViewer();
}

function bindPhotoUI(){
  $("photoInput").addEventListener("change", async ()=>{
    const files = $("photoInput").files;
    if(!files || !files.length) return;
    toast("Сохраняю фото…");
    try{
      const ids = await Photos.add(_photoTarget, files);
      if(current && current.date === _photoTarget){
        current.photos = (current.photos||[]).concat(ids);
        saveDraft();
      }
      const day = sessionsOn(_photoTarget);
      const s = day[day.length - 1];        // цепляем к последней тренировке этого дня
      if(s && !current){
        s.photos = (s.photos||[]).concat(ids);
        Store.upsert("sessions", s);
      }
      toast(ids.length ? ("Добавлено фото: " + ids.length) : "Не выбрано изображений");
      renderPhotoGrid($("trainPhotos"), today());
      renderCalendar(); renderCalDetail();
    }catch(e){ toast("Не удалось сохранить фото: " + (e.message||e)); }
    $("photoInput").value = "";
  });
  $("photoBtnTrain").addEventListener("click", ()=>addPhotos(today()));
  $("viewerPrev").addEventListener("click", ()=>viewerStep(-1));
  $("viewerNext").addEventListener("click", ()=>viewerStep(1));
  $("viewerClose").addEventListener("click", closeViewer);
  $("viewerDel").addEventListener("click", async ()=>{
    const id = _viewer.ids[_viewer.i];
    if(!id) return;
    await Photos.remove(id);
    _viewer.ids.splice(_viewer.i, 1);
    if(_viewer.i >= _viewer.ids.length) _viewer.i = Math.max(0, _viewer.ids.length-1);
    toast("Фото удалено");
    if(!_viewer.ids.length) closeViewer(); else showViewer();
    renderPhotoGrid($("trainPhotos"), today());
    renderCalendar(); renderCalDetail();
  });
  $("viewer").addEventListener("keydown", e=>{
    if(e.key === "ArrowLeft") viewerStep(-1);
    if(e.key === "ArrowRight") viewerStep(1);
  });
  let sx = 0;
  $("viewerImg").addEventListener("touchstart", e=>{ sx = e.touches[0].clientX; }, {passive:true});
  $("viewerImg").addEventListener("touchend", e=>{
    const dx = e.changedTouches[0].clientX - sx;
    if(Math.abs(dx) > 50) viewerStep(dx < 0 ? 1 : -1);
  }, {passive:true});
  document.addEventListener("click", e=>{
    const im = e.target.closest("[data-photo]");
    if(im) openViewer(im.dataset.pdate, im.dataset.photo);
  });
}
