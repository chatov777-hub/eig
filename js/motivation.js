/* motivation.js — плашка мотивации, стрик, личные рекорды.
   Экспортирует: pickMotivation(), motivToday(), resetMotivToday(), streakDays(), prMap(),
   plannedToday(), plannedOn(). */

function _dayShift(ds, n){
  const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n); return dateStr(d);
}
/* плановый ли день по раскладке недели */
function plannedOn(ds){
  const key = scheduleForWeek(Settings.plan())[new Date(ds + "T00:00:00").getDay()];
  return !!key && key !== "recovery" && key !== "recoveryLong";
}
function plannedToday(){ return plannedOn(today()); }

/* число подряд идущих дат с чек-инами, заканчивая сегодня (или вчера) */
function streakDays(){
  const set = new Set(checkins().map(r=>r.date));
  let cur = today();
  if(!set.has(cur)){
    cur = _dayShift(cur, -1);
    if(!set.has(cur)) return 0;
  }
  let n = 0;
  while(set.has(cur)){ n++; cur = _dayShift(cur, -1); }
  return n;
}

/* максимальный вес по каждому упражнению за всю историю */
function prMap(){
  const m = {};
  sessions().forEach(s=>{
    (s.ex||[]).forEach(e=>{
      if(!e.id || !Array.isArray(e.log)) return;
      e.log.forEach(l=>{
        if(l && (+l.r||0) > 0 && (+l.w||0) > 0)
          m[e.id] = Math.max(m[e.id] || 0, +l.w);
      });
    });
  });
  return m;
}

/* «слабая» неделя: тренировок меньше плана или тоннаж < 75 % от максимума 4 недель до неё */
function _weakWeek(key, days){
  if(weekSessions(key) < days) return true;
  const cur = weekTonnage(key);
  let mx = 0;
  for(let i=1; i<=4; i++) mx = Math.max(mx, weekTonnage(weekShift(key, -i)));
  return mx > 0 && cur < 0.75 * mx;
}
function _lastSession(){
  return sessions().filter(s=>tonnage(s) > 0 || (s.cardio && s.cardio.done))
                   .sort((a,b)=>a.date.localeCompare(b.date)).pop() || null;
}

/* правила §9.1 по порядку; первое сработавшее — категория */
function motivCategory(){
  const plan = Settings.plan();
  const t = today();
  const W1 = weekShift(weekKey(t), -1), W2 = weekShift(weekKey(t), -2);
  const dow = new Date().getDay();

  // 1. две слабые недели подряд, но раньше были нормальные
  if(_weakWeek(W1, plan.days) && _weakWeek(W2, plan.days)){
    let hadGood = false;
    for(let i=3; i<=8; i++){
      const w = weekShift(weekKey(t), -i);
      if(weekTonnage(w) > 0 && !_weakWeek(w, plan.days)){ hadGood = true; break; }
    }
    if(hadGood) return "decline_two_weeks";
  }
  const last = _lastSession();
  const yest = _dayShift(t, -1);

  // 2. рекорд сегодня или вчера
  if(last && Array.isArray(last.prs) && last.prs.length && (last.date === t || last.date === yest))
    return "new_record";
  // 3. неделя закрыта сильнее прошлой, сегодня Пн или Вт
  if(awardWeek(W1) && (dow === 1 || dow === 2)) return "volume_increase_weekly";
  // 4. последняя сессия сегодня/вчера и тоннаж выше предыдущей
  if(last && (last.date === t || last.date === yest) && tonnage(last) > 0 && awardDay(last))
    return "volume_increase_daily";
  // 5. вчера был плановый день без тренировки (и не был режим восстановления)
  if(plannedOn(yest) && !sessions().some(s=>s.date === yest)){
    const ci = checkins().find(r=>r.date === yest);
    if(!ci || ci.mode !== "rest") return "missed";
  }
  // 6. пять и больше дней без тренировки, сегодня плановый
  if(plannedToday()){
    const days = last ? Math.round((new Date(t+"T00:00:00") - new Date(last.date+"T00:00:00")) / 864e5) : 999;
    if(days >= 5) return "comeback";
  }
  // 7. стрик
  if(streakDays() >= 3) return "streak";
  // 8. неплановый день
  if(!plannedToday()) return "rest_day";
  return "default";
}

/* {cat, emoji, text}; последние 5 показанных фраз не повторяются */
function pickMotivation(cat){
  const c = cat || motivCategory();
  const C = getContent().phrases[c] || getContent().phrases.default;
  const st = ls.get(K_MOTIV, {}) || {};
  const shown = (st.lastShown || []).map(x=>x.text);
  let pool = (C.items || []).filter(s=>shown.indexOf(s) < 0);
  if(!pool.length) pool = C.items.slice();
  const raw = pool[Math.floor(Math.random() * pool.length)] || "";
  const text = applyVars(raw, {n: streakDays()});
  const emoji = (C.emoji || ["👊"])[Math.floor(Math.random() * (C.emoji || ["👊"]).length)];
  st.lastShown = [{cat:c, text:raw, date:today()}].concat(st.lastShown || []).slice(0, 5);
  ls.set(K_MOTIV, st);
  return {cat:c, emoji, text};
}

/* фиксируем выбор на день: пересчёт только при смене даты или после финиша */
function motivToday(force){
  const st = ls.get(K_MOTIV, {}) || {};
  if(!force && st.todayPick && st.todayPick.date === today()) return st.todayPick;
  const p = pickMotivation();
  const st2 = ls.get(K_MOTIV, {}) || {};
  st2.todayPick = Object.assign({date: today()}, p);
  ls.set(K_MOTIV, st2);
  return st2.todayPick;
}
function resetMotivToday(){
  const st = ls.get(K_MOTIV, {}) || {};
  delete st.todayPick;
  ls.set(K_MOTIV, st);
}
