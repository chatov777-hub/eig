/* ai.js — провайдеры ИИ, промпт разбора недели, история разборов, пополнение контента.
   Экспортирует: aiChat(), renderAiSettings(), renderAiCard(), runAnalysis(),
   enrichContentWithAI(), renderMarkdownLite(), buildAiPayload(), AI_SYSTEM.
   Ключ API живёт только в localStorage и не попадает в экспорт/снапшот. */

const AI_TIMEOUT = 90000;

const AI_SYSTEM =
"Ты — тренер и напарник по залу. Общаешься по-русски, на «ты», коротко, по-пацански, но по делу и без грубости.\n"
+ "Пользователь: мужчина, цели — снижение висцерального жира и HOMA-IR, сохранение мышц. Главный рычаг — Zone 2 кардио 180–200 мин/нед,\n"
+ "силовые по адаптивной программе. Приложение считает утренний индекс готовности (0–100) из шкал 0–4: сон, энергия, мышцы (нет крепатуры),\n"
+ "спокойствие, настроение, аппетит, плюс часы сна. Режимы дня: peak (пик), heavy (тяжёлая), medium (средняя), light (лёгкая), rest (восстановление).\n"
+ "APRE: третий подход до технического отказа, коридор 12 повторов. Правило безопасности: боль (не жжение) = стоп; 3 красных дня подряд при нормальном сне → снизить объём недели.\n"
+ "Тоннаж = Σ вес × повторы. Проанализируй данные и ответь строго в формате:\n"
+ "## Главное (5 пунктов)\n"
+ "## Что настораживает\n"
+ "## Что поменять на следующей неделе (конкретно: дни, упражнения, веса, кардио)\n"
+ "## Одна фраза-напутствие\n"
+ "Не выдумывай данных, которых нет. Если данных мало — скажи, чего не хватает.";

/* Обёртка для ручной вставки в чужой чат: модель может не знать контекста приложения,
   поэтому объясняем схему данных по-английски и жёстко требуем ответ по-русски. */
const AI_HANDOFF =
"=== ДАННЫЕ ИЗ ПРИЛОЖЕНИЯ «ЕИГ» ===\n"
+ "Ниже инструкция для модели на английском и выгрузка в JSON. Ответ должен быть на русском.\n"
+ "\n"
+ "You are being handed a JSON export from a personal Russian-language gym tracker called ЕИГ\n"
+ "(«Единый индекс готовности» — Unified Readiness Index). Read this briefing first, then the data.\n"
+ "\n"
+ "ABSOLUTE OUTPUT RULE: reply ONLY in Russian. Address the user informally («ты»). Never answer in\n"
+ "English, even if this briefing is in English, and even if the user later writes to you in English.\n"
+ "Do not translate this briefing back to the user and do not restate the schema — go straight to work.\n"
+ "\n"
+ "WHAT THE APP DOES\n"
+ "Every morning the user rates six things on a 0–4 scale — sleep, energy, muscle freshness (0 = very\n"
+ "sore), calmness, mood, appetite — plus hours slept. From these it computes a readiness index 0–100\n"
+ "and picks a day mode: peak / heavy / medium / light / rest. The mode decides set count, rest length\n"
+ "and whether cardio intervals are swapped for easy Zone 2 work. Strength work is auto-assembled from\n"
+ "an exercise pool into sessions (lower body, upper push, upper pull, full body A/B/C, conditioning).\n"
+ "\n"
+ "DATA SCHEMA\n"
+ "- checkins[]: {date, index 0–100, z (deviation from the user's own 7-day baseline), mode, items}\n"
+ "  items keys: sleep, fatigue (= energy), doms (= muscle freshness), stress (= calmness), mood,\n"
+ "  appetite — all 0–4 where 4 is best — and hours (hours slept).\n"
+ "- sessions[]: {date, sessionName, mode, durationSec, tonnage, cardio:{type,min,done},\n"
+ "  ex:[{n (exercise name, Russian), sets, reps, log:[{w = kg, r = reps, restActual = seconds rested}]}],\n"
+ "  prs (personal records set that day)}\n"
+ "- weeks[]: {weekKey (Monday), tonnage, sessions}\n"
+ "- plan: the user's current weekly plan (days per week, split type, minutes per session).\n"
+ "Tonnage = Σ (weight × reps). Missing days mean no workout was logged, not zero effort.\n"
+ "\n"
+ "USER CONTEXT AND GOALS\n"
+ "Adult man. Primary goals: reduce visceral fat and HOMA-IR (insulin resistance) while keeping muscle.\n"
+ "The main lever is Zone 2 cardio, target 180–200 minutes per week; strength training preserves mass.\n"
+ "Safety: pain (as opposed to muscular burn) means stop. Three red days in a row despite decent sleep\n"
+ "means cut weekly volume. You are not a doctor — do not diagnose, and say so if something looks medical.\n"
+ "\n"
+ "HOW TO RESPOND — follow this shape exactly:\n"
+ "1) Заголовок «## Быстрый снимок» и под ним 3–5 коротких пунктов: что видно в данных прямо сейчас\n"
+ "   (объём, динамика недели, сон и индекс, кардио, рекорды). Только факты из выгрузки, с цифрами.\n"
+ "2) Заголовок «## С чем поработаем?» и нумерованное меню из 3–5 разборов на выбор, каждый одной\n"
+ "   строкой: название — что именно посмотрим. Примеры формулировок:\n"
+ "   1. Силовая прогрессия — где веса стоят на месте месяцами, а где пора добавлять.\n"
+ "   2. Восстановление и сон — как часы сна и индекс бьются с качеством тренировок.\n"
+ "   3. Кардио и Zone 2 — добираешь ли 180–200 минут в неделю и чем закрыть разрыв.\n"
+ "   4. Баланс программы — перекосы: тяги против жимов, ноги против верха, кор.\n"
+ "   5. План на следующую неделю — по дням: упражнения, веса, подходы, кардио.\n"
+ "   Бери те пункты, которые реально имеют смысл на этих данных, и предлагай свои, если видишь\n"
+ "   что-то важнее. Не разбирай всё сразу.\n"
+ "3) Последняя строка — вопрос, какой номер развернуть.\n"
+ "If the data is too thin for a claim, say what is missing instead of inventing it.\n";

/* ---------- вызов провайдера ---------- */
async function aiChat(system, user, opts){
  const maxTokens = (opts && opts.maxTokens) || 4096;
  const ai = Settings.get().ai;
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), AI_TIMEOUT);
  try{
    let url, headers, body, pick;
    if(ai.provider === "anthropic"){
      if(!ai.apiKey) throw new Error("Не задан API-ключ Anthropic");
      url = "https://api.anthropic.com/v1/messages";
      headers = {"Content-Type":"application/json", "x-api-key": ai.apiKey,
                 "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"};
      body = {model: ai.model || "claude-opus-5", max_tokens: maxTokens, system,
              messages:[{role:"user", content:user}]};
      pick = json=>{
        if(json.stop_reason === "refusal") throw new Error("Модель отказалась отвечать");
        return (json.content||[]).filter(b=>b.type === "text").map(b=>b.text).join("");
      };
    }else{
      const base = (ai.baseUrl || "").replace(/\/$/, "");
      if(!base) throw new Error("Не задан Base URL");
      url = base + "/chat/completions";
      headers = {"Content-Type":"application/json"};
      if(ai.apiKey) headers["Authorization"] = "Bearer " + ai.apiKey;
      body = {model: ai.model || "", messages:[{role:"system", content:system},{role:"user", content:user}],
              temperature: 0.7};
      pick = json=>((json.choices||[])[0]||{}).message ? json.choices[0].message.content : "";
    }
    let res;
    try{
      res = await fetch(url, {method:"POST", headers, body: JSON.stringify(body), signal: ctrl.signal});
    }catch(e){
      if(e.name === "AbortError") throw new Error("Превышено время ожидания (90 с)");
      throw new Error("Нет соединения или CORS. Проверь URL или используй «Скопировать для ИИ»");
    }
    if(!res.ok){
      let txt = "";
      try{ txt = (await res.text()).slice(0, 200); }catch(e){}
      throw new Error("HTTP " + res.status + ": " + txt);
    }
    const json = await res.json();
    const out = pick(json);
    if(!out) throw new Error("Пустой ответ модели");
    return out;
  }finally{ clearTimeout(timer); }
}

/* ---------- настройки ИИ ---------- */
function renderAiSettings(box){
  if(!box) return;
  const ai = Settings.get().ai;
  box.innerHTML =
    '<div class="seg" id="aiProv">'
    + [["openai","OpenAI-совместимый"],["anthropic","Anthropic"]].map(([v,n])=>
        '<button data-prov="'+v+'" class="'+(ai.provider===v?"on":"")+'">'+n+'</button>').join("")
    + '</div>'
    + '<div class="field" id="aiUrlField" style="margin-top:12px'+(ai.provider==="anthropic"?";display:none":"")+'">'
    +   '<label>Base URL</label>'
    +   '<input type="text" id="aiUrl" value="'+esc(ai.baseUrl)+'" placeholder="http://localhost:8080/v1"></div>'
    + '<div class="field"><label>API-ключ</label><div class="row">'
    +   '<input type="password" id="aiKey" value="'+esc(ai.apiKey)+'" style="flex:1 1 auto">'
    +   '<button class="chip" id="aiEye">Показать</button></div></div>'
    + '<div class="field"><label>Модель</label>'
    +   '<input type="text" id="aiModel" value="'+esc(ai.model)+'" placeholder="'
    +   (ai.provider==="anthropic" ? "claude-opus-5" : "имя модели")+'"></div>'
    + '<div class="label-s mut">Ключ хранится только в этом браузере и не попадает в экспорт.</div>'
    + '<button class="btn-tonal btn-wide" id="aiTest" style="margin-top:12px">Проверить</button>'
    + '<div class="body-m" id="aiTestOut" style="margin-top:8px"></div>';

  const save = ()=>Settings.set({ai:{
    provider: box.querySelector("#aiProv .on") ? box.querySelector("#aiProv .on").dataset.prov : ai.provider,
    baseUrl: $("aiUrl") ? $("aiUrl").value.trim() : ai.baseUrl,
    apiKey: $("aiKey").value.trim(),
    model: $("aiModel").value.trim()
  }});
  $("aiProv").addEventListener("click", e=>{
    const b = e.target.closest("[data-prov]"); if(!b) return;
    $("aiProv").querySelectorAll("button").forEach(x=>x.classList.toggle("on", x === b));
    $("aiUrlField").style.display = b.dataset.prov === "anthropic" ? "none" : "";
    save();
  });
  ["aiUrl","aiKey","aiModel"].forEach(id=>{ const el = $(id); if(el) el.addEventListener("change", save); });
  $("aiEye").addEventListener("click", ()=>{
    const el = $("aiKey");
    el.type = el.type === "password" ? "text" : "password";
    $("aiEye").textContent = el.type === "password" ? "Показать" : "Скрыть";
  });
  $("aiTest").addEventListener("click", async ()=>{
    save();
    const out = $("aiTestOut");
    out.textContent = "Проверяю…";
    try{
      const r = await aiChat("Отвечай одним словом.", "Ответь одним словом: ок", {maxTokens: 32});
      out.innerHTML = '<span style="color:var(--md-sys-color-primary)">Ответ: '+esc(r.trim().slice(0,80))+'</span>';
    }catch(e){
      out.innerHTML = '<span style="color:var(--md-sys-color-error)">'+esc(e.message||String(e))+'</span>';
    }
  });
}

/* ---------- данные для разбора ---------- */
function buildAiPayload(days){
  const cut = dateStr(new Date(Date.now() - days*864e5));
  const cs = checkins().filter(r=>r.date >= cut)
    .map(r=>({date:r.date, index:r.index, z:r.z==null?null:Math.round(r.z*100)/100, mode:r.mode, items:r.items}));
  const ss = sessions().filter(s=>s.date >= cut).map(s=>({
    date:s.date, sessionName:s.sessionName||s.dayName, mode:s.mode, durationSec:s.durationSec||null,
    tonnage: Math.round(tonnage(s)), cardio:s.cardio||null,
    ex:(s.ex||[]).map(e=>({n:e.n, sets:e.sets, reps:e.reps,
      log:(e.log||[]).filter(Boolean).map(l=>({w:l.w, r:l.r, restActual:l.restActual}))})),
    prs:s.prs||[]
  }));
  const weeks = [];
  for(let i = 0; i < Math.ceil(days/7); i++){
    const k = weekShift(weekKey(today()), -i);
    weeks.push({weekKey:k, tonnage: Math.round(weekTonnage(k)), sessions: weekSessions(k)});
  }
  return {period: days + " дней", plan: Settings.plan(), checkins: cs, sessions: ss, weeks};
}
/* при перегрузе: сначала выкинуть restActual и подсказки, затем сократить период */
function aiUserMessage(days){
  let p = buildAiPayload(days);
  let s = JSON.stringify(p);
  if(s.length > 60000){
    p.sessions.forEach(x=>x.ex.forEach(e=>e.log.forEach(l=>{ delete l.restActual; })));
    s = JSON.stringify(p);
  }
  let d = days;
  while(s.length > 60000 && d > 7){
    d = Math.max(7, Math.round(d/2));
    p = buildAiPayload(d);
    p.sessions.forEach(x=>x.ex.forEach(e=>e.log.forEach(l=>{ delete l.restActual; })));
    s = JSON.stringify(p);
  }
  return {text: "Данные за " + d + " дней (JSON):\n" + s, days: d};
}

/* ---------- карточка разбора ---------- */
var aiPeriod = 7;
function renderAiCard(){
  const box = $("aiCard");
  if(!box) return;
  const hist = ls.get(K_AI, []);
  const last = hist[0];
  box.innerHTML =
    '<h2>🤖 ' + (aiPeriod >= 28 ? "Разбор месяца" : "Разбор недели") + '</h2>'
    + '<div class="seg" id="aiPeriodSeg">'
    +   [[7,"7 дней"],[28,"28 дней"]].map(([v,n])=>
          '<button data-period="'+v+'" class="'+(aiPeriod===v?"on":"")+'">'+n+'</button>').join("")
    + '</div>'
    + '<div class="aiacts">'
    +   '<button class="btn-filled" id="aiRun">Проанализировать</button>'
    +   '<button class="btn-tonal" id="aiCopy">📋 Скопировать для ИИ</button></div>'
    + '<div class="md" id="aiOut" style="margin-top:12px">'
    +   (last ? renderMarkdownLite(last.text) : '<div class="body-m mut">Разбора ещё не было.</div>')
    + '</div>'
    + (hist.length > 1
        ? '<details style="margin-top:12px"><summary class="label-l">Прошлые разборы ('+(hist.length-1)+')</summary>'
          + hist.slice(1, 15).map(h=>
              '<details style="margin-top:8px"><summary class="body-m mut">'
              + esc(new Date(h.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"}))
              + ' · ' + esc(h.model||h.provider||"") + ' · ' + esc(h.period) + '</summary>'
              + '<div class="md">' + renderMarkdownLite(h.text) + '</div></details>').join("")
          + '</details>'
        : "");

  $("aiPeriodSeg").addEventListener("click", e=>{
    const b = e.target.closest("[data-period]"); if(!b) return;
    aiPeriod = +b.dataset.period; renderAiCard();
  });
  $("aiRun").addEventListener("click", runAnalysis);
  $("aiCopy").addEventListener("click", ()=>{
    const u = aiUserMessage(aiPeriod);
    const txt = AI_HANDOFF + "\n---\n\n" + u.text;
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(()=>toast("Скопировано — вставь в любой чат с ИИ"))
                                        .catch(()=>toast("Буфер обмена недоступен"));
    else toast("Буфер обмена недоступен");
  });
}
async function runAnalysis(){
  const btn = $("aiRun"), out = $("aiOut");
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = "Анализирую…";
  out.innerHTML = '<div class="body-m mut">Модель думает…</div>';
  try{
    const u = aiUserMessage(aiPeriod);
    const text = await aiChat(AI_SYSTEM, u.text);
    const ai = Settings.get().ai;
    const hist = ls.get(K_AI, []);
    hist.unshift({id: uid("ai"), date: nowISO(), period: u.days + " дней",
                  provider: ai.provider, model: ai.model, text});
    ls.set(K_AI, hist.slice(0, 30));
    renderAiCard();
    toast("Разбор готов");
  }catch(e){
    out.innerHTML = '<div class="body-m" style="color:var(--md-sys-color-error)">'
      + esc(e.message||String(e)) + '</div>'
      + '<div class="body-m mut" style="margin-top:8px">Можно нажать «Скопировать для ИИ» '
      + 'и вставить запрос в любой чат вручную.</div>';
    btn.disabled = false; btn.textContent = was;
  }
}

/* ---------- пополнение контента ---------- */
const ENRICH_SYSTEM = "Ты пишешь короткие мотивационные фразы для фитнес-приложения на русском, на «ты», "
  + "дерзко, с юмором, без мата и оскорблений. Отвечай ТОЛЬКО валидным JSON без пояснений.";

async function enrichContentWithAI(){
  const C = getContent().phrases;
  const sample = {};
  Object.keys(C).forEach(k=>{ sample[k] = (C[k].items||[]).slice(0,3); });
  const user = "Вот текущие категории и по 3 примера из каждой: " + JSON.stringify(sample)
    + '. Верни объект вида {"phrases":{"<категория>":{"items":[...]}}} с 10 новыми фразами на каждую категорию. '
    + "Плейсхолдеры {name} и {n} можно использовать.";
  toast("Прошу у модели фразы…");
  let text;
  try{ text = await aiChat(ENRICH_SYSTEM, user); }
  catch(e){ toast("ИИ не ответил: " + (e.message||e)); return; }

  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if(a < 0 || b <= a){ toast("В ответе нет JSON — ничего не изменено"); return; }
  let o;
  try{ o = JSON.parse(text.slice(a, b+1)); }
  catch(e){ toast("Ответ не разобрался как JSON — ничего не изменено"); return; }
  if(!o || typeof o.phrases !== "object" || Array.isArray(o.phrases)){
    toast("Структура ответа не та — ничего не изменено"); return;
  }
  const clean = {phrases:{}};
  let n = 0;
  Object.keys(o.phrases).forEach(k=>{
    if(!C[k]) return;
    const items = (o.phrases[k] && o.phrases[k].items) || [];
    if(!Array.isArray(items)) return;
    const good = items.filter(s=>typeof s === "string" && s.trim() && s.length <= 160)
                      .filter(s=>(C[k].items||[]).indexOf(s) < 0);
    if(good.length){ clean.phrases[k] = {items: good}; n += good.length; }
  });
  if(!n){ toast("Новых фраз не нашлось — ничего не изменено"); return; }
  setContent(deepMerge(ls.get(K_CONTENT, {}), clean));
  toast("Добавлено фраз: " + n);
  refreshHome();
}

/* ---------- мини-Markdown ---------- */
function renderMarkdownLite(src){
  const lines = String(src||"").split(/\r?\n/);
  let html = "", inList = false;
  const inline = s=>esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const closeList = ()=>{ if(inList){ html += "</ul>"; inList = false; } };
  lines.forEach(raw=>{
    const l = raw.trim();
    if(!l){ closeList(); return; }
    let m;
    if((m = l.match(/^###\s+(.*)$/))){ closeList(); html += "<h4>" + inline(m[1]) + "</h4>"; return; }
    if((m = l.match(/^##\s+(.*)$/))) { closeList(); html += "<h3>" + inline(m[1]) + "</h3>"; return; }
    if((m = l.match(/^#\s+(.*)$/)))  { closeList(); html += "<h3>" + inline(m[1]) + "</h3>"; return; }
    if((m = l.match(/^[-*]\s+(.*)$/))){
      if(!inList){ html += "<ul>"; inList = true; }
      html += "<li>" + inline(m[1]) + "</li>"; return;
    }
    closeList();
    html += "<p>" + inline(l) + "</p>";
  });
  closeList();
  return html || '<div class="body-m mut">Пусто.</div>';
}
