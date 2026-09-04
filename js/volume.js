/* volume.js — тоннаж, недели, уровень дня, награды, чередование иконок.
   Экспортирует: tonnage(), fmtT(), weekStart(), weekKey(), weekTonnage(), weekSessions(),
   weekZone2(), dayTier(), awardDay(), awardWeek(), pickIcon(), tierIcon(), sessionSets(). */

/* новые записи — поле tonnage; старые (без log) считаем по weight/actual/sets (§1.3) */
function tonnage(s){
  if(!s) return 0;
  if(typeof s.tonnage === "number") return s.tonnage;
  let sum = 0;
  (s.ex||[]).forEach(e=>{
    if(Array.isArray(e.log)){
      e.log.forEach(l=>{ if(l) sum += (+l.w||0) * (+l.r||0); });
    }else if(e.done){
      sum += (parseFloat(e.weight)||0) * (parseInt(e.actual,10)||0) * (e.sets||1);
    }
  });
  return sum;
}
function sessionSets(s){
  let n = 0;
  (s.ex||[]).forEach(e=>{
    if(Array.isArray(e.log)) n += e.log.filter(Boolean).length;
    else if(e.done) n += (e.sets||1);
  });
  return n;
}
/* kg<1000 → «840 кг»; иначе «1,8 т» */
function fmtT(kg, compact){
  kg = +kg || 0;
  const sp = compact ? "" : " ";
  if(kg < 1000) return Math.round(kg) + sp + "кг";
  return (kg/1000).toFixed(1).replace(".", ",") + sp + "т";
}

/* понедельник недели, локально */
function weekStart(date){
  const d = (date instanceof Date) ? new Date(date.getTime()) : new Date(date + "T00:00:00");
  const off = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - off);
  d.setHours(0,0,0,0);
  return d;
}
function weekKey(date){ return dateStr(weekStart(date)); }
function weekShift(key, n){
  const d = weekStart(key); d.setDate(d.getDate() + 7*n); return dateStr(d);
}
function weekRange(key){
  const a = weekStart(key), b = new Date(a.getTime()); b.setDate(b.getDate()+6);
  return [dateStr(a), dateStr(b)];
}
function weekTonnage(key){
  const [a,b] = weekRange(key);
  return sessions().filter(s=>s.date>=a && s.date<=b).reduce((n,s)=>n + tonnage(s), 0);
}
function weekSessions(key){
  const [a,b] = weekRange(key);
  return sessions().filter(s=>s.date>=a && s.date<=b)
                   .filter(s=>tonnage(s) > 0 || (s.cardio && s.cardio.done)).length;
}
function weekZone2(key){
  const [a,b] = weekRange(key);
  return sessions().filter(s=>s.date>=a && s.date<=b)
    .reduce((n,s)=>n + ((s.cardio && s.cardio.done && /Zone/.test(s.cardio.type)) ? (+s.cardio.min||0) : 0), 0);
}

function median(a){
  if(!a.length) return 0;
  const v = a.slice().sort((x,y)=>x-y), m = v.length>>1;
  return v.length % 2 ? v[m] : (v[m-1] + v[m]) / 2;
}
/* тоннаж последних 28 дней до указанной даты (не включая её) */
function tonnageHistory(date){
  const cut = dateStr(new Date(new Date(date + "T00:00:00").getTime() - 28*864e5));
  return sessions().filter(s=>s.date < date && s.date >= cut)
                   .map(tonnage).filter(t=>t > 0);
}
/* light | normal | heavy | cardio */
function dayTier(s){
  if(!s) return null;
  const t = tonnage(s);
  if(t === 0 && s.cardio && s.cardio.done) return "cardio";
  const hist = tonnageHistory(s.date);
  if(hist.length < 3){
    const m = s.mode;
    return (m === "peak" || m === "heavy") ? "heavy" : (m === "medium" ? "normal" : "light");
  }
  const med = median(hist);
  return t < 0.7*med ? "light" : t > 1.3*med ? "heavy" : "normal";
}
/* тоннаж больше, чем в предыдущей сессии с тоннажом */
function awardDay(s){
  const t = tonnage(s);
  if(!t) return false;
  const prev = sessions().filter(x=>x.date < s.date && tonnage(x) > 0).sort((a,b)=>a.date.localeCompare(b.date)).pop();
  return !!prev && t > tonnage(prev);
}
function awardWeek(key){
  const cur = weekTonnage(key), prev = weekTonnage(weekShift(key,-1));
  return prev > 0 && cur > prev;
}

/* все тренировки одного дня, в порядке закрытия; за день их может быть несколько */
function sessionsOn(date){
  return sessions().filter(s=>s.date === date)
                   .sort((a,b)=>String(a.savedAt||"").localeCompare(String(b.savedAt||"")));
}
function dayTonnage(date){ return sessionsOn(date).reduce((a,s)=>a + tonnage(s), 0); }

/* Пять градаций тоннажа. Внутри градации эмодзи чередуется — чтобы не приедалось. */
const TONNAGE_TIERS = [
  {min:0,    label:"разминка",        emoji:["🫠","💧","🐣","🌱","🪶"]},
  {min:1500, label:"есть работа",     emoji:["🙂","👌","🔩","🧱","🛠️"]},
  {min:3500, label:"крепко сделано",  emoji:["💪","🔥","⚡","👊","🧨"]},
  {min:6000, label:"мощная сессия",   emoji:["🦾","🚀","🏆","🥇","🎯"]},
  {min:9000, label:"зверь-режим",     emoji:["🐘","👑","🌋","🦍","☄️"]}
];
function tonnageBadge(kg, seed){
  kg = +kg || 0;
  let t = TONNAGE_TIERS[0];
  TONNAGE_TIERS.forEach(x=>{ if(kg >= x.min) t = x; });
  const i = hashStr(String(seed == null ? today() : seed) + "|" + Math.round(kg/50)) % t.emoji.length;
  return {emoji: t.emoji[i], label: t.label, tier: TONNAGE_TIERS.indexOf(t)};
}

/* иконка по хешу ключа; avoid — иконка соседнего дня той же категории */
function pickIcon(list, key, avoid){
  if(!list || !list.length) return "";
  let i = hashStr(key) % list.length;
  if(list[i] === avoid) i = (i + 1) % list.length;
  return list[i];
}
/* иконка ячейки календаря: награда важнее уровня */
function tierIcon(s, avoid){
  const ic = getContent().dayIcons;
  const tier = dayTier(s);
  if(!tier) return "";
  if(awardDay(s)) return pickIcon(ic.award_day, s.date, avoid);
  return pickIcon(ic[tier] || ic.normal, s.date, avoid);
}
