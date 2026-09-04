/* programs.js — пул упражнений, шаблоны сессий, план недели, пресеты, бюджет времени.
   Экспортирует: EX, EQ, CORE, SESSIONS, PLANS, DEFAULT_WEEKDAYS, PRESETS_DEFAULT, getPresets(),
   savePreset(), resetPresets(), TIME, RU_DOW, scheduleForWeek(), sessionForToday(),
   suggestWR(), exDurationSec(), listDurationSec(), fmtDur(), buildToday(), shortName(). */

/* Оборудование: иконка + слово в подсказке, чтобы было понятно без легенды. */
const EQ = {
  barbell:  {ic:"🏋️", n:"штанга"},
  dumbbell: {ic:"💪",  n:"гантели"},
  machine:  {ic:"🦾",  n:"тренажёр"},
  cable:    {ic:"🪢",  n:"блок"},
  kb:       {ic:"🔔",  n:"гиря"},
  body:     {ic:"🧘",  n:"свой вес"},
  cardio:   {ic:"🚶",  n:"кардио"}
};

/* w0 — типовой стартовый вес, подставляется пока нет истории по упражнению */
const EX = {
  legpress:  {n:"Жим ногами в тренажёре",              t:"стопы шире, без блокировки колен",       sets:3, reps:"12–15", rest:90, prio:1, apre:true, kind:"squat", eq:"machine",  w0:80},
  rdl_db:    {n:"Румынская тяга с гантелями",          t:"спина прямая, таз назад",                sets:3, reps:"10–12", rest:90, prio:1, kind:"hinge", eq:"dumbbell", w0:20},
  legcurl:   {n:"Сгибание ног в тренажёре",            t:"медленная негативная фаза",              sets:3, reps:"12–15", rest:60, prio:2, kind:"iso",   eq:"machine",  w0:30},
  lunge:     {n:"Выпады с гантелями на месте",         t:"корпус вертикально",                     sets:2, reps:"10/нога", rest:75, prio:2, kind:"squat", eq:"dumbbell", w0:12},
  calf:      {n:"Подъём на носки стоя",                t:"полная амплитуда, пауза вверху",         sets:3, reps:"15–20", rest:45, prio:3, kind:"iso",   eq:"machine",  w0:40},
  hack:      {n:"Гакк-присед / присед в Смите",        t:"глубина по комфорту колен",              sets:3, reps:"10–12", rest:90, prio:1, apre:true, kind:"squat", eq:"machine",  w0:50},
  trapdl:    {n:"Тяга на прямых ногах с трэп-грифом",  t:"щадит поясницу",                         sets:3, reps:"10–12", rest:90, prio:1, kind:"hinge", eq:"barbell",  w0:40},
  legext:    {n:"Разгибание ног в тренажёре",          t:"пауза в верхней точке",                  sets:3, reps:"12–15", rest:60, prio:2, kind:"iso",   eq:"machine",  w0:35},
  hipthrust: {n:"Ягодичный мостик со штангой",         t:"подбородок к груди",                     sets:3, reps:"12–15", rest:75, prio:2, kind:"hinge", eq:"barbell",  w0:50},
  abduct:    {n:"Отведение бедра в тренажёре",         t:"медленно, без рывка",                    sets:2, reps:"15–20", rest:45, prio:3, kind:"iso",   eq:"machine",  w0:30},
  dbpress:   {n:"Жим гантелей лёжа",                   t:"угол 15–20°, без удара в груди",         sets:3, reps:"10–12", rest:90, prio:1, apre:true, kind:"push",  eq:"dumbbell", w0:20},
  machpress: {n:"Жим сидя в тренажёре",                t:"локти не до отказа назад",               sets:3, reps:"10–12", rest:90, prio:1, kind:"push",  eq:"machine",  w0:40},
  ohp_db:    {n:"Жим гантелей сидя над головой",       t:"корпус зафиксирован",                    sets:3, reps:"10–12", rest:75, prio:2, kind:"push",  eq:"dumbbell", w0:12},
  ohp_stand: {n:"Жим гантелей стоя",                   t:"кор напряжён",                           sets:3, reps:"10–12", rest:75, prio:2, kind:"push",  eq:"dumbbell", w0:10},
  cablefly:  {n:"Разведение в кроссовере",             t:"лёгкий вес, чувство грудных",            sets:2, reps:"15",    rest:60, prio:3, kind:"iso",   eq:"cable",    w0:12},
  pushdown:  {n:"Разгибание рук на блоке",             t:"локти прижаты",                          sets:3, reps:"12–15", rest:45, prio:3, kind:"iso",   eq:"cable",    w0:20},
  latpull:   {n:"Тяга верхнего блока к груди",         t:"лопатки вниз-назад",                     sets:3, reps:"10–12", rest:90, prio:1, apre:true, kind:"pull",  eq:"cable",    w0:45},
  latpull_rev:{n:"Тяга верхнего блока обратным хватом",t:"локти к рёбрам",                         sets:3, reps:"10–12", rest:75, prio:2, kind:"pull",  eq:"cable",    w0:40},
  dbrow:     {n:"Тяга гантели в наклоне с упором",     t:"без скручивания корпуса",                sets:3, reps:"10–12", rest:90, prio:1, apre:true, kind:"pull",  eq:"dumbbell", w0:20},
  dbrow2:    {n:"Тяга в наклоне двумя гантелями",      t:"корпус под 45°",                         sets:3, reps:"12",    rest:75, prio:1, kind:"pull",  eq:"dumbbell", w0:16},
  cablerow:  {n:"Горизонтальная тяга в блоке",         t:"свести лопатки",                         sets:3, reps:"12",    rest:75, prio:2, kind:"pull",  eq:"cable",    w0:40},
  reardelt:  {n:"Обратная бабочка / задняя дельта",    t:"лёгкий вес",                             sets:2, reps:"15",    rest:60, prio:3, kind:"iso",   eq:"machine",  w0:12},
  curl:      {n:"Сгибание рук с гантелями",            t:"без раскачки",                           sets:3, reps:"12–15", rest:45, prio:3, kind:"iso",   eq:"dumbbell", w0:12},
  goblet:    {n:"Гоблет-присед с гантелью",            t:"локти внутри колен",                     sets:3, reps:"12",    rest:75, prio:1, kind:"squat", eq:"dumbbell", w0:20},
  farmer:    {n:"Фермерская прогулка",                 t:"плечи вниз, шаг короткий",               sets:3, reps:"30 м",  rest:60, prio:2, kind:"cond",  eq:"dumbbell", w0:24},
  rower:     {n:"Гребной тренажёр / battle rope",      t:"30 сек работа в темпе",                  sets:4, reps:"30 сек",rest:60, prio:1, kind:"cond",  eq:"machine",  w0:0},
  kbswing:   {n:"Свинг гирей лёгкой",                  t:"толчок тазом, не руками",                sets:4, reps:"15",    rest:60, prio:1, kind:"hinge", eq:"kb",       w0:16},
  pushpull:  {n:"Жим-тяга в кроссовере (сет)",         t:"без паузы push→pull",                    sets:3, reps:"12+12", rest:75, prio:2, kind:"cond",  eq:"cable",    w0:15},
  stepup:    {n:"Степ-ап на платформу",                t:"невысокая, без прыжка",                  sets:3, reps:"12/нога",rest:60,prio:2, kind:"squat", eq:"dumbbell", w0:12},
  plank:     {n:"Планка",                              t:"таз не проваливается",                   sets:3, reps:"30–45 сек", rest:45, prio:1, kind:"core", eq:"body", w0:0},
  deadbug:   {n:"Мёртвый жук (dead bug)",              t:"поясница прижата к полу",                sets:3, reps:"10/сторона", rest:40, prio:1, kind:"core", eq:"body", w0:0},
  pallof:    {n:"Антиротация Pallof в блоке",          t:"таз неподвижен",                         sets:3, reps:"12/сторона", rest:40, prio:2, kind:"core", eq:"cable", w0:15},
  kneeraise: {n:"Подъём коленей в висе/на брусьях",    t:"без раскачки",                           sets:3, reps:"12–15", rest:45, prio:3, kind:"core", eq:"body", w0:0},
  walk:      {n:"Длинная прогулка / эллипс",           t:"разговорный темп — это и есть Zone 2",   sets:null, reps:"40–60 мин", rest:null, prio:1, kind:"cardio", eq:"cardio", w0:0},
  mobility:  {n:"Мобилити тазобедренных / грудного",   t:"без боли",                               sets:null, reps:"10 мин", rest:null, prio:1, kind:"cardio", eq:"body", w0:0},
  stretch:   {n:"Растяжка + дыхание 4-7-8",            t:"снижение симпатического тонуса",         sets:null, reps:"10 мин", rest:null, prio:2, kind:"cardio", eq:"body", w0:0}
};

/* кор добавляется к сессиям сплита; в фулл-боди он уже внутри */
const CORE = ["plank","deadbug","pallof","kneeraise"];

const SESSIONS = {
  low:          {name:"Низ тела + кор",                        short:"Низ",     icon:"🦵", z2:35, cardio:"Zone 2",    core:true,  ex:["legpress","rdl_db","legcurl","lunge","calf"],
                 desc:"Квадрицепс, задняя поверхность, ягодицы и икры. Жим ногами и румынская тяга — базовые, остальное добивает."},
  low2:         {name:"Низ тела (вариация) + кор",             short:"Низ 2",   icon:"🦵", z2:35, cardio:"Zone 2",    core:true,  ex:["hack","trapdl","legext","hipthrust","abduct"],
                 desc:"Второй день ног за неделю. Те же группы, но другие движения — чтобы не долбить одно и то же."},
  upperA:       {name:"Верх — жимовой акцент + кор",           short:"Верх A",  icon:"💪", z2:35, cardio:"Zone 2",    core:true,  ex:["dbpress","latpull","ohp_db","cablerow","cablefly","pushdown"],
                 desc:"Три жима и две тяги: грудь, плечи, трицепс в приоритете, спина поддерживает."},
  upperB:       {name:"Верх — тяговый акцент + кор",           short:"Верх B",  icon:"💪", z2:20, cardio:"Интервалы", core:true,  ex:["dbrow","machpress","latpull_rev","ohp_stand","reardelt","curl"],
                 desc:"Зеркало «Верх A»: три тяги и два жима. Спина, задняя дельта, бицепс."},
  metcon:       {name:"Метаболическое кондиционирование + кор",short:"Меткон",  icon:"🔥", z2:0,  cardio:"Интервалы", core:true,  ex:["rower","kbswing","pushpull","stepup"],
                 desc:"Короткие интенсивные круги без отдыха до упора. Пульс, а не вес. Ставится в середину недели."},
  func:         {name:"Функциональное полное тело + кор",      short:"Функц.",  icon:"🤸", z2:45, cardio:"Zone 2",    core:true,  ex:["goblet","dbrow2","ohp_stand","farmer"],
                 desc:"Всё тело в простых движениях плюс переноска веса. Лёгкий день после тяжёлой недели."},
  fbA:          {name:"Всё тело A — присед",                   short:"Тело A",  icon:"🅰️", z2:30, cardio:"Zone 2",    core:false, ex:["goblet","dbpress","latpull","rdl_db","plank","calf"],
                 desc:"Фулл-боди с акцентом на присед. Присед + жим + тяга + шарнир + кор за одну сессию."},
  fbB:          {name:"Всё тело B — шарнир",                   short:"Тело B",  icon:"🅱️", z2:30, cardio:"Zone 2",    core:false, ex:[{id:"trapdl", apre:true},"machpress","cablerow","hipthrust","deadbug","reardelt"],
                 desc:"Фулл-боди с акцентом на тягу от бедра (шарнир). Чередуется с «Тело A»."},
  fbC:          {name:"Всё тело C — микс",                     short:"Тело C",  icon:"🆎", z2:30, cardio:"Zone 2",    core:false, ex:["hack","ohp_stand","dbrow","lunge","pallof","curl"],
                 desc:"Третий фулл-боди: движения, которых не было в A и B, чтобы за неделю закрыть всё."},
  recovery:     {name:"Активное восстановление",               short:"Восстановление", icon:"🌿", z2:45, cardio:"Zone 1–2", core:false, rec:true, ex:["walk","mobility","stretch"],
                 desc:"Без железа: прогулка в разговорном темпе, мобилити, растяжка. Ставится в нетренировочные дни и всегда при красном индексе."},
  recoveryLong: {name:"Длинная Zone 2",                        short:"Zone 2",  icon:"🚶", z2:60, cardio:"Zone 1–2",  core:false, rec:true, ex:["walk","mobility"],
                 desc:"Длинное спокойное кардио — главный рычаг по висцеральному жиру. Шестой день в IronMan."}
};
function shortName(key){ return (SESSIONS[key] && SESSIONS[key].short) || key; }

const PLANS = {
  full:  { 2:["fbA","fbB"], 3:["fbA","fbB","fbC"], 4:["fbA","fbB","fbC","func"],
           5:["fbA","fbB","metcon","fbC","func"], 6:["fbA","fbB","metcon","fbC","func","recoveryLong"] },
  split: { 2:["low","upperA"], 3:["low","upperA","func"], 4:["low","upperA","low2","upperB"],
           5:["low","upperA","metcon","low2","upperB"], 6:["low","upperA","metcon","low2","upperB","func"] }
};
const DEFAULT_WEEKDAYS = { 2:[1,4], 3:[1,3,5], 4:[1,2,4,5], 5:[1,2,3,4,5], 6:[1,2,3,4,5,6] }; // 0=Вс … 6=Сб
const RU_DOW = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

/* Пресеты — заготовки. Пользователь может перезаписать любой своим набором (Settings.presets). */
const PRESETS_DEFAULT = {
  lite: { name:"Lite",    icon:"🪶", days:2, split:"full",  time:45, volume:-1, cardioMul:0.7, finisher:"off",
          tag:"Держим форму без отговорок", desc:"2 фулл-боди по 45 минут. Минимальная доза, чтобы не откатиться." },
  man:  { name:"Крепыш",  icon:"🧔", days:4, split:"split", time:70, volume:0,  cardioMul:1.0, finisher:"auto",
          tag:"Стабильно и по делу", desc:"Верх/низ дважды в неделю. Рабочая лошадка прогресса." },
  iron: { name:"IronMan", icon:"🦾", days:6, split:"split", time:70, volume:1,  cardioMul:1.2, finisher:"on",
          tag:"Неделя на максимум", desc:"6 дней, +1 подход в базовых, финишеры. Только если ЕИГ зелёный." }
};
const PRESET_KEYS = ["lite","man","iron"];

function getPresets(){
  const saved = Settings.get().presets || {};
  const out = {};
  PRESET_KEYS.forEach(k=>{ out[k] = Object.assign({}, PRESETS_DEFAULT[k], saved[k] || {}); });
  return out;
}
/* сохранить текущий план недели в слот пресета */
function savePreset(key, plan, patch){
  if(PRESET_KEYS.indexOf(key) < 0) return;
  const saved = Object.assign({}, Settings.get().presets || {});
  saved[key] = Object.assign({}, saved[key] || {}, {
    days: plan.days, split: plan.split, time: plan.time, volume: plan.volume,
    cardioMul: plan.cardioMul, finisher: plan.finisher, weekdays: (plan.weekdays||[]).slice()
  }, patch || {});
  Settings.set({presets: saved});
}
/* null, а не {}: Settings.set сливает объекты, и пустой объект ничего бы не затёр */
function resetPresets(){ Settings.set({presets: null}); }

/* Бюджет времени. total — сколько всего минут занимает занятие вместе с кардио;
   cardioShare — какая доля уходит на кардио. Остальное — силовая часть. */
const TIME = {
  25:{label:"25 мин", maxPrio:1, core:1, total:25, cardioShare:0.30},
  45:{label:"45 мин", maxPrio:2, core:2, total:45, cardioShare:0.33},
  70:{label:"70+ мин",maxPrio:3, core:3, total:70, cardioShare:0.35}
};
const SET_WORK_SEC = 40;   // средний рабочий подход
const EX_SETUP_SEC = 50;   // дойти до снаряда, настроить, размяточный подход

function exDurationSec(e){
  if(!e || !e.sets) return 0;
  return EX_SETUP_SEC + e.sets*SET_WORK_SEC + Math.max(0, e.sets-1)*(e.rest || 60);
}
function listDurationSec(list){ return (list||[]).reduce((a,e)=>a + exDurationSec(e), 0); }
function fmtDur(sec){
  const m = Math.round(sec/60);
  return m < 60 ? (m + " мин") : (Math.floor(m/60) + " ч " + String(m%60).padStart(2,"0"));
}

/* Режем список под бюджет в два прохода.
   1) Выкидываем упражнения: сначала самые низкоприоритетные, кор раньше базовых,
      из равных — те, что ниже по списку. Минимум два силовых остаётся всегда.
   2) Если выкидывать больше нечего (короткий день + пиковый режим + повышенный объём),
      снимаем по подходу с самого длинного упражнения, но не ниже двух. */
function trimToBudget(list, budgetSec){
  let guard = 0;
  while(listDurationSec(list) > budgetSec && guard++ < 50){
    const mains = list.filter(e=>e.block === "main" && e.sets).length;
    let victim = -1, best = null;
    list.forEach((e,i)=>{
      if(!e.sets) return;
      if(e.block === "main" && mains <= 2) return;
      const score = [e.prio, e.block === "core" ? 1 : 0, i];
      if(!best || score[0] > best[0]
         || (score[0] === best[0] && (score[1] > best[1]
         || (score[1] === best[1] && score[2] > best[2])))){ best = score; victim = i; }
    });
    if(victim < 0) break;
    list.splice(victim, 1);
  }
  guard = 0;
  while(listDurationSec(list) > budgetSec && guard++ < 50){
    let victim = -1, longest = 0;
    list.forEach((e,i)=>{
      if(!e.sets || e.sets <= 2) return;
      const d = exDurationSec(e);
      if(d > longest){ longest = d; victim = i; }
    });
    if(victim < 0) break;
    const e = list[victim];
    e.sets -= 1;
    e.log = Array(e.sets).fill(null);
  }
  return list;
}

/* Подстановка веса и повторов: последняя запись по этому упражнению → типовой стартовый вес. */
function suggestWR(id, reps){
  const base = EX[id] || {};
  let w = base.w0 || 0, r = repsLow(reps || base.reps);
  const all = sessions().slice().sort((a,b)=>b.date.localeCompare(a.date));
  for(const s of all){
    const e = (s.ex||[]).find(x=>x.id === id);
    if(!e) continue;
    if(Array.isArray(e.log)){
      const last = e.log.filter(Boolean).pop();
      if(last && (+last.r || 0) > 0){ w = +last.w || 0; r = +last.r || r; break; }
    }else if(e.done && e.weight){
      w = parseFloat(e.weight) || w; r = parseInt(e.actual, 10) || r; break;
    }
  }
  return {w: w ? String(w) : "0", r: String(r || 10)};
}

const DOW_ORDER = [1,2,3,4,5,6,0];   // Пн…Сб, затем Вс

function scheduleForWeek(plan){
  const p = plan || Settings.plan();
  const days = clamp(+p.days||2, 2, 6);
  const keys = (PLANS[p.split] || PLANS.split)[days] || [];
  const src = (Array.isArray(p.weekdays) && p.weekdays.length ? p.weekdays : (DEFAULT_WEEKDAYS[days]||[]));
  const uniq = [...new Set(src.map(Number).filter(d=>d>=0 && d<=6))]
               .sort((a,b)=>DOW_ORDER.indexOf(a)-DOW_ORDER.indexOf(b));
  const out = {0:"recovery",1:"recovery",2:"recovery",3:"recovery",4:"recovery",5:"recovery",6:"recovery"};
  uniq.forEach((d,i)=>{ if(i < keys.length) out[d] = keys[i]; });
  return out;
}
function sessionForToday(plan, settings){
  const st = settings || Settings.get();
  if(st.todayOverride && st.todayOverride.date === today() && SESSIONS[st.todayOverride.sessionKey])
    return st.todayOverride.sessionKey;
  return scheduleForWeek(plan || st.plan)[new Date().getDay()];
}

/* нижняя граница диапазона повторов: "10–12" → 10, "30 сек" → 30 */
function repsLow(reps){ const m = String(reps||"").match(/\d+/); return m ? +m[0] : 0; }

/* opts позволяет собрать не сегодняшний день, а любой — нужно для плана недели */
function buildToday(index, z, opts){
  const mode = (opts && opts.modeKey)
    ? Object.assign({key: opts.modeKey}, MODES[opts.modeKey])
    : modeOf(index, z);
  const st   = Settings.get();
  const plan = st.plan;
  const tcfg = TIME[plan.time] || TIME[70];
  const key  = (opts && opts.sessionKey) ? opts.sessionKey
             : (mode.key === "rest" ? "recovery" : sessionForToday(plan, st));
  const S    = SESSIONS[key] || SESSIONS.recovery;
  const list = [];

  const push = (ref, block)=>{
    const id = (ref && ref.id) ? ref.id : ref;
    const base0 = EX[id];
    if(!base0) return;
    const e = Object.assign({}, base0, (ref && ref.id) ? ref : {});
    if(e.prio > (block === "core" ? tcfg.core : tcfg.maxPrio)) return;
    let sets = null, rest = null;
    if(!S.rec && e.sets != null){
      const b = Math.max(2, e.sets + (plan.volume === 1 && e.prio === 1 ? 1 : 0) - (plan.volume === -1 ? 1 : 0));
      sets = setsFor(b, mode.key, e.prio);
      rest = restFor(e.rest, mode.key);
    }
    const s = suggestWR(id, e.reps);
    list.push({ id, n:e.n, t:e.t, eq:e.eq, prio:e.prio, kind:e.kind, apre:!!e.apre && !S.rec,
                block, sets, reps:e.reps, rest, restCustom:false,
                log:Array(sets||0).fill(null), skipped:false,
                w: sets ? s.w : "", r: sets ? s.r : "" });
  };

  S.ex.forEach(ref=>push(ref, "main"));
  if(S.core && !S.rec) CORE.forEach(id=>push(id, "core"));

  // кардио сначала: от него зависит, сколько минут остаётся силовой части
  const isInt = S.cardio === "Интервалы";
  const cardioType = (mode.key === "light" && isInt) ? "Zone 2" : S.cardio;
  let cardioMin;
  if(S.rec){
    cardioMin = Math.round((S.z2 || 45) * (plan.cardioMul || 1)) || 30;
  }else{
    cardioMin = Math.round(tcfg.total * tcfg.cardioShare * (plan.cardioMul || 1) * (isInt ? 0.6 : 1));
    cardioMin = clamp(cardioMin, 8, 60);
  }

  if(!S.rec) trimToBudget(list, Math.max(300, (tcfg.total - cardioMin) * 60));

  // APRE — одно упражнение за сессию: оставляем первое подходящее
  let apreTaken = false;
  list.forEach(e=>{
    if(!e.apre) return;
    if(apreTaken) e.apre = false; else apreTaken = true;
  });

  const strengthSec = listDurationSec(list);
  const estSec = strengthSec + cardioMin*60;
  const finisher = plan.finisher === "on" ? true : plan.finisher === "off" ? false : mode.finisher;

  return { sessionKey:key, sessionName:S.name, icon:S.icon, mode, list,
           cardio:{type:cardioType, min:cardioMin}, finisher, rec:!!S.rec,
           strengthSec, estSec };
}

/* ---------- плановый объём: сколько тоннажа программа заложила ----------
   Считаем по подставленным весам и нижней границе повторов — то же, что увидит
   пользователь в чипах. Это даёт кольцам осмысленный знаменатель. */
function plannedTonnage(list){
  return (list||[]).reduce((a,e)=>
    a + (e.sets||0) * repsLow(e.reps) * (parseFloat(String(e.w).replace(",",".")) || 0), 0);
}
var _planCache = {key:null, day:0, week:0};
function _planCacheKey(){
  return JSON.stringify(Settings.plan()) + "|" + sessions().length + "|" + today();
}
function plannedVolumes(){
  const k = _planCacheKey();
  if(_planCache.key === k) return _planCache;
  const plan  = Settings.plan();
  const sched = scheduleForWeek(plan);
  let week = 0, day = 0;
  const todayKey = sessionForToday(plan);
  [1,2,3,4,5,6,0].forEach(d=>{
    const key = sched[d];
    if(!key || !SESSIONS[key] || SESSIONS[key].rec) return;
    const t = buildToday(70, null, {sessionKey:key, modeKey:"medium"});
    const v = plannedTonnage(t.list);
    week += v;
    if(key === todayKey && !day) day = v;
  });
  _planCache = {key:k, day, week};
  return _planCache;
}
function plannedDayTonnage(){ return plannedVolumes().day; }
function plannedWeekTonnage(){ return plannedVolumes().week; }

/* Что значит тип кардио — подпись прямо в карточке, чтобы не гадать. */
const CARDIO_HELP = {
  "Zone 2":   "спокойный темп: можешь говорить предложениями, дышишь носом",
  "Zone 1–2": "лёгкая прогулка в восстановительном темпе, без усилия",
  "Интервалы":"чередование: 30 сек быстро — 90 сек спокойно, и так по кругу"
};
