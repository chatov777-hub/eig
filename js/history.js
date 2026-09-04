/* history.js — календарь месяца, детали дня, сводка за 28 дней, список сессий, CSV.
   Экспортирует: renderCalendar(), calShift(), selDay(), renderCalDetail(), renderLog(),
   exportCSV(), importSnapshotFile(), sessionDetailHTML(). */

const MON = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
var calDate = (function(){ const d = new Date(); d.setDate(1); return d; })();
var calSel = null;
var _photoDates = new Set();

function calShift(n){ calDate.setMonth(calDate.getMonth() + n); renderCalendar(); }
function selDay(ds){ calSel = (calSel === ds ? null : ds); renderCalendar(); }

function renderCalendar(){
  const grid = $("calGrid");
  if(!grid) return;
  const y = calDate.getFullYear(), mo = calDate.getMonth();
  $("calTitle").textContent = MON[mo] + " " + y;

  const start = (new Date(y, mo, 1).getDay() + 6) % 7;   // 0 = понедельник
  const days = new Date(y, mo+1, 0).getDate();
  const cs = checkins(), ss = sessions();
  const byDate = {};                       // за день может быть несколько тренировок
  ss.forEach(s=>{ (byDate[s.date] = byDate[s.date] || []).push(s); });
  const ciByDate = {}; cs.forEach(c=>ciByDate[c.date] = c);

  let h = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d=>'<div class="dow">'+d+'</div>').join("");
  const cells = [];
  for(let i = 0; i < start; i++) cells.push('<div class="cell empty"></div>');

  let prevIcon = null;
  for(let d = 1; d <= days; d++){
    const ds = y + "-" + String(mo+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
    const day = byDate[ds] || [], s = day[day.length - 1], ci = ciByDate[ds];
    const isToday = ds === today();
    let ic = "", tline = "", aw = "";
    if(s){
      ic = tierIcon(s, prevIcon);
      prevIcon = ic;
      const tn = day.reduce((a,x)=>a + tonnage(x), 0);
      if(tn > 0) tline = '<span class="t">' + fmtT(tn, true) + '</span>';
      if(day.some(awardDay)) aw = "⭐";
      if(day.length > 1) aw += "×" + day.length;
    }else if(ci){
      ic = '<span class="dotm" style="background:var(--md-sys-color-' + (MODES[ci.mode]||MODES.medium).tone + ')"></span>';
    }
    const marks = (_photoDates.has(ds) ? "📷" : "") + aw;
    cells.push('<div class="cell'+(isToday?" today":"")+(calSel===ds?" sel":"")
      + (day.length?" has":"")+(ds > today()?" future":"")+'" data-day="'+ds+'">'
      + '<span class="d">'+d+'</span>'
      + '<span class="ic">'+(ic ? (ic.indexOf("<") === 0 ? ic : ic) : "")+'</span>'
      + tline
      + (marks ? '<span class="mks">'+marks+'</span>' : '<span class="mks"></span>')
      + '</div>');

    // полоса недели после воскресенья или в последний день месяца
    const dow = (new Date(y, mo, d).getDay() + 6) % 7;
    if(dow === 6 || d === days) cells.push(weekBar(ds));
  }
  grid.innerHTML = h + cells.join("");
  grid.onclick = e=>{
    const c = e.target.closest("[data-day]");
    if(c){ selDay(c.dataset.day); renderCalDetail(); }
  };
  renderWeekCard();
  renderCalDetail();
  refreshPhotoDates();
}
/* Полоса недели. Падение в минус показываем только для завершённых недель:
   на будущей и текущей «−100 %» — это не факт, а демотивация. */
function weekBar(anyDateInWeek){
  const wk   = weekKey(anyDateInWeek);
  const curW = weekKey(today());
  const tn   = weekTonnage(wk), prev = weekTonnage(weekShift(wk, -1));

  if(wk > curW) return '<div class="wk future"><span>Нед · впереди</span></div>';

  if(wk === curW){
    const goal = plannedWeekTonnage();
    const pct  = goal ? Math.round(100*tn/goal) : 0;
    return '<div class="wk now"><span>Эта неделя · '+fmtT(tn)
         + (goal ? ' из '+fmtT(goal)+' · '+pct+' %' : '')+'</span>'
         + '<span class="wkbar"><i style="width:'+clamp(pct,0,100)+'%"></i></span></div>';
  }
  if(!tn && !prev) return '<div class="wk"><span class="mut">Нед · без тренировок</span></div>';
  let delta = "";
  if(prev > 0 && tn > 0){
    const pct = Math.round(100*(tn - prev)/prev);
    delta = " · " + (pct >= 0 ? "↑" : "↓") + Math.abs(pct) + " %";
  }
  return '<div class="wk"><span>Нед · '+fmtT(tn)+delta+'</span>'
       + (awardWeek(wk) ? '<span>🏅</span>' : '') + '</div>';
}
function renderWeekCard(){
  const box = $("calWeekCard");
  if(!box) return;
  const wk = weekKey(today());
  const tn = weekTonnage(wk), prev = weekTonnage(weekShift(wk, -1));
  const plan = Settings.plan();
  let delta = "—";
  if(prev > 0){
    const pct = Math.round(100*(tn - prev)/prev);
    delta = (pct >= 0 ? "↑" : "↓") + Math.abs(pct) + " %";
  }
  box.innerHTML = '<h2>Эта неделя</h2>'
    + '<div class="body-l num">' + fmtT(tn) + ' · ' + delta + ' · '
    + weekSessions(wk) + '/' + plan.days + ' тренировок · Zone 2: ' + weekZone2(wk) + ' мин</div>';
}
function refreshPhotoDates(){
  if(!window.Photos) return;
  Photos.dates().then(set=>{
    let changed = set.size !== _photoDates.size;
    if(!changed) for(const d of set) if(!_photoDates.has(d)){ changed = true; break; }
    if(changed){ _photoDates = set; renderCalendar(); }
  }).catch(()=>{});
}

function renderCalDetail(){
  const box = $("calDetail");
  if(!box) return;
  if(!calSel){ box.innerHTML = ""; return; }
  const ci  = checkins().find(r=>r.date === calSel);
  const day = sessionsOn(calSel);
  const d   = new Date(calSel + "T00:00:00").toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"});

  let h = '<div class="card"><h2>' + d + '</h2>';
  if(ci){
    const m = MODES[ci.mode] || MODES.medium;
    h += '<div class="row" style="margin-bottom:10px"><span class="mchip '+ci.mode+'">'+esc(m.name)+'</span>'
       + '<span class="title-l num">'+ci.index+'</span></div>';
    h += '<div class="body-m mut">' + ITEMS.map(it=>{
      const v = ci.items ? ci.items[it.k] : null;
      if(v == null) return "";
      return it.e + " " + esc(it.t) + ": " + (ci.scale === 5 ? esc(it.labels[clamp(Math.round(v),0,4)]) : (v + "/10"));
    }).filter(Boolean).join("<br>") + '</div>';
    if(ci.items && ci.items.hours != null)
      h += '<div class="body-m mut">😴 Часы сна: ' + fmtNum(ci.items.hours,1) + '</div>';
  }
  if(day.length){
    const tnDay = day.reduce((a,x)=>a + tonnage(x), 0);
    const prev = sessions().filter(x=>x.date < calSel && tonnage(x) > 0)
                           .sort((a,b)=>a.date.localeCompare(b.date)).pop();
    if(day.length > 1)
      h += '<div class="label-l" style="margin-top:14px">Тренировок за день: '+day.length+'</div>';
    // каждая тренировка — отдельной карточкой, ничего не склеиваем
    day.forEach((s,i)=>{
      h += '<div class="spacer"></div>'
         + (day.length > 1 ? '<div class="label-s mut">'+(i+1)+' из '+day.length
             + (s.savedAt ? ' · ' + new Date(s.savedAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}) : '')
             + '</div>' : '')
         + sessionDetailHTML(s);
    });
    h += tonnageBlock(tnDay, calSel, day.length > 1 ? "Всего за день" : "Тоннаж")
       + (prev ? '<div class="label-s mut" style="text-align:center;margin-top:-4px">прошлая тренировка '
                 + fmtT(tonnage(prev)) + ' ' + (tnDay > tonnage(prev) ? "↑" : "↓") + '</div>' : '');
  }
  if(!ci && !day.length) h += '<div class="body-m mut">В этот день записей нет.</div>';
  h += '<div class="photogrid" id="dayPhotos"></div>'
     + '<button class="btn-tonal btn-wide" id="dayPhotoBtn" style="margin-top:12px">📷 Добавить фото</button>'
     + '</div>';
  box.innerHTML = h;
  renderPhotoGrid($("dayPhotos"), calSel);
  $("dayPhotoBtn").addEventListener("click", ()=>addPhotos(calSel));
}

/* тоннаж по центру: эмодзи по градации + подпись градации */
function tonnageBlock(kg, seed, caption){
  const b = tonnageBadge(kg, seed);
  return '<div class="tonblock t'+b.tier+'">'
    + '<div class="tb-em">'+b.emoji+'</div>'
    + '<div class="tb-val num">'+fmtT(kg)+'</div>'
    + '<div class="tb-cap">'+esc(caption || "Тоннаж")+' · '+esc(b.label)+'</div>'
    + '</div>';
}

function sessionDetailHTML(s){
  const list = (s.ex||[]).filter(e=>Array.isArray(e.log) ? e.log.some(Boolean) : e.done);
  let h = '<div class="logex"><div class="title-m">'+(s.icon||"")+' '+esc(s.sessionName || s.dayName || "Тренировка")+'</div>';
  if(!list.length) h += '<div class="body-m mut">Упражнения не отмечены.</div>';
  list.forEach(e=>{
    let line;
    if(Array.isArray(e.log)){
      const done = e.log.filter(Boolean);
      line = done.map(l=>(+l.w ? fmtNum(l.w, l.w % 1 ? 1 : 0)+"×"+l.r : l.r+" повт")).join(" · ");
      const rests = done.filter(l=>l.restActual).map(l=>l.restActual);
      if(rests.length) line += ' · отдых ' + mmss(rests.reduce((a,b)=>a+b,0)/rests.length);
    }else{
      line = [e.weight ? e.weight+" кг" : "", e.actual ? e.actual+" повт." : "",
              e.restActual ? "отдых "+mmss(e.restActual) : ""].filter(Boolean).join(" · ");
    }
    h += '<div class="body-m" style="margin-top:6px">' + esc(e.n)
       + '<div class="mut num">' + esc(line || "—") + '</div></div>';
  });
  if(s.cardio && s.cardio.done)
    h += '<div class="body-m" style="margin-top:8px">🚶 '+esc(s.cardio.type)+' · '+s.cardio.min+' мин</div>';
  if(s.durationSec)
    h += '<div class="body-m mut">⏱️ '+mmss(s.durationSec)+(s.avgRest ? ' · средний отдых '+mmss(s.avgRest) : '')+'</div>';
  if(s.prs && s.prs.length)
    h += '<div class="body-m">🏆 '+esc(s.prs.map(p=>(EX[p.ex]?EX[p.ex].n:p.ex)+" "+p.w+" кг").join(", "))+'</div>';
  return h + '</div>';
}

/* ---------- лог ---------- */
function renderLog(){
  const ss = sessions().slice().sort((a,b)=>b.date.localeCompare(a.date));
  const cs = checkins();
  const cut = dateStr(new Date(Date.now() - 28*864e5));
  const rec = ss.filter(s=>s.date >= cut);

  const z2 = rec.reduce((a,s)=>a + ((s.cardio && s.cardio.done && /Zone/.test(s.cardio.type)) ? (+s.cardio.min||0) : 0), 0);
  const setsTotal = rec.reduce((a,s)=>a + sessionSets(s), 0);
  const tn28 = rec.reduce((a,s)=>a + tonnage(s), 0);
  const idxs = cs.filter(r=>r.date >= cut);
  const avg = idxs.length ? Math.round(idxs.reduce((a,r)=>a + r.index, 0)/idxs.length) : null;
  const durs = rec.filter(s=>s.durationSec).map(s=>s.durationSec);
  const avgDur = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : null;
  const allRest = rec.filter(s=>s.avgRest).map(s=>s.avgRest);
  const avgRest = allRest.length ? Math.round(allRest.reduce((a,b)=>a+b,0)/allRest.length) : null;

  // лучшая неделя за 28 дней
  let best = {key:null, tn:0};
  for(let i = 0; i < 5; i++){
    const k = weekShift(weekKey(today()), -i), t = weekTonnage(k);
    if(t > best.tn) best = {key:k, tn:t};
  }
  const cells = [
    ["Тренировок", rec.length],
    ["Подходов", setsTotal],
    ["Zone 2", z2 + " мин"],
    ["Тоннаж за 28 дней", fmtT(tn28)],
    ["Средний индекс", avg == null ? "—" : avg],
    ["Средняя длительность", avgDur ? mmss(avgDur) : "—"],
    ["Средний отдых", avgRest ? mmss(avgRest) : "—"],
    ["Лучшая неделя", best.tn ? fmtT(best.tn) : "—"]
  ];
  $("logSummary").innerHTML = '<h2>За 28 дней</h2><div class="grid2">'
    + cells.map(([t,v])=>'<div class="tile"><div class="label-m mut">'+esc(t)+'</div>'
      + '<div class="title-l num" style="margin-top:2px">'+esc(String(v))+'</div></div>').join("")
    + '</div>';

  renderSessionHelp();
  renderAiCard();

  const box = $("logList");
  if(!ss.length){ box.innerHTML = '<div class="body-m mut">Пока пусто. Закрой первую тренировку.</div>'; return; }
  box.innerHTML = ss.slice(0, 60).map((s,i)=>{
    const d = new Date(s.date + "T00:00:00").toLocaleDateString("ru-RU", {day:"2-digit", month:"short"});
    const m = MODES[s.mode] || MODES.medium;
    const nPh = (s.photos||[]).length;
    return '<div class="logex">'
      + '<div class="row between"><div class="row" style="gap:8px">'
      +   '<span class="label-l num">'+d+'</span>'
      +   '<span class="mchip '+s.mode+'">'+esc(m.name)+'</span></div>'
      +   '<button class="chip" data-log="'+i+'">Подробно</button></div>'
      + '<div class="body-m" style="margin-top:6px">'+(s.icon||"")+' '+esc(s.sessionName||s.dayName||"Тренировка")+'</div>'
      + '<div class="body-m mut num">'+fmtT(tonnage(s))
      +   (s.durationSec ? ' · '+mmss(s.durationSec) : '')
      +   (nPh ? ' · 📷 '+nPh : '') + '</div>'
      + '<div class="hide" id="logdet'+i+'"></div></div>';
  }).join("");
  box.onclick = e=>{
    const b = e.target.closest("[data-log]");
    if(!b) return;
    const i = +b.dataset.log, det = $("logdet"+i);
    if(det.classList.contains("hide")){
      det.innerHTML = sessionDetailHTML(ss[i]);
      det.classList.remove("hide"); b.textContent = "Свернуть";
    }else{ det.classList.add("hide"); b.textContent = "Подробно"; }
  };
}

/* справка: что значат короткие названия тренировок и режимов */
function renderSessionHelp(){
  const box = $("sessionHelp");
  if(!box) return;
  const order = ["low","low2","upperA","upperB","fbA","fbB","fbC","func","metcon","recovery","recoveryLong"];
  const plan = Settings.plan();
  const sched = scheduleForWeek(plan);
  const used = {};
  Object.keys(sched).forEach(d=>{ used[sched[d]] = (used[sched[d]]||[]).concat(RU_DOW[d]); });

  box.innerHTML = '<h2>Что значат названия</h2>'
    + '<details open><summary class="label-l">Тренировки</summary><div style="margin-top:8px">'
    + order.map(k=>{
        const S = SESSIONS[k];
        const days = used[k] ? used[k].join(", ") : null;
        return '<div class="helprow">'
          + '<div class="row" style="gap:8px"><span style="font-size:20px">'+S.icon+'</span>'
          +   '<span class="title-m">'+esc(S.short)+'</span>'
          +   '<span class="label-s mut">'+esc(S.name)+'</span></div>'
          + '<div class="body-m mut" style="margin-top:2px">'+esc(S.desc)+'</div>'
          + (days ? '<div class="label-s" style="margin-top:4px;color:var(--md-sys-color-primary)">'
                    + 'у тебя сейчас: '+esc(days)+'</div>' : '')
          + '</div>';
      }).join("")
    + '</div></details>'
    + '<details><summary class="label-l">Режимы дня</summary><div style="margin-top:8px">'
    + ["peak","heavy","medium","light","rest"].map(k=>{
        const m = MODES[k], c = getContent().modeCopy[k];
        return '<div class="helprow"><span class="mchip '+k+'">'+esc(m.name)+'</span>'
          + '<div class="body-m mut" style="margin-top:4px">'+esc(c.lines[0])+'</div>'
          + '<div class="label-s mut">RPE '+esc(m.rpe)+'</div></div>';
      }).join("")
    + '</div></details>'
    + '<details><summary class="label-l">Сокращения</summary><div class="body-m mut" style="margin-top:8px">'
    + '<b>Тоннаж</b> — сумма «вес × повторы» за тренировку.<br>'
    + '<b>RPE</b> — насколько тяжело по ощущениям, в скобках сколько повторов остаётся в запасе.<br>'
    + '<b>APRE</b> — третий подход до технического отказа: по числу повторов приложение говорит, '
    + 'добавить вес или убрать. Коридор — 12 повторов.<br>'
    + '<b>Zone 2</b> — спокойное кардио в разговорном темпе, главный рычаг по висцеральному жиру.<br>'
    + '<b>Кор</b> — мышцы корпуса: планка, «мёртвый жук», антиротация.<br>'
    + '<b>Финишер</b> — короткий добивающий блок в конце, только в тяжёлые дни.'
    + '</div></details>';
}

/* ---------- экспорт ---------- */
function exportCSV(){
  const head = ["дата","режим","индекс","сессия","упражнение","блок","подход","вес","повторы",
                "объём_кг","пауза_план","пауза_факт"];
  const rows = [head];
  sessions().slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(s=>{
    const m = (MODES[s.mode]||{}).name || s.mode || "";
    const nm = s.sessionName || s.dayName || "";
    (s.ex||[]).forEach(e=>{
      if(Array.isArray(e.log)){
        e.log.forEach((l, i)=>{
          if(!l) return;
          rows.push([s.date, m, s.index==null?"":s.index, nm, e.n, e.block||"", i+1,
                     l.w, l.r, Math.round((+l.w||0)*(+l.r||0)), e.rest==null?"":e.rest,
                     l.restActual==null?"":l.restActual]);
        });
      }else if(e.done){
        rows.push([s.date, m, s.index==null?"":s.index, nm, e.n, e.block||"", "",
                   e.weight||"", e.actual||"", "", e.rest==null?"":e.rest, e.restActual||""]);
      }
    });
  });
  const csv = "﻿" + rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(";")).join("\n");
  dl("eig-" + today() + ".csv", csv, "text/csv");
  toast("CSV выгружен");
}
function importSnapshotFile(){
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
      try{
        const res = Sync.merge(o);
        toast("Добавлено " + res.added + ", обновлено " + res.updated);
        renderCalendar(); renderLog(); refreshHome(); drawChart();
      }catch(e){ toast("Импорт не удался: " + (e.message||e)); }
    };
    r.readAsText(f);
  };
  inp.click();
}
