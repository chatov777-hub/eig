/* scales.js — шкалы 0–4, индекс готовности, базовая линия, режимы дня.
   Экспортирует: ITEMS, SCALE_MAX, W_HOURS, NORM_SLEEP, computeIndex(), baselineZ(),
   MODES, modeOf(), setsFor(), restFor(). */

const ITEMS = [
 {k:"sleep",   e:"😴",  t:"Сон",         w:1.5, def:3, labels:["Совсем не спал","Плохо спал","Так себе","Нормально","Отлично выспался"]},
 {k:"fatigue", e:"⚡",  t:"Энергия",     w:1.5, def:3, labels:["Выжат как лимон","Вялый","Средне","Бодрый","Полон сил"]},
 {k:"doms",    e:"💪",  t:"Мышцы",       w:1.5, def:3, labels:["Всё болит","Крепатура ощутимая","Немного тянет","Почти свежие","Свежие, готов рвать"]},
 {k:"stress",  e:"🧘",  t:"Спокойствие", w:1.0, def:2, labels:["Задолбали все","Напряжён","Есть о чём подумать","Спокоен","Дзен"]},
 {k:"mood",    e:"🔥",  t:"Настроение",  w:1.0, def:3, labels:["Ничего не хочу","Заставляю себя","Норм","Хочу в зал","Горю, погнали!"]},
 {k:"appetite",e:"🍽️", t:"Аппетит",     w:0.5, def:3, labels:["Мутит / болею","Не хочется есть","Так себе","Нормальный","Волчий аппетит"]},
];
const SCALE_MAX = 4, W_HOURS = 1.0, NORM_SLEEP = 7.5;

function computeIndex(vals){
  let s=0, m=0;
  ITEMS.forEach(it=>{ s += it.w * ((+vals[it.k]||0)/SCALE_MAX); m += it.w; });
  const hrs = vals.hours==null ? NORM_SLEEP : +vals.hours;
  s += W_HOURS * clamp(1 - Math.abs(hrs-NORM_SLEEP)/5, 0, 1); m += W_HOURS;
  return Math.round(100*s/m);
}

/* последние 7 чек-инов кроме сегодняшнего, от 3 штук — z-score */
function baselineZ(idx){
  const prev=checkins().filter(r=>r.date!==today()).slice(-7).map(r=>r.index);
  if(prev.length<3) return {z:null,mean:null};
  const mean=prev.reduce((a,b)=>a+b,0)/prev.length;
  const sd=Math.sqrt(prev.reduce((a,b)=>a+(b-mean)**2,0)/prev.length)||1;
  return {z:(idx-mean)/sd, mean};
}

/* restMul — множитель рекомендованной паузы: чем ниже готовность, тем длиннее отдых.
   Тексты verdict/desc берутся из CONTENT.modeCopy (§7.3). */
const MODES={
  peak  :{name:"Пиковая",        cls:"peak",   tone:"secondary", rpe:"9 (1 в запасе)",   restMul:1.15, finisher:true,  apre:true},
  heavy :{name:"Тяжёлая",        cls:"green",  tone:"primary",   rpe:"8 (2 в запасе)",   restMul:1.0,  finisher:true,  apre:true},
  medium:{name:"Средняя",        cls:"yellow", tone:"amber",     rpe:"7 (3 в запасе)",   restMul:1.0,  finisher:false, apre:true},
  light :{name:"Лёгкая",         cls:"orange", tone:"tertiary",  rpe:"5–6 (4+ в запасе)",restMul:1.25, finisher:false, apre:false},
  rest  :{name:"Восстановление", cls:"red",    tone:"error",     rpe:"—",                restMul:1.0,  finisher:false, apre:false},
};
function modeOf(index,z){
  let key;
  if(z===null||z===undefined){ key = index>=85?"peak": index>=70?"heavy": index>=50?"medium": index>=34?"light":"rest"; }
  else { key = z>=1.0?"peak": z>=-0.3?"heavy": z>-1.2?"medium": z>-2.0?"light":"rest"; }
  return {key,...MODES[key]};
}
/* Подходы по режиму — явные правила: множители при базовых 3 подходах
   схлопывались бы при округлении (1.1/1.0/0.85 → все 3). */
function setsFor(base, modeKey, prio){
  switch(modeKey){
    case "peak":   return prio===1 ? base+1 : base;
    case "heavy":  return base;
    case "medium": return prio===1 ? base : Math.max(2, base-1);
    case "light":  return Math.max(2, Math.round(base*0.55));
    default:       return 0;
  }
}
/* Рекомендованная пауза = базовая для упражнения × поправка режима ЕИГ */
function restFor(base, modeKey){
  return Math.round(base*(MODES[modeKey]?MODES[modeKey].restMul:1)/5)*5;
}
