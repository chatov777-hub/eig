/* sync.js — снапшот, слияние по updatedAt, файловый и WebDAV-адаптеры.
   Экспортирует: Sync, FileAdapter, WebDavAdapter, renderSyncSettings(), deviceInfo().
   Ключи ИИ и пароли синхронизации в снапшот НЕ попадают. */

function deviceInfo(){
  const st = ls.get(K_SYNC, {}) || {};
  if(!st.deviceId){
    st.deviceId = uid("dev");
    st.deviceName = "Устройство " + st.deviceId.slice(-4);
    ls.set(K_SYNC, st);
  }
  return {id: st.deviceId, name: st.deviceName};
}
function syncLog(ok, msg){
  const st = ls.get(K_SYNC, {}) || {};
  st.log = [{at: nowISO(), ok: !!ok, msg: String(msg)}].concat(st.log || []).slice(0, 20);
  if(ok) st.lastSyncAt = nowISO();
  ls.set(K_SYNC, st);
}

var Sync = {
  snapshot(){
    const st = Settings.get();
    return {
      format: "eig-sync", version: 1,
      device: deviceInfo(),
      exportedAt: nowISO(),
      checkins: Store.raw("checkins"),
      sessions: Store.raw("sessions"),
      settings: {theme: st.theme, name: st.name, plan: st.plan,
                 todayOverride: st.todayOverride, updatedAt: st.updatedAt},
      content: ls.get(K_CONTENT, {}),
      motiv:   ls.get(K_MOTIV, {}),
      photos:  Sync._photoMeta
    };
  },
  _photoMeta: [],
  /* метаданные фото подтягиваются заранее — snapshot() синхронный */
  async prepare(){
    try{
      const dates = await Photos.dates();
      const all = [];
      for(const d of dates){
        (await Photos.list(d)).forEach(p=>all.push(p));
      }
      Sync._photoMeta = all;
    }catch(e){ Sync._photoMeta = []; }
    return Sync.snapshot();
  },

  /* побеждает запись с более новым updatedAt; тумбстоуны участвуют наравне */
  merge(remote){
    if(!remote || remote.format !== "eig-sync") throw new Error("Это не снапшот ЕИГ");
    let added = 0, updated = 0;
    ["checkins","sessions"].forEach(col=>{
      const local = Store.raw(col);
      const map = {};
      local.forEach(r=>{ map[r.id] = r; });
      (remote[col] || []).forEach(r=>{
        if(!r || !r.id) return;
        const l = map[r.id];
        if(!l){ map[r.id] = r; added++; }
        else if(String(r.updatedAt||"") > String(l.updatedAt||"")){ map[r.id] = r; updated++; }
      });
      const arr = Object.keys(map).map(k=>map[k]).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      Store.replaceAll(col, arr);
    });

    const st = Settings.get();
    const rs = remote.settings || {};
    const patch = {};
    if(rs.plan && String(rs.updatedAt||"") > String(st.updatedAt||"")) patch.plan = rs.plan;
    if(!st.name && rs.name) patch.name = rs.name;
    if((!st.theme || st.theme === "auto") && rs.theme) patch.theme = rs.theme;
    if(Object.keys(patch).length) Settings.set(patch);

    if(remote.content && Object.keys(remote.content).length)
      ls.set(K_CONTENT, deepMerge(ls.get(K_CONTENT, {}), remote.content));

    Store.vacuum();
    return {added, updated};
  },

  async run(adapter){
    let remote = null;
    try{ remote = await adapter.pull(); }
    catch(e){ syncLog(false, "Чтение: " + (e.message||e)); throw e; }

    let res = {added: 0, updated: 0};
    if(remote) res = Sync.merge(remote);

    const snap = await Sync.prepare();
    try{ await adapter.push(snap); }
    catch(e){ syncLog(false, "Запись: " + (e.message||e)); throw e; }

    // фото: докачать чужие, отправить свои
    if(adapter.pullPhoto && adapter.pushPhoto){
      const localIds = new Set(Sync._photoMeta.map(p=>p.id));
      const remoteMeta = (remote && remote.photos) || [];
      for(const p of remoteMeta){
        if(localIds.has(p.id)) continue;
        try{
          const blob = await adapter.pullPhoto(p.id);
          if(blob) await Photos.put({id:p.id, date:p.date, blob, thumb:blob, w:p.w, h:p.h, createdAt:p.createdAt});
        }catch(e){}
      }
      const remoteIds = new Set(remoteMeta.map(p=>p.id));
      for(const p of Sync._photoMeta){
        if(remoteIds.has(p.id)) continue;
        try{
          const rec = await Photos.get(p.id);
          if(rec) await adapter.pushPhoto(p.id, rec.blob);
        }catch(e){}
      }
    }
    syncLog(true, "Добавлено " + res.added + ", обновлено " + res.updated);
    return res;
  }
};

class FileAdapter{
  async pull(){
    return new Promise(res=>{
      const inp = $("jsonInput");
      inp.value = "";
      inp.onchange = ()=>{
        const f = inp.files && inp.files[0];
        inp.value = "";
        if(!f){ res(null); return; }
        const r = new FileReader();
        r.onload = ()=>{ try{ res(JSON.parse(r.result)); }catch(e){ res(null); } };
        r.onerror = ()=>res(null);
        r.readAsText(f);
      };
      inp.click();
    });
  }
  async push(snap){
    dl("eig-sync-" + today() + ".json", JSON.stringify(snap, null, 2));
  }
}

class WebDavAdapter{
  constructor({url, user, pass}){
    this.url = String(url||"").replace(/\/$/, "");
    this.auth = (user||pass) ? ("Basic " + btoa((user||"") + ":" + (pass||""))) : null;
  }
  _h(extra){
    const h = Object.assign({}, extra||{});
    if(this.auth) h["Authorization"] = this.auth;
    return h;
  }
  async pull(){
    const r = await fetch(this.url + "/eig-sync.json", {headers: this._h(), cache:"no-store"});
    if(r.status === 404) return null;
    if(!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async push(snap){
    const r = await fetch(this.url + "/eig-sync.json", {
      method:"PUT", headers: this._h({"Content-Type":"application/json"}), body: JSON.stringify(snap)});
    if(!r.ok) throw new Error("HTTP " + r.status);
  }
  async pushPhoto(id, blob){
    const r = await fetch(this.url + "/photos/" + id + ".jpg", {
      method:"PUT", headers: this._h({"Content-Type":"image/jpeg"}), body: blob});
    if(!r.ok) throw new Error("HTTP " + r.status);
  }
  async pullPhoto(id){
    const r = await fetch(this.url + "/photos/" + id + ".jpg", {headers: this._h()});
    if(!r.ok) return null;
    return r.blob();
  }
}

/* ---------- UI в настройках ---------- */
function renderSyncSettings(box){
  if(!box) return;
  const s = Settings.get().sync;
  const st = ls.get(K_SYNC, {}) || {};
  box.innerHTML =
    '<label class="row between" style="height:48px">'
    +   '<span class="body-l">Включить синхронизацию</span>'
    +   '<input type="checkbox" id="syEn"'+(s.enabled?" checked":"")+'></label>'
    + '<div class="field"><label>Адрес WebDAV</label>'
    +   '<input type="text" id="syUrl" value="'+esc(s.url)+'" placeholder="https://dav.example.com/eig"></div>'
    + '<div class="field"><label>Логин</label><input type="text" id="syUser" value="'+esc(s.user)+'"></div>'
    + '<div class="field"><label>Пароль</label><input type="password" id="syPass" value="'+esc(s.pass)+'"></div>'
    + '<button class="btn-tonal btn-wide" id="syRun">Синхронизировать</button>'
    + '<div class="label-s mut" style="margin-top:8px">Последняя: '
    +   (st.lastSyncAt ? esc(new Date(st.lastSyncAt).toLocaleString("ru-RU")) : "не было")
    +   '. Сервер должен отдавать CORS-заголовки, иначе браузер запрос не пропустит.</div>'
    + '<div class="body-m" id="syOut" style="margin-top:8px"></div>';

  const save = ()=>Settings.set({sync:{
    enabled: $("syEn").checked, url: $("syUrl").value.trim(),
    user: $("syUser").value.trim(), pass: $("syPass").value
  }});
  ["syEn","syUrl","syUser","syPass"].forEach(id=>$(id).addEventListener("change", save));
  $("syRun").addEventListener("click", async ()=>{
    save();
    const cfg = Settings.get().sync;
    const out = $("syOut");
    if(!cfg.url){ out.textContent = "Сначала укажи адрес WebDAV."; return; }
    out.textContent = "Синхронизирую…";
    try{
      const res = await Sync.run(new WebDavAdapter(cfg));
      out.innerHTML = '<span style="color:var(--md-sys-color-primary)">Готово: добавлено '
        + res.added + ', обновлено ' + res.updated + '</span>';
      renderCalendar(); renderLog(); refreshHome();
    }catch(e){
      out.innerHTML = '<span style="color:var(--md-sys-color-error)">'
        + esc(e.message||String(e)) + '</span>';
    }
  });
}
