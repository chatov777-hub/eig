/* train.js — текущая сессия: подходы, пипсы, секундомер, таймер отдыха, APRE, финиш.
   Экспортирует: current, buildCurrent(), restoreDraftOnly(), renderTrain(), logSet(), editSet(),
   restStart(), restStop(), toggleCardio(), calcApre(), finishWorkout(), sessionTonnage(),
   bindTrainUI(), saveDraft(). */

var current = null;
var tickHandle = null;

function saveDraft(){ if(current) ls.set(K_DRAFT, current); }

/* черновик переиспользуется, если это тот же день и та же сессия */
function buildCurrent(t, index, z){
  const plan = Settings.plan();
  const draft = ls.get(K_DRAFT, null);
  const same = draft && draft.date === today() && draft.sessionKey === t.sessionKey;

  const ex = t.list.map(e=>{
    const old = same ? (draft.ex||[]).find(o=>o.id === e.id && o.block === e.block) : null;
    if(!old) return e;
    const log = (e.log||[]).map((_,i)=>(old.log && old.log[i]) || null);
    return Object.assign({}, e, {
      log, skipped: !!old.skipped,
      w: old.w || e.w,          // пустой черновик не затирает подставленный вес
      r: old.r || e.r,
      rest: old.restCustom ? old.rest : e.rest, restCustom: !!old.restCustom
    });
  });

  current = {
    sessionId: same && draft.sessionId ? draft.sessionId : uid("s"),
    date: today(), sessionKey: t.sessionKey, sessionName: t.sessionName, icon: t.icon,
    mode: t.mode.key, modeName: t.mode.name, modeCls: t.mode.key,
    index, z, time: plan.time,
    plan:{preset:plan.preset, days:plan.days, split:plan.split, volume:plan.volume},
    ex,
    // минуты кардио из черновика берём только если их правил сам пользователь,
    // иначе после смены длительности занятия осталось бы старое число
    cardio:{ type:t.cardio.type,
             min: (same && draft.cardio && draft.cardio.custom) ? draft.cardio.min : t.cardio.min,
             custom: !!(same && draft.cardio && draft.cardio.custom),
             done: !!(same && draft.cardio && draft.cardio.done) },
    apre: same && draft.apre ? draft.apre : {reps:"", advice:""},
    rpe: t.mode.rpe, finisher: t.finisher, canApre: !!t.mode.apre, rec: t.rec,
    startedAt: same ? draft.startedAt : null,
    pausedAt:  same ? draft.pausedAt  : null,
    pausedMs:  same ? (draft.pausedMs||0) : 0,
    rest:      same ? (draft.rest||null) : null,
    photos:    same ? (draft.photos||[]) : []
  };
  // оценка считается по итоговому составу и фактическим минутам кардио
  // (из черновика они могли остаться от прошлой настройки)
  current.strengthSec = listDurationSec(current.ex);
  current.estSec = current.strengthSec + (current.cardio.min || 0) * 60;

  saveDraft();
  if(current.startedAt || current.rest) startTick();
  return current;
}
/* старт без чек-ина: только восстановить вчерашний/сегодняшний черновик */
function restoreDraftOnly(){
  const draft = ls.get(K_DRAFT, null);
  if(draft && draft.date === today()){
    current = draft;
    if(current.startedAt || current.rest) startTick();
  }
}

/* ---------- отрисовка ---------- */
function exDone(e){ return e.skipped || (e.log.length > 0 && e.log.every(Boolean)); }
function sessionTonnage(c){
  const s = c || current;
  if(!s) return 0;
  return s.ex.reduce((a,e)=>a + (e.log||[]).reduce((b,l)=>b + (l ? (+l.w||0)*(+l.r||0) : 0), 0), 0);
}
function nextEmptyIn(e){ return (e.log||[]).findIndex(x=>!x); }
function nextOpenEx(fromI){
  for(let i = fromI+1; i < current.ex.length; i++) if(!exDone(current.ex[i])) return current.ex[i];
  for(let i = 0; i <= fromI; i++) if(!exDone(current.ex[i])) return current.ex[i];
  return null;
}

function renderTrain(){
  const head = $("trainHead");
  if(!current){ renderDayDone(); return; }
  $("clockCard").classList.remove("hide");
  $("trainList").classList.remove("hide");
  $("cardioCard").classList.remove("hide");
  $("dayDone").classList.add("hide");
  $("finishBtn").classList.remove("hide");
  const doneN = current.ex.filter(exDone).length + (current.cardio.done ? 1 : 0);
  const totalN = current.ex.length + 1;
  head.innerHTML =
    '<div class="row between"><h2 style="margin:0">'+current.icon+' '+esc(current.sessionName)+'</h2>'
    + '<span class="mchip '+current.modeCls+'">'+esc(current.modeName)+'</span></div>'
    + '<div class="body-m mut" style="margin-top:8px">RPE '+esc(current.rpe)
    +   ' · индекс '+current.index+' · готово '+doneN+' из '+totalN
    +   (current.finisher ? ' · финишер' : '')+'</div>'
    + (current.estSec ? '<div class="body-m mut">⏳ примерно '+esc(fmtDur(current.estSec))
        + ' вместе с кардио</div>' : '');

  const main = current.ex.filter(e=>e.block === "main");
  const core = current.ex.filter(e=>e.block === "core");
  let h = main.map(exRow).join("");
  if(core.length) h += '<h2 style="margin:18px 0 0">Кор</h2>' + core.map(exRow).join("");
  $("trainList").innerHTML = h;

  renderApre();
  renderCardio();
  $("tonnageLine").innerHTML = tonnageBlock(sessionTonnage(), current.sessionId, "Сегодня");
  updateClock();
  renderRest();
  renderTrainPhotos();
}
/* Экран после тренировки: что уже сделано сегодня, а не пустая заглушка. */
function renderDayDone(){
  const done = sessionsOn(today());
  // пустые карточки надо именно прятать: очищенный .card остаётся видимой плашкой
  ["trainList","apreCard","cardioCard"].forEach(id=>{
    $(id).innerHTML = ""; $(id).classList.add("hide");
  });
  $("finishBtn").classList.add("hide");
  $("clockCard").classList.add("hide");
  $("dayDone").classList.remove("hide");

  if(!done.length){
    $("trainHead").innerHTML = '<h2>Тренировка</h2><div class="body-m mut">'
      + 'Сначала заполни шкалы на вкладке «Сегодня» и нажми «Рассчитать индекс».</div>';
    $("dayDone").innerHTML = "";
    return;
  }
  const tn    = done.reduce((a,s)=>a + tonnage(s), 0);
  const sets  = done.reduce((a,s)=>a + sessionSets(s), 0);
  const dur   = done.reduce((a,s)=>a + (s.durationSec||0), 0);
  const z2    = done.reduce((a,s)=>a + ((s.cardio && s.cardio.done) ? (+s.cardio.min||0) : 0), 0);
  const prs   = done.reduce((a,s)=>a.concat(s.prs||[]), []);
  const name  = (Settings.get().name||"").trim() || "бро";

  $("trainHead").innerHTML =
    '<h2>На сегодня всё '+(done.length > 1 ? '×'+done.length : '')+'</h2>'
    + '<div class="body-m mut">'+esc(done.map(s=>s.icon+" "+s.sessionName).join(" · "))+'</div>';

  $("dayDone").innerHTML =
    '<div class="card">'
    +   tonnageBlock(tn, today(), done.length > 1 ? "Всего за день" : "Тоннаж")
    +   '<div class="grid2" style="margin-top:12px">'
    +     statTile("Подходов", sets) + statTile("Время", dur ? mmss(dur) : "—")
    +     statTile("Кардио", z2 + " мин") + statTile("Рекордов", prs.length)
    +   '</div>'
    +   (prs.length ? '<div class="body-m" style="margin-top:10px">🏆 '
        + esc(prs.map(p=>(EX[p.ex]?EX[p.ex].n:p.ex)+" "+p.w+" кг").join(", ")) + '</div>' : '')
    + '</div>'
    + '<div class="motiv"><span class="em">🤝</span><span class="tx">'
    +   esc(applyVars(respectLine(tn, prs.length, done.length))) + '</span></div>'
    + '<div class="card">'
    +   '<div class="row" style="gap:8px;flex-wrap:wrap">'
    +     '<button class="btn-tonal" id="ddPhoto" style="flex:1 1 150px">📷 Добавить фото</button>'
    +     '<button class="btn-filled" id="ddMore" style="flex:1 1 150px">Ещё тренировка</button>'
    +   '</div>'
    +   '<div class="photogrid" id="ddPhotos"></div>'
    + '</div>';
  renderPhotoGrid($("ddPhotos"), today());
  $("ddPhoto").addEventListener("click", ()=>addPhotos(today()));
  $("ddMore").addEventListener("click", ()=>{
    ls.del(K_DRAFT);           // новая тренировка, а не продолжение закрытой
    run(); tab("train");
    toast("Погнали ещё раз");
  });
}
function statTile(t, v){
  return '<div class="tile"><div class="label-m mut">'+esc(t)+'</div>'
       + '<div class="title-l num" style="margin-top:2px">'+esc(String(v))+'</div></div>';
}
/* респект от Бро — по итогу дня */
function respectLine(tn, prsN, nSessions){
  const pool = prsN ? [
      "Рекорд сегодня. Респект, {name} — это уже другая лига.",
      "Ты сдвинул свой потолок. Такие дни и делают результат.",
      "Личник взят. Запиши этот день, к нему будешь возвращаться."
    ] : nSessions > 1 ? [
      "Две тренировки за день. {name}, ты сегодня не человек, а график.",
      "Двойная порция. Завтра восстановление — не спорь.",
      "Дважды за день — уважение. Только не делай это привычкой без сна."
    ] : tn >= 6000 ? [
      "Отработал как надо. Респект, {name}.",
      "Тяжёлый объём закрыт. Это и есть прогресс, а не разговоры о нём.",
      "Мощно. Теперь еда, вода и сон — они доделают остальное."
    ] : tn >= 1500 ? [
      "Сделано ровно и по делу. Респект, {name}.",
      "Не рекорд, но честная работа. Из таких дней и складывается год.",
      "Закрыл — молодец. Стабильность бьёт геройство."
    ] : [
      "Мало — не значит зря. Пришёл и сделал, {name}. Респект.",
      "Лёгкий день тоже считается. Главное — не пропустил.",
      "Короткая сессия лучше нулевой. Завтра добавим."
    ];
  return pool[Math.floor(Math.random()*pool.length)];
}

function exRow(e){
  const i = current.ex.indexOf(e);
  const eq = EQ[e.eq] || null;
  const meta = (eq ? esc(eq.n) + ' · ' : '')
    + (e.sets
        ? esc(e.t) + ' · ' + e.sets + ' × ' + esc(e.reps) + ' · пауза ' + e.rest + ' с'
        : esc(e.t) + ' · ' + esc(e.reps));
  const pips = e.sets
    ? Array.from({length: e.sets}, (_,s)=>
        '<button class="pip'+(e.log[s] ? " done" : "")+'" data-pip="'+i+'" data-set="'+s+'">'+(s+1)+'</button>').join("")
    : '<button class="pip'+(e.log[0] ? " done" : "")+'" data-pip="'+i+'" data-set="0">✓</button>';
  const logged = (e.log||[]).filter(Boolean);
  const logLine = logged.length
    ? logged.map(l=>(+l.w ? fmtNum(l.w, l.w % 1 ? 1 : 0) + "×" + l.r : l.r + " повт")).join(" · ")
      + (logged.some(l=>l.restActual)
          ? ' · отдых ' + mmss(logged.filter(l=>l.restActual)
              .reduce((a,l)=>a + l.restActual, 0) / logged.filter(l=>l.restActual).length)
          : "")
    : "";
  return '<div class="ex'+(exDone(e) ? " off" : "")+(e.skipped ? " skip" : "")+'" data-i="'+i+'">'
    + '<div class="ex-head">'
    +   (eq ? '<span class="ex-eq" title="'+esc(eq.n)+'">'+eq.ic+'</span>' : '')
    +   '<span class="ex-name">'+esc(e.n)+'</span>'
    +   (e.apre && current.canApre ? '<span class="tag">APRE</span>' : "")
    +   '<button class="ex-menu" data-menu="'+i+'">⋯</button></div>'
    + '<div class="ex-hint">'+meta+'</div>'
    + (e.sets ? '<div class="ex-vals">'
    +   '<button class="chip val" data-f="w" data-i="'+i+'">'+(e.w ? esc(e.w)+" кг" : "вес")+' ▾</button>'
    +   '<button class="chip val" data-f="r" data-i="'+i+'">'+(e.r ? esc(e.r)+" повт" : "повторы")+' ▾</button>'
    + '</div>' : "")
    + '<div class="pips">'+pips+'</div>'
    + (logLine ? '<div class="ex-log">'+esc(logLine)+'</div>' : "")
    + '</div>';
}
function renderApre(){
  const box = $("apreCard");
  const ap = current.ex.find(e=>e.apre);
  if(!ap || !current.canApre){ box.innerHTML = ""; box.classList.add("hide"); return; }
  box.classList.remove("hide");
  box.innerHTML =
    '<h2>APRE · '+esc(ap.n)+'</h2>'
    + '<div class="body-m mut">Третий подход — до технического отказа. Введи, сколько получилось: '
    +   'коридор 12 повторов.</div>'
    + '<div class="apre-row">'
    +   '<input type="text" inputmode="numeric" id="apreReps" value="'+esc(current.apre.reps||"")+'" '
    +     'placeholder="повторов">'
    +   '<button class="btn-tonal" id="apreBtn">Рассчитать</button></div>'
    + '<div class="body-m" id="apreOut" style="margin-top:10px">'+(current.apre.advice||"")+'</div>';
  $("apreBtn").addEventListener("click", ()=>calcApre());
}
function renderCardio(){
  const c = current.cardio;
  $("cardioCard").innerHTML =
    '<div class="row between"><div style="min-width:0"><div class="title-m">'+esc(c.type)+'</div>'
    + '<div class="body-m mut">'+esc(CARDIO_HELP[c.type] || "")+'</div>'
    + '<div class="label-s mut">'+(current.rec ? "основная работа дня" : "после силовой")+'</div></div>'
    + '<button class="chip" id="cardioMin" style="flex:0 0 auto">'+c.min+' мин ▾</button></div>'
    + '<button class="'+(c.done ? "btn-filled" : "btn-tonal")+' btn-wide" id="cardioBtn" style="margin-top:14px">'
    + (c.done ? "✓ Кардио сделано" : "Отметить кардио") + '</button>';
  $("cardioBtn").addEventListener("click", toggleCardio);
  $("cardioMin").addEventListener("click", ()=>pickMinutes(c.min, v=>{
    current.cardio.min = +v; current.cardio.custom = true;
    current.estSec = (current.strengthSec || 0) + current.cardio.min*60;
    saveDraft(); renderTrain(); refreshHome();
  }));
}
function renderTrainPhotos(){
  renderPhotoGrid($("trainPhotos"), today());
}

/* ---------- действия с подходами ---------- */
function logSet(i, s){
  const e = current.ex[i];
  if(!e) return;
  const w = parseFloat(String(e.w).replace(",", ".")) || 0;
  const r = parseInt(e.r, 10) || 0;
  e.log[s] = {w, r, at: Date.now(), restActual: null};
  if(!current.startedAt) clockStart();

  checkPR(e, w);
  if(e.rest) restStart(i, s);
  const toasts = getContent().setToasts;
  toast(toasts[Math.floor(Math.random()*toasts.length)]);
  try{ navigator.vibrate && navigator.vibrate(20); }catch(err){}

  if(e.apre && current.canApre && s === 2 && r > 0) calcApre(r, true);
  saveDraft(); renderTrain(); refreshHome();
}
function checkPR(e, w){
  if(!w) return;
  const m = prMap();
  const prev = m[e.id];
  if(prev != null && w > prev){
    current.prs = current.prs || [];
    if(!current.prs.some(p=>p.ex === e.id)) current.prs.push({ex: e.id, w});
    toast("🏆 Рекорд: " + e.n + " " + fmtNum(w, w % 1 ? 1 : 0) + " кг", 3200);
  }
}
function editSet(i, s){
  const e = current.ex[i], l = e.log[s];
  openSheet(
    '<h2>Подход '+(s+1)+' · '+esc(e.n)+'</h2>'
    + '<div class="body-m mut">Записано: '+fmtNum(l.w, l.w % 1 ? 1 : 0)+' кг × '+l.r+' повт.</div>'
    + '<div class="spacer"></div>'
    + '<button class="menuitem" id="edW">✏️ Изменить вес</button>'
    + '<button class="menuitem" id="edR">✏️ Изменить повторы</button>'
    + '<button class="menuitem" id="edDel">↩️ Отменить подход</button>'
    + '<div class="spacer"></div>'
    + '<button class="btn-text btn-wide" id="edClose">Закрыть</button>');
  $("edW").addEventListener("click", ()=>pickWeight(l.w, v=>{
    l.w = parseFloat(v) || 0; saveDraft(); closeSheet(); renderTrain(); refreshHome();
  }));
  $("edR").addEventListener("click", ()=>pickReps(l.r, v=>{
    l.r = parseInt(v,10) || 0; saveDraft(); closeSheet(); renderTrain(); refreshHome();
  }));
  $("edDel").addEventListener("click", ()=>{
    e.log[s] = null;
    if(current.rest && current.rest.exIndex === i && current.rest.setIndex === s) restStop(true);
    saveDraft(); closeSheet(); renderTrain(); refreshHome();
  });
  $("edClose").addEventListener("click", ()=>closeSheet());
}
function exMenu(i){
  const e = current.ex[i];
  openSheet(
    '<h2>'+esc(e.n)+'</h2>'
    + '<button class="menuitem" id="mSkip">'+(e.skipped ? "↩️ Вернуть упражнение" : "⏭️ Пропустить упражнение")+'</button>'
    + (e.rest ? '<button class="menuitem" id="mRest">⏱️ Своя пауза (сейчас '+e.rest+' с)</button>' : "")
    + '<button class="menuitem" id="mClear">🧹 Сбросить подходы</button>'
    + '<div class="spacer"></div>'
    + '<button class="btn-text btn-wide" id="mClose">Закрыть</button>');
  $("mSkip").addEventListener("click", ()=>{
    e.skipped = !e.skipped; saveDraft(); closeSheet(); renderTrain(); refreshHome();
  });
  if(e.rest) $("mRest").addEventListener("click", ()=>pickSeconds(e.rest, v=>{
    e.rest = parseInt(v,10) || e.rest; e.restCustom = true;
    saveDraft(); closeSheet(); renderTrain();
  }));
  $("mClear").addEventListener("click", ()=>{
    e.log = e.log.map(()=>null);
    if(current.rest && current.rest.exIndex === i) restStop(true);
    saveDraft(); closeSheet(); renderTrain(); refreshHome();
  });
  $("mClose").addEventListener("click", ()=>closeSheet());
}
function toggleCardio(){
  current.cardio.done = !current.cardio.done;
  saveDraft(); renderTrain(); refreshHome();
  if(current.cardio.done) toast("Кардио засчитано 🚶");
}

/* ---------- секундомер (время от меток: сворачивание не сбивает счёт) ---------- */
function clockStart(){
  current.startedAt = Date.now(); current.pausedAt = null; current.pausedMs = 0;
  saveDraft(); startTick();
}
function clockToggle(){
  if(!current) return;
  if(!current.startedAt){ clockStart(); }
  else if(current.pausedAt){
    current.pausedMs += Date.now() - current.pausedAt;
    current.pausedAt = null; startTick();
  }else{ current.pausedAt = Date.now(); }
  saveDraft(); updateClock();
}
function elapsedSec(){
  if(!current || !current.startedAt) return 0;
  const end = current.pausedAt || Date.now();
  return Math.max(0, (end - current.startedAt - (current.pausedMs||0)) / 1000);
}
function updateClock(){
  const el = $("clockVal");
  if(!el || !current) return;
  el.textContent = mmss(elapsedSec());
  const box = $("clock"), btn = $("clockBtn");
  const running = current.startedAt && !current.pausedAt;
  box.classList.toggle("run", !!running);
  btn.textContent = !current.startedAt ? "Старт" : (current.pausedAt ? "Продолжить" : "Пауза");
}

/* ---------- таймер отдыха ---------- */
function restStart(i, s){
  const e = current.ex[i];
  const t = Date.now();
  current.rest = {exIndex:i, setIndex:s, name:e.n, total:e.rest, startedAt:t, endsAt:t + e.rest*1000, fired:false};
  saveDraft(); startTick(); renderRest();
}
function restAdd(sec){
  if(!current || !current.rest) return;
  current.rest.endsAt += sec*1000;
  current.rest.total = Math.max(5, current.rest.total + sec);
  if(current.rest.endsAt > Date.now()) current.rest.fired = false;
  saveDraft(); renderRest();
}
function restStop(silent){
  if(!current || !current.rest) return;
  const r = current.rest;
  const e = current.ex[r.exIndex];
  if(e && e.log[r.setIndex]) e.log[r.setIndex].restActual = Math.round((Date.now() - r.startedAt)/1000);
  current.rest = null;
  saveDraft();
  $("timerBar").classList.remove("on","fin");
  if(!silent) renderTrain();
}
function renderRest(){
  const bar = $("timerBar");
  if(!current || !current.rest){ bar.classList.remove("on","fin"); return; }
  const r = current.rest;
  const e = current.ex[r.exIndex] || {};
  const left = (r.endsAt - Date.now()) / 1000;
  bar.classList.add("on");
  $("tbLab").textContent = "Отдых · " + (r.name || "");
  const nextS = nextEmptyIn(e);
  if(nextS >= 0){
    $("tbSub").textContent = "после подхода " + (r.setIndex+1) + "/" + (e.sets || 1);
    $("tbNext").textContent = "След. подход";
    $("tbNext").disabled = false;
  }else{
    const nx = nextOpenEx(r.exIndex);
    $("tbSub").textContent = "упражнение закрыто";
    $("tbNext").textContent = nx ? ("Дальше: " + nx.n) : "Всё закрыто";
    $("tbNext").disabled = true;
  }
  if(left <= 0){
    bar.classList.add("fin");
    $("tbVal").textContent = "+" + mmss(-left);
    $("tbProg").style.width = "100%";
    if(!r.fired){ r.fired = true; alarm(); }
  }else{
    bar.classList.remove("fin");
    $("tbVal").textContent = mmss(left);
    $("tbProg").style.width = Math.max(0, 100*left/r.total) + "%";
  }
}
function alarm(){
  try{ if(navigator.vibrate) navigator.vibrate([220,90,220]); }catch(e){}
  try{
    const A = window.AudioContext || window.webkitAudioContext; if(!A) return;
    const ctx = new A(); const t = ctx.currentTime;
    [0, 0.22].forEach(off=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.0001, t+off);
      g.gain.exponentialRampToValueAtTime(0.35, t+off+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+off+0.18);
      o.connect(g); g.connect(ctx.destination); o.start(t+off); o.stop(t+off+0.2);
    });
    setTimeout(()=>{ try{ ctx.close(); }catch(e){} }, 900);
  }catch(e){}
}
/* один тикер на секундомер и таймер отдыха */
function startTick(){
  if(tickHandle) return;
  tickHandle = setInterval(()=>{
    if(!current){ stopTick(); return; }
    if(current.startedAt && !current.pausedAt) updateClock();
    if(current.rest) renderRest();
    if(!current.rest && (!current.startedAt || current.pausedAt)) stopTick();
  }, 250);
}
function stopTick(){ if(tickHandle){ clearInterval(tickHandle); tickHandle = null; } }

/* ---------- APRE ---------- */
function calcApre(repsArg, silent){
  const el = $("apreReps");
  const reps = repsArg != null ? +repsArg : parseInt(el ? el.value : "", 10);
  const out = $("apreOut");
  if(!reps || reps < 1){ if(out) out.innerHTML = "Введи число повторов."; return; }
  const target = 12, d = reps - target;
  let txt;
  if(d <= -3)      txt = "снизить вес на 5–7%";
  else if(d <= -1) txt = "снизить вес на 2–3%";
  else if(d <= 1)  txt = "вес оставить прежним";
  else if(d <= 4)  txt = "добавить 2–3% к весу";
  else             txt = "добавить 5–7% к весу";
  const html = '4-й подход: <b>' + txt + '</b>.<br><span class="mut">Коридор ' + target
             + ' повторов, вышло ' + reps + '. Ту же поправку перенеси на стартовый вес следующей такой сессии.</span>';
  if(out) out.innerHTML = html;
  if(el) el.value = reps;
  current.apre = {reps: String(reps), advice: html};
  saveDraft();
  if(!silent) toast("APRE рассчитан");
}

/* ---------- завершение ---------- */
function finishWorkout(){
  if(!current){ toast("Нечего сохранять"); return; }
  const doneEx = current.ex.filter(e=>(e.log||[]).some(Boolean));
  if(!doneEx.length && !current.cardio.done){ toast("Отметь хотя бы один подход или кардио"); return; }
  restStop(true);

  const rests = [];
  current.ex.forEach(e=>(e.log||[]).forEach(l=>{ if(l && l.restActual) rests.push(l.restActual); }));
  const durationSec = Math.round(elapsedSec());
  const tn = sessionTonnage();
  // «прошлая» — в том числе более ранняя сегодняшняя, если за день их несколько
  const prevSession = sessions().filter(s=>tonnage(s) > 0 && s.id !== current.sessionId
                                        && s.date <= today())
                                .sort((a,b)=>(a.date + (a.savedAt||"")).localeCompare(b.date + (b.savedAt||"")))
                                .pop();

  const entry = {
    // у каждой тренировки свой id: за день их может быть несколько
    id: current.sessionId || uid("s"), date: today(), deletedAt: null,
    sessionKey: current.sessionKey, sessionName: current.sessionName, icon: current.icon,
    mode: current.mode, modeName: current.modeName, index: current.index, z: current.z, time: current.time,
    plan: current.plan,
    durationSec,
    avgRest: rests.length ? Math.round(rests.reduce((a,b)=>a+b,0)/rests.length) : null,
    totalRestSec: rests.reduce((a,b)=>a+b, 0),
    ex: current.ex.map(e=>({id:e.id, n:e.n, block:e.block, sets:e.sets, reps:e.reps, rest:e.rest,
                            log:e.log, skipped:e.skipped, apre:!!e.apre})),
    cardio: {type: current.cardio.type, min: current.cardio.min, done: !!current.cardio.done},
    apreReps: current.apre && current.apre.reps ? parseInt(current.apre.reps,10) : null,
    tonnage: tn,
    photos: (current.photos||[]).slice(),
    prs: (current.prs||[]).slice(),
    savedAt: nowISO()
  };
  Store.upsert("sessions", entry);
  ls.del(K_DRAFT);
  stopTick();

  confetti();
  const setsN = current.ex.reduce((a,e)=>a + (e.log||[]).filter(Boolean).length, 0);
  const grew = prevSession && tn > tonnage(prevSession);
  const closer = grew ? phrase("volume_increase_daily")
                      : getContent().setToasts[Math.floor(Math.random()*getContent().setToasts.length)];
  // эмблема по итогу: рекорд → кубок, рост тоннажа → ракета, иначе кулак
  const badge = entry.prs.length ? "🏆" : grew ? "🚀" : "👊";
  const badgeLine = entry.prs.length ? "Личный рекорд в кармане"
                  : grew ? "Сильнее, чем в прошлый раз" : "Ещё одна закрыта";
  openSheet(
    '<div class="finish-hero"><span class="fh-ic">'+badge+'</span>'
    + '<span><span class="title-l">Сессия закрыта</span>'
    + '<span class="body-m mut" style="display:block">'+esc(badgeLine)+'</span></span></div>'
    + tonnageBlock(tn, entry.id, "Тоннаж")
    + '<div class="tile"><div class="body-m">⏱️ Время: <b>'+mmss(durationSec)+'</b></div>'
    +   '<div class="body-m">🔁 Подходов: <b>'+setsN+'</b></div>'
    +   (prevSession ? '<div class="body-m mut">прошлая '+fmtT(tonnage(prevSession))+' '+(grew?"↑":"↓")+'</div>' : '')
    +   '<div class="body-m">😮‍💨 Средний отдых: <b>'+(entry.avgRest ? mmss(entry.avgRest) : "—")+'</b></div>'
    +   (entry.prs.length
        ? '<div class="body-m">🏆 Рекорды: <b>'+esc(entry.prs.map(p=>(EX[p.ex]?EX[p.ex].n:p.ex)+" "+p.w+" кг").join(", "))+'</b></div>'
        : '')
    + '</div>'
    + '<div class="motiv" style="margin:14px 0"><span class="em">'
    +   (grew ? "💥" : "👊") + '</span><span class="tx">'+esc(closer)+'</span></div>'
    + '<div class="row" style="gap:8px">'
    +   '<button class="btn-tonal" id="finPhoto" style="flex:1 1 auto">📷 Добавить фото</button>'
    +   '<button class="btn-filled" id="finOk" style="flex:1 1 auto">Ок</button></div>');
  $("finPhoto").addEventListener("click", ()=>addPhotos(today()));
  $("finOk").addEventListener("click", ()=>closeSheet());

  current = null;
  resetMotivToday();
  renderCalendar(); renderLog(); renderTrain(); refreshHome();
}

/* 120 частиц, 1.5 с, затем canvas удаляется */
function confetti(){
  const c = document.createElement("canvas");
  c.id = "confetti";
  c.width = window.innerWidth; c.height = window.innerHeight;
  document.body.appendChild(c);
  const x = c.getContext && c.getContext("2d");
  if(!x){ c.remove(); return; }
  const cs = getComputedStyle(document.documentElement);
  const cols = ["primary","secondary","tertiary","amber"].map(n=>(cs.getPropertyValue("--md-sys-color-"+n)||"#0a0").trim());
  const P = Array.from({length:120}, ()=>({
    x: Math.random()*c.width, y: -20 - Math.random()*c.height*0.4,
    vx: (Math.random()-0.5)*3, vy: 3 + Math.random()*5,
    s: 4 + Math.random()*6, a: Math.random()*6.28, va: (Math.random()-0.5)*0.3,
    col: cols[Math.floor(Math.random()*cols.length)]
  }));
  const t0 = Date.now();
  (function frame(){
    const el = Date.now() - t0;
    x.clearRect(0,0,c.width,c.height);
    P.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a);
      x.fillStyle = p.col; x.globalAlpha = Math.max(0, 1 - el/1500);
      x.fillRect(-p.s/2, -p.s/2, p.s, p.s*0.6);
      x.restore();
    });
    if(el < 1500) requestAnimationFrame(frame); else c.remove();
  })();
}

/* ---------- события ---------- */
function bindTrainUI(){
  $("clockBtn").addEventListener("click", clockToggle);
  $("finishBtn").addEventListener("click", finishWorkout);
  $("tbMinus").addEventListener("click", ()=>restAdd(-15));
  $("tbPlus").addEventListener("click", ()=>restAdd(15));
  $("tbDone").addEventListener("click", ()=>restStop(false));
  $("tbNext").addEventListener("click", ()=>{
    if(!current || !current.rest) return;
    const i = current.rest.exIndex, e = current.ex[i];
    const s = nextEmptyIn(e);
    if(s < 0) return;
    restStop(true);
    logSet(i, s);
  });
  $("trainList").addEventListener("click", e=>{
    const pip = e.target.closest("[data-pip]");
    if(pip){
      const i = +pip.dataset.pip, s = +pip.dataset.set;
      if(current.ex[i].log[s]) editSet(i, s); else logSet(i, s);
      return;
    }
    const val = e.target.closest(".chip.val");
    if(val){
      const i = +val.dataset.i, f = val.dataset.f, ex = current.ex[i];
      const cur = ex[f] || prefill(ex, f);
      (f === "w" ? pickWeight : pickReps)(cur, v=>{
        ex[f] = v; saveDraft(); renderTrain();
      });
      return;
    }
    const menu = e.target.closest("[data-menu]");
    if(menu) exMenu(+menu.dataset.menu);
  });
}
/* последний подход этого упражнения → последняя сессия с ним → низ диапазона повторов */
function prefill(ex, f){
  const last = (ex.log||[]).filter(Boolean).pop();
  if(last) return String(f === "w" ? last.w : last.r);
  const prev = sessions().slice().sort((a,b)=>b.date.localeCompare(a.date))
    .map(s=>(s.ex||[]).find(e=>e.id === ex.id)).filter(Boolean)
    .map(e=>(e.log||[]).filter(Boolean).pop()).filter(Boolean)[0];
  if(prev) return String(f === "w" ? prev.w : prev.r);
  return f === "w" ? "0" : String(repsLow(ex.reps));
}
