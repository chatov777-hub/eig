/* store.js — хранилище и общие утилиты.
   Экспортирует: ls, today(), nowISO(), uid(), clamp(), mmss(), fmtNum(), hashStr(),
   deepMerge(), toast(), dl(), Store, Settings, checkins(), sessions(),
   K_CHECK, K_SESS, K_DRAFT, K_SETTINGS, K_CONTENT, K_MOTIV, K_AI, K_SYNC. */

var K_CHECK    = "eig_checkins_v1",
    K_SESS     = "eig_sessions_v1",
    K_DRAFT    = "eig_draft_v3",
    K_DRAFT_OLD= "eig_draft_v2",
    K_SETTINGS = "eig_settings_v1",
    K_CONTENT  = "eig_content_v1",
    K_MOTIV    = "eig_motiv_v1",
    K_AI       = "eig_ai_v1",
    K_SYNC     = "eig_sync_v1";

var ls = {
  get:(k,d)=>{ try{ const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set:(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} },
  del:(k)=>{ try{ localStorage.removeItem(k); }catch(e){} }
};

/* локальная дата, без сдвига по UTC */
function today(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function dateStr(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function nowISO(){ return new Date().toISOString(); }
function uid(prefix){ return prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mmss=s=>{ s=Math.max(0,Math.round(s)); return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); };
function hashStr(s){ let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))|0; return Math.abs(h); }
function fmtNum(n,dig){ return Number(n).toFixed(dig==null?1:dig).replace(".",","); }

/* массивы объединяются с дедупликацией, объекты — рекурсивно */
function deepMerge(base, over){
  if(Array.isArray(base)){
    if(!Array.isArray(over)) return base.slice();
    const out=base.slice();
    over.forEach(v=>{ if(out.indexOf(v)<0) out.push(v); });
    return out;
  }
  if(base && typeof base==="object"){
    const out={};
    Object.keys(base).forEach(k=>{ out[k]=deepMerge(base[k], over && over[k]); });
    if(over && typeof over==="object" && !Array.isArray(over))
      Object.keys(over).forEach(k=>{ if(!(k in out)) out[k]=over[k]; });
    return out;
  }
  return over===undefined ? base : over;
}

var _toastT=null;
function toast(msg, ms){
  const t=document.getElementById("toast");
  if(!t){ return; }
  t.textContent=msg; t.classList.add("on");
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>t.classList.remove("on"), ms||2200);
}

function dl(name, text, type){
  const a=document.createElement("a"); a.download=name;
  try{
    const u=URL.createObjectURL(new Blob([text],{type:type||"application/json"}));
    a.href=u; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 4000);
  }catch(e){
    a.href="data:"+(type||"application/json")+";charset=utf-8,"+encodeURIComponent(text);
    document.body.appendChild(a); a.click(); a.remove();
  }
}

/* ---------- коллекции ---------- */
var COLS={ checkins:K_CHECK, sessions:K_SESS };

/* старые записи дополняются id/updatedAt на лету */
function _norm(col, r){
  if(!r || typeof r!=="object") return r;
  if(!r.id) r.id=(col==="checkins"?"ci_":"s_")+r.date;
  if(!r.updatedAt) r.updatedAt=(r.savedAt||r.date+"T00:00:00.000Z");
  if(r.deletedAt===undefined) r.deletedAt=null;
  return r;
}
function _raw(col){ return ls.get(COLS[col],[]).map(r=>_norm(col,r)); }

var Store={
  raw(col){ return _raw(col); },
  list(col){ return _raw(col).filter(r=>!r.deletedAt); },
  get(col,id){ return _raw(col).find(r=>r.id===id)||null; },
  upsert(col,rec){
    const all=_raw(col);
    _norm(col,rec);
    rec.updatedAt=nowISO();
    const i=all.findIndex(r=>r.id===rec.id);
    if(i<0) all.push(rec); else all[i]=rec;
    all.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    ls.set(COLS[col],all);
    return rec;
  },
  remove(col,id){
    const all=_raw(col);
    const r=all.find(x=>x.id===id);
    if(r){ r.deletedAt=nowISO(); r.updatedAt=nowISO(); ls.set(COLS[col],all); }
  },
  replaceAll(col,arr){ ls.set(COLS[col],arr); },
  /* физически чистит тумбстоуны старше 90 дней */
  vacuum(){
    const cut=new Date(Date.now()-90*864e5).toISOString();
    ["checkins","sessions"].forEach(col=>{
      const all=_raw(col).filter(r=>!(r.deletedAt && r.deletedAt<cut));
      ls.set(COLS[col],all);
    });
  }
};

const checkins=()=>Store.list("checkins");
const sessions=()=>Store.list("sessions");

/* ---------- настройки ---------- */
var DEFAULT_SETTINGS={
  theme:"auto", name:"",
  plan:{ preset:"man", days:4, split:"split", weekdays:[1,2,4,5], volume:0, time:70, cardioMul:1.0, finisher:"auto" },
  ai:{ provider:"openai", baseUrl:"", apiKey:"", model:"" },
  sync:{ enabled:false, url:"", user:"", pass:"" },
  presets:{},                       // пользовательские перезаписи пресетов (§ «Неделя»)
  todayOverride:null,
  updatedAt:null
};

var Settings={
  get(){
    const s=ls.get(K_SETTINGS,{})||{};
    const out=JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    Object.keys(s).forEach(k=>{
      if(s[k] && typeof s[k]==="object" && !Array.isArray(s[k]) && out[k] && typeof out[k]==="object")
        Object.assign(out[k], s[k]);
      else if(s[k]!==undefined) out[k]=s[k];
    });
    return out;
  },
  set(patch){
    const cur=Settings.get();
    Object.keys(patch||{}).forEach(k=>{
      if(patch[k] && typeof patch[k]==="object" && !Array.isArray(patch[k]) && cur[k] && typeof cur[k]==="object")
        Object.assign(cur[k], patch[k]);
      else cur[k]=patch[k];
    });
    cur.updatedAt=nowISO();
    ls.set(K_SETTINGS,cur);
    return cur;
  },
  plan(){ return Settings.get().plan; }
};

ls.del(K_DRAFT_OLD);

/* экранирование для вставки в innerHTML */
function esc(s){
  return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
