/* app.js — инициализация, вкладки, тема, экран «Сегодня», опросник, пресеты,
   настройки, обновление Service Worker.
   Экспортирует: tab(), run(), refreshHome(), readItems(), resetForm(),
   openSheet(), closeSheet(), openSettings(), initTheme(). */

const $ = id => document.getElementById(id);
const APP_VERSION = "5.0";
const Z2_GOAL = 190;

/* ---------- шиты ---------- */
function openSheet(html, second){
  const s = $(second ? "sheet2" : "sheet");
  $(second ? "sheet2Body" : "sheetBody").innerHTML = html;
  $("scrim").classList.add("on");
  requestAnimationFrame(()=>s.classList.add("on"));
  return s;
}
function closeSheet(second){
  if(second===undefined){
    $("sheet").classList.remove("on"); $("sheet2").classList.remove("on");
    $("scrim").classList.remove("on");
  }else{
    $(second ? "sheet2" : "sheet").classList.remove("on");
    if(!$("sheet").classList.contains("on") && !$("sheet2").classList.contains("on"))
      $("scrim").classList.remove("on");
  }
}

/* ---------- тема ---------- */
function initTheme(){
  const t = Settings.get().theme || "auto";
  const root = document.documentElement;
  if(t === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  $("themeIcon").textContent = t === "dark" ? "dark_mode" : t === "light" ? "light_mode" : "brightness_auto";
  $("themeIcon").dataset.fb = t === "dark" ? "🌙" : t === "light" ? "☀️" : "🌗";
  forceGlassRepaint();
}
/* Смена темы «на лету» не перерисовывает слои с backdrop-filter — они остаются
   залитыми старым цветом. Гасим размытие на один кадр, чтобы слои пересобрались. */
function forceGlassRepaint(){
  const root = document.documentElement;
  root.classList.add("norepaint");
  requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.remove("norepaint")));
}
/* шрифт иконок внешний: без него лигатуры показались бы английским текстом — тогда эмодзи */
function checkSymbolsFont(){
  const mark = ()=>{
    let ok = false;
    try{ ok = document.fonts.check('24px "Material Symbols Rounded"'); }catch(e){ ok = false; }
    document.documentElement.classList.toggle("nosym", !ok);
  };
  mark();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(mark).catch(()=>{});
  setTimeout(mark, 2500);
}
function cycleTheme(){
  const order = ["auto","light","dark"];
  const cur = Settings.get().theme || "auto";
  const next = order[(order.indexOf(cur)+1) % 3];
  Settings.set({theme: next});
  initTheme();
  toast(next === "auto" ? "Тема: как в системе" : next === "light" ? "Тема: светлая" : "Тема: тёмная");
  drawChart();
}

/* ---------- вкладки ---------- */
var activeTab = "today";
function tab(name){
  activeTab = name;
  document.querySelectorAll(".tabpane").forEach(p=>p.classList.toggle("on", p.id === "tab-"+name));
  document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("on", b.dataset.tab === name));
  window.scrollTo(0,0);
  if(name === "today") refreshHome();
  if(name === "train") renderTrain();
  if(name === "cal"){ renderCalendar(); drawChart(); }
  if(name === "log") renderLog();
}

/* ---------- опросник ---------- */
function renderScales(){
  $("scales").innerHTML = ITEMS.map(it=>
    '<div class="scale">'
    + '<div class="top"><span class="nm">'+it.e+' '+esc(it.t)+'</span>'
    + '<span class="lbl" id="lbl_'+it.k+'">'+esc(it.labels[it.def])+'</span></div>'
    + '<div class="sliderwrap">'
    + '<div class="ticks"><i></i><i></i><i></i><i></i><i></i></div>'
    + '<input type="range" id="'+it.k+'" min="0" max="4" step="1" value="'+it.def+'" aria-label="'+esc(it.t)+'">'
    + '</div></div>'
  ).join("");
  ITEMS.forEach(it=>{
    $(it.k).addEventListener("input", ()=>{
      $("lbl_"+it.k).textContent = it.labels[+$(it.k).value] || "";
    });
  });
  $("hours").addEventListener("input", ()=>{
    $("hoursLbl").textContent = fmtNum(+$("hours").value, 1) + " ч";
  });
}
function readItems(){
  const o = {};
  ITEMS.forEach(it=>{ o[it.k] = +$(it.k).value; });
  o.hours = +$("hours").value;
  return o;
}
function setItems(vals, scale5){
  ITEMS.forEach(it=>{
    let v = vals[it.k];
    if(v == null) v = it.def;
    else if(!scale5) v = Math.round(v/2.5);          // старая шкала 0–10 → 0–4
    v = clamp(Math.round(v), 0, 4);
    $(it.k).value = v;
    $("lbl_"+it.k).textContent = it.labels[v];
  });
  const h = vals.hours == null ? NORM_SLEEP : +vals.hours;
  $("hours").value = h;
  $("hoursLbl").textContent = fmtNum(h,1) + " ч";
}
function resetForm(){
  ITEMS.forEach(it=>{ $(it.k).value = it.def; $("lbl_"+it.k).textContent = it.labels[it.def]; });
  $("hours").value = NORM_SLEEP;
  $("hoursLbl").textContent = fmtNum(NORM_SLEEP,1) + " ч";
  toast("Шкалы сброшены");
}

/* ---------- пресеты и «Настроить» ---------- */
function applyPreset(key){
  const p = getPresets()[key];
  if(!p) return;
  Settings.set({plan:{ preset:key, days:p.days, split:p.split, time:p.time, volume:p.volume,
                       cardioMul:p.cardioMul, finisher:p.finisher,
                       weekdays:(p.weekdays || DEFAULT_WEEKDAYS[p.days] || []).slice() },
                 todayOverride:null});
  renderPlanUI(); run();
  toast("Пресет: " + p.name);
}
const PRESET_ICONS = ["🪶","🧔","🦾","🔥","💪","🏋️","⚡","🧗","🐺","🎯","🧊","🌙","☀️","🚀","🧱","🥋"];

/* «Сохранить как пресет»: шаг 1 — выбрать слот, шаг 2 — имя, подпись и иконка */
function openSavePreset(){
  const plan = Settings.plan(), ps = getPresets();
  openSheet(
    '<h2>Сохранить как пресет</h2>'
    + '<div class="body-m mut">Текущая настройка: '+plan.days+' тренировок · '
    +   (plan.split==="full" ? "всё тело" : "сплит") + ' · ' + (TIME[plan.time]||TIME[70]).label
    +   '. Выбери, какой пресет перезаписать — дальше будешь включать его одним тапом.</div>'
    + '<div class="spacer"></div>'
    + PRESET_KEYS.map(k=>
        '<button class="menuitem" data-slot="'+k+'"><span style="font-size:24px">'+ps[k].icon+'</span>'
        + '<span style="flex:1 1 auto">'+esc(ps[k].name)+'<div class="label-s mut">'
        + ps[k].days+' дн · '+(ps[k].split==="full"?"всё тело":"сплит")+' · '+ps[k].time+' мин</div></span>'
        + '<span class="mut">настроить ›</span></button>').join("")
    + '<div class="spacer"></div>'
    + '<button class="btn-text btn-wide" id="psReset">Вернуть стандартные пресеты</button>'
    + '<button class="btn-text btn-wide" id="psClose">Отмена</button>');
  $("sheetBody").querySelectorAll("[data-slot]").forEach(b=>{
    b.addEventListener("click", ()=>editPresetSlot(b.dataset.slot));
  });
  $("psReset").addEventListener("click", ()=>{
    resetPresets(); closeSheet(); renderPlanUI(); run(); toast("Пресеты сброшены");
  });
  $("psClose").addEventListener("click", ()=>closeSheet());
}
var _psIcon = null;
function editPresetSlot(key){
  const p = getPresets()[key], plan = Settings.plan();
  _psIcon = p.icon;
  openSheet(
    '<h2>Пресет «'+esc(p.name)+'»</h2>'
    + '<div class="body-m mut">Запишется текущая настройка: '+plan.days+' тренировок · '
    +   (plan.split==="full" ? "всё тело" : "сплит") + ' · ' + (TIME[plan.time]||TIME[70]).label + '.</div>'
    + '<div class="field" style="margin-top:14px"><label>Название</label>'
    +   '<input type="text" id="psName" value="'+esc(p.name)+'" maxlength="20"></div>'
    + '<div class="field"><label>Подпись под названием</label>'
    +   '<input type="text" id="psTag" value="'+esc(p.tag)+'" maxlength="60"></div>'
    + '<div class="field"><label>Иконка</label><div class="iconpick" id="psIcons">'
    +   PRESET_ICONS.map(ic=>'<button class="icopt'+(ic===p.icon?" on":"")+'" data-ic="'+ic+'">'+ic+'</button>').join("")
    + '</div></div>'
    + '<div class="field"><label>Описание (видно под карточками)</label>'
    +   '<textarea id="psDesc" maxlength="200">'+esc(p.desc)+'</textarea></div>'
    + '<button class="btn-filled btn-wide" id="psSave">Сохранить</button>'
    + '<button class="btn-text btn-wide" id="psBack">Назад</button>');
  $("psIcons").addEventListener("click", e=>{
    const b = e.target.closest("[data-ic]"); if(!b) return;
    _psIcon = b.dataset.ic;
    $("psIcons").querySelectorAll(".icopt").forEach(x=>x.classList.toggle("on", x === b));
  });
  $("psSave").addEventListener("click", ()=>{
    savePreset(key, Settings.plan(), {
      name: $("psName").value.trim() || p.name,
      tag:  $("psTag").value.trim()  || p.tag,
      desc: $("psDesc").value.trim() || p.desc,
      icon: _psIcon || p.icon
    });
    Settings.set({plan: Object.assign({}, Settings.plan(), {preset: key})});
    closeSheet(); renderPlanUI(); run();
    toast("Пресет «" + getPresets()[key].name + "» сохранён");
  });
  $("psBack").addEventListener("click", openSavePreset);
}
function tunePlan(patch){
  const plan = Settings.plan();
  Settings.set({plan: Object.assign({}, plan, patch, {preset:"custom"})});
  renderPlanUI(); run();
}
function renderPlanUI(){
  const plan = Settings.plan();
  const PS = getPresets();
  $("presets").innerHTML = PRESET_KEYS.map(k=>{
    const p = PS[k];
    return '<button class="preset'+(plan.preset===k?" on":"")+'" data-preset="'+k+'">'
      + '<div class="ic">'+p.icon+'</div><div class="nm">'+esc(p.name)+'</div>'
      + '<div class="tg">'+esc(p.tag)+'</div></button>';
  }).join("") + (plan.preset==="custom"
      ? '<div class="preset on custom"><div class="nm">Свой план</div>'
        + '<div class="tg">'+plan.days+' дн · '+(plan.split==="full"?"всё тело":"сплит")+' · '+plan.time+' мин</div></div>'
      : "");
  const pd = PS[plan.preset];
  $("presetDesc").textContent = pd ? pd.desc : "Настроено вручную: " + plan.days + " тренировок, "
      + (plan.split==="full" ? "всё тело" : "сплит") + ", " + (TIME[plan.time]||TIME[70]).label
      + ". Можно сохранить это в пресет.";

  $("daysSeg").innerHTML = [2,3,4,5,6].map(d=>
    '<button data-days="'+d+'" class="'+(plan.days===d?"on":"")+'">'+d+'</button>').join("");
  $("splitSeg").innerHTML = [["full","Всё тело"],["split","Сплит"]].map(([v,n])=>
    '<button data-split="'+v+'" class="'+(plan.split===v?"on":"")+'">'+n+'</button>').join("");
  $("timeSeg").innerHTML = Object.keys(TIME).map(t=>
    '<button data-time="'+t+'" class="'+(plan.time==+t?"on":"")+'">'+TIME[t].label+'</button>').join("");

  const sched = scheduleForWeek(plan);
  $("weekdayChips").innerHTML = [1,2,3,4,5,6,0].map(d=>{
    const on = (plan.weekdays||[]).indexOf(d) >= 0;
    const S = SESSIONS[sched[d]];
    return '<button class="wdchip'+(on?" on":"")+'" data-wd="'+d+'">'
      + '<span class="dw">'+RU_DOW[d]+'</span>'
      + '<span class="sub">'+(S ? (S.icon+" "+esc(shortName(sched[d]))) : "—")+'</span></button>';
  }).join("");

  const st = Settings.get();
  const curKey = sessionForToday(plan, st);
  const opts = ["low","low2","upperA","upperB","metcon","func","fbA","fbB","fbC","recovery","recoveryLong"];
  $("todayChips").innerHTML = opts.map(k=>
    '<button class="chip'+(curKey===k?" on":"")+'" data-today="'+k+'">'+SESSIONS[k].icon+' '+esc(shortName(k))+'</button>'
  ).join("");
}

/* ---------- пересчёт дня ---------- */
function run(){
  const items = readItems();
  const index = computeIndex(items);
  const {z} = baselineZ(index);
  const t = buildToday(index, z);
  const plan = Settings.plan();

  const rec = Store.get("checkins", "ci_"+today()) || {id:"ci_"+today(), date:today()};
  Object.assign(rec, {
    deletedAt:null, index, z, mode:t.mode.key, scale:5, items,
    sessionKey:t.sessionKey, time:plan.time,
    plan:{preset:plan.preset, days:plan.days, split:plan.split, volume:plan.volume}
  });
  Store.upsert("checkins", rec);

  buildCurrent(t, index, z);
  renderTrain(); refreshHome(); renderCalendar(); drawChart(); renderLog();
  return t;
}

/* ---------- экран «Сегодня» ---------- */
function greeting(){
  const h = new Date().getHours();
  const g = getContent().greetings;
  const pool = h < 12 ? g.morning : h < 18 ? g.day : g.evening;
  return applyVars(pool[Math.floor(Math.random()*pool.length)]);
}
var _greetCache = null;
function refreshHome(){
  const st = Settings.get(), plan = st.plan;
  const nm = (st.name||"").trim();
  $("avatar").textContent = (nm ? nm[0] : "Б").toUpperCase();
  if(!_greetCache || _greetCache.date !== today()) _greetCache = {date: today(), text: greeting()};
  $("greet").textContent = _greetCache.text;
  $("todayDate").textContent = new Date().toLocaleDateString("ru-RU",
      {weekday:"long", day:"numeric", month:"long"});

  const sd = streakDays();
  $("streakChip").hidden = sd < 2;
  $("streakN").textContent = sd;

  // плашка
  const m = motivToday();
  const mv = $("motiv");
  mv.className = "motiv" + (m.cat==="decline_two_weeks" || m.cat==="missed" ? " warn" : "");
  mv.innerHTML = '<span class="em">'+m.emoji+'</span><span class="tx">'+esc(m.text)+'</span>';

  // кольца
  const ci = checkins().find(r=>r.date===today());
  const idx = ci ? ci.index : null;
  const wk = weekKey(today());

  // прогресс по объёму: сделано против того, что заложила программа
  const doneToday = dayTonnage(today()) + (current ? sessionTonnage(current) : 0);
  const planDay   = plannedDayTonnage();
  const doneWeek  = weekTonnage(wk) + (current ? sessionTonnage(current) : 0);
  const planWeek  = plannedWeekTonnage();
  const z2        = weekZone2(wk);

  const rows = [
    // в день без силовой плана нет: кольцо закрывается кардио, а не делением на ноль
    planDay
      ? {p: doneToday/planDay, color:"primary", label:"День",
         sub: fmtT(doneToday) + " из " + fmtT(planDay)}
      : {p: (doneToday > 0 || (current && current.cardio && current.cardio.done)) ? 1 : 0,
         color:"primary", label:"День",
         sub: doneToday > 0 ? fmtT(doneToday) : "восстановление"},
    {p: planWeek ? doneWeek/planWeek : 0, color:"secondary", label:"Неделя",
     sub: fmtT(doneWeek) + " из " + fmtT(planWeek)},
    {p: z2/Z2_GOAL, color:"amber", label:"Zone 2",
     sub: z2 + " из " + Z2_GOAL + " мин"}
  ];
  const mode = ci ? modeOf(ci.index, ci.z) : null;
  // одно толстое кольцо — индекс готовности; прогресс по объёму ушёл в полоски справа
  renderRing($("rings"), {
    p: (idx||0)/100, color: mode ? mode.tone : "primary",
    top: "готовность", main: idx == null ? "—" : idx,
    sub: idx == null ? "нет данных" : "из 100",
    aria: "Индекс готовности " + (idx == null ? "не рассчитан" : idx)
  });
  $("modeChipWrap").innerHTML = mode
    ? '<span class="mchip '+mode.key+'">'+esc(mode.name)+' · RPE '+esc(mode.rpe)+'</span>'
    : '<span class="label-m mut">Заполни шкалы, чтобы получить режим дня</span>';
  renderBars($("ringLegend"), rows);

  renderTodayCard(ci, mode);
  renderQuickStats(plan, wk);
  renderPlanUI();
}
function renderTodayCard(ci, mode){
  const box = $("todayCard");
  if(!ci || !current){
    box.innerHTML = '<h2>Тренировка сегодня</h2><div class="body-m mut">'
      + 'Заполни шкалы и нажми «Рассчитать индекс» — программа соберётся под твою готовность.</div>';
    return;
  }
  const copy = getContent().modeCopy[current.mode] || {title:"", lines:[""]};
  const line = copy.lines[hashStr(today()) % copy.lines.length];
  const nEx = current.ex.length;
  const nSets = current.ex.reduce((a,e)=>a + (e.sets||0), 0);
  const M = MODES[current.mode] || {};
  box.innerHTML =
    '<h2>'+esc(copy.title)+'</h2>'
    + '<div class="body-m mut" style="margin:-6px 0 14px">'+esc(line)+'</div>'
    + '<div class="tile">'
    +   '<div class="title-m">'+current.icon+' '+esc(current.sessionName)+'</div>'
    +   '<div class="body-m mut" style="margin-top:4px">'
    +     (current.rec ? esc(nEx+" блока восстановления")
                       : esc(nEx+" упр. · "+nSets+" подходов · RPE "+(M.rpe||"—")))
    +   '</div>'
    +   '<div class="body-m mut">'+esc(current.cardio.type+" · "+current.cardio.min+" мин")
    +     (current.finisher ? " · финишер" : "") + '</div>'
    +   '<div class="body-m mut">⏳ примерно '+esc(fmtDur(current.estSec||0))
    +     ' <span class="label-s">(силовая '+esc(fmtDur(current.strengthSec||0))
    +     ' + кардио '+current.cardio.min+' мин)</span></div>'
    + '</div>'
    + '<button class="btn-filled btn-wide" id="goTrain" style="margin-top:14px">Начать →</button>';
  $("goTrain").addEventListener("click", ()=>tab("train"));
}
function renderQuickStats(plan, wk){
  const z2 = weekZone2(wk);
  const idx7 = checkins().slice(-7);
  const avg = idx7.length ? Math.round(idx7.reduce((a,r)=>a+r.index,0)/idx7.length) : null;
  const cells = [
    ["Zone 2 за неделю", z2 + " / " + Z2_GOAL + " мин"],
    ["Тоннаж недели",    fmtT(weekTonnage(wk))],
    ["Стрик",            streakDays() + " дн"],
    ["Индекс за 7 дней", avg == null ? "—" : avg]
  ];
  $("quickStats").innerHTML = cells.map(([t,v])=>
    '<div class="tile"><div class="label-m mut">'+esc(t)+'</div>'
    + '<div class="title-l num" style="margin-top:2px">'+esc(v)+'</div></div>').join("");
}

/* ---------- настройки ---------- */
function openSettings(){
  const st = Settings.get();
  openSheet(
    '<h2>Настройки</h2>'
  + '<div class="field"><label>Имя</label>'
  +   '<input type="text" id="setName" value="'+esc(st.name)+'" placeholder="бро"></div>'
  + '<h3>Тема</h3><div class="seg" id="themeSeg">'
  +   [["auto","Как в системе"],["light","Светлая"],["dark","Тёмная"]].map(([v,n])=>
        '<button data-theme="'+v+'" class="'+(st.theme===v?"on":"")+'">'+n+'</button>').join("")
  + '</div>'
  + '<h3>Неделя</h3>'
  + '<div class="body-m mut">Пресеты и расписание — на вкладке «Сегодня», карточка «Неделя».</div>'
  + '<h3>ИИ</h3><div id="aiSettings"></div>'
  + '<h3>Контент</h3><div class="chips">'
  +   '<button class="chip" id="cExp">Экспорт JSON</button>'
  +   '<button class="chip" id="cImp">Импорт JSON</button>'
  +   '<button class="chip" id="cAi">Пополнить через ИИ</button>'
  +   '<button class="chip" id="cReset">Сбросить</button></div>'
  + '<h3>Синхронизация (экспериментально)</h3><div id="syncSettings"></div>'
  + '<h3>О приложении</h3>'
  + '<div class="body-m mut">Версия '+APP_VERSION+'. Данные хранятся только в этом браузере: '
  +   'чек-ины, сессии, настройки, контент, фото (IndexedDB). Ключ ИИ никогда не попадает в экспорт.</div>'
  + '<div class="spacer"></div>'
  + '<button class="btn-filled btn-wide" id="setDone">Готово</button>');

  renderAiSettings($("aiSettings"));
  renderSyncSettings($("syncSettings"));

  $("themeSeg").addEventListener("click", e=>{
    const b = e.target.closest("[data-theme]"); if(!b) return;
    Settings.set({theme: b.dataset.theme}); initTheme(); drawChart();
    $("themeSeg").querySelectorAll("button").forEach(x=>x.classList.toggle("on", x===b));
  });
  $("cExp").addEventListener("click", ()=>{
    dl("eig-content-"+today()+".json", JSON.stringify(getContent(), null, 2));
    toast("Контент выгружен");
  });
  $("cImp").addEventListener("click", ()=>importContentFile());
  $("cAi").addEventListener("click", ()=>enrichContentWithAI());
  $("cReset").addEventListener("click", ()=>{
    resetContent(); toast("Контент сброшен к стандартному"); refreshHome();
  });
  $("setDone").addEventListener("click", ()=>{
    Settings.set({name: $("setName").value.trim()});
    closeSheet(); refreshHome();
  });
}
function importContentFile(){
  const inp = $("jsonInput");
  inp.onchange = ()=>{
    const f = inp.files && inp.files[0];
    inp.value = "";
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      let o;
      try{ o = JSON.parse(r.result); }
      catch(e){ toast("Не похоже на JSON"); return; }
      const err = validateContent(o);
      if(err){ toast("Файл не подходит: " + err); return; }
      setContent(o); toast("Контент загружен"); refreshHome();
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ---------- Service Worker ---------- */
function initSW(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(reg=>{
    reg.addEventListener("updatefound", ()=>{
      const nw = reg.installing;
      if(!nw) return;
      nw.addEventListener("statechange", ()=>{
        if(nw.state === "installed" && navigator.serviceWorker.controller){
          $("updateBar").classList.add("on");
          $("updateBtn").onclick = ()=>{
            if(reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
            $("updateBar").classList.remove("on");
          };
        }
      });
    });
  }).catch(()=>{});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(reloading) return; reloading = true; location.reload();
  });
}

/* ---------- запуск ---------- */
function bindUI(){
  $("nav").addEventListener("click", e=>{
    const b = e.target.closest("button[data-tab]"); if(b) tab(b.dataset.tab);
  });
  $("themeBtn").addEventListener("click", cycleTheme);
  $("settingsBtn").addEventListener("click", openSettings);
  $("runBtn").addEventListener("click", ()=>{ run(); toast("Индекс пересчитан"); });
  $("resetBtn").addEventListener("click", resetForm);
  $("scrim").addEventListener("click", ()=>closeSheet());

  $("presets").addEventListener("click", e=>{
    const b = e.target.closest("[data-preset]"); if(b) applyPreset(b.dataset.preset);
  });
  $("daysSeg").addEventListener("click", e=>{
    const b = e.target.closest("[data-days]"); if(!b) return;
    const d = +b.dataset.days;
    tunePlan({days:d, weekdays: DEFAULT_WEEKDAYS[d].slice()});
  });
  $("splitSeg").addEventListener("click", e=>{
    const b = e.target.closest("[data-split]"); if(b) tunePlan({split:b.dataset.split});
  });
  $("timeSeg").addEventListener("click", e=>{
    const b = e.target.closest("[data-time]"); if(b) tunePlan({time:+b.dataset.time});
  });
  $("weekdayChips").addEventListener("click", e=>{
    const b = e.target.closest("[data-wd]"); if(!b) return;
    const d = +b.dataset.wd, plan = Settings.plan();
    const wd = (plan.weekdays||[]).slice();
    const i = wd.indexOf(d);
    if(i >= 0){ if(wd.length <= 2){ toast("Минимум 2 дня в неделю"); return; } wd.splice(i,1); }
    else wd.push(d);
    tunePlan({weekdays: wd, days: clamp(wd.length, 2, 6)});
  });
  $("savePresetBtn").addEventListener("click", openSavePreset);
  $("todayChips").addEventListener("click", e=>{
    const b = e.target.closest("[data-today]"); if(!b) return;
    Settings.set({todayOverride:{date: today(), sessionKey: b.dataset.today}});
    run(); toast("Сегодня: " + SESSIONS[b.dataset.today].name);
  });

  $("calPrev").addEventListener("click", ()=>calShift(-1));
  $("calNext").addEventListener("click", ()=>calShift(1));
  $("chart").addEventListener("click", chartTip);

  $("expJson").addEventListener("click", ()=>{ new FileAdapter().push(Sync.snapshot()); toast("Снапшот выгружен"); });
  $("impJson").addEventListener("click", ()=>importSnapshotFile());
  $("expCsv").addEventListener("click", exportCSV);

  bindTrainUI();
  bindPhotoUI();
  window.addEventListener("resize", ()=>drawChart());
}

function boot(){
  Store.vacuum();
  checkSymbolsFont();
  initTheme();
  renderScales();
  bindUI();
  renderPlanUI();

  const ci = checkins().find(r=>r.date === today());
  if(ci){
    setItems(ci.items || {}, ci.scale === 5);
    run();
  }else{
    restoreDraftOnly();
    refreshHome(); renderTrain(); renderCalendar(); drawChart(); renderLog();
  }
  tab("today");
  initSW();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
