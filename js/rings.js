/* rings.js — SVG-кольца прогресса и график индекса за 30 дней.
   Экспортирует: renderRings(), drawChart(). */

/* Одно толстое полупрозрачное кольцо: радиус и толщина подобраны так,
   чтобы в свободном центре помещались число и две подписи. */
const RING_R1 = 72, RING_W1 = 24;

function renderRing(el, o){
  if(!el) return;
  const C = 2*Math.PI*RING_R1;
  const p = clamp(+o.p||0, 0, 1);
  const col = "var(--md-sys-color-"+o.color+")";
  el.innerHTML =
    '<svg viewBox="0 0 200 200" role="img" aria-label="'+esc(o.aria||"Прогресс")+'">'
    + '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">'
    +   '<stop offset="0%" stop-color="'+col+'" stop-opacity=".95"/>'
    +   '<stop offset="100%" stop-color="'+col+'" stop-opacity=".55"/>'
    + '</linearGradient></defs>'
    + '<g transform="rotate(-90 100 100)">'
    +   '<circle cx="100" cy="100" r="'+RING_R1+'" fill="none" stroke="'+col+'"'
    +     ' stroke-opacity=".16" stroke-width="'+RING_W1+'"/>'
    +   '<circle cx="100" cy="100" r="'+RING_R1+'" fill="none" stroke="url(#ringGrad)"'
    +     ' stroke-width="'+RING_W1+'" stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'"'
    +     ' stroke-dashoffset="'+(C*(1-p)).toFixed(2)+'" style="transition:stroke-dashoffset .6s"/>'
    + '</g></svg>'
    + '<div class="mid">'
    +   (o.top ? '<div class="ring-top">'+esc(o.top)+'</div>' : '')
    +   '<div class="ring-num num">'+esc(String(o.main))+'</div>'
    +   (o.sub ? '<div class="ring-sub">'+esc(o.sub)+'</div>' : '')
    + '</div>';
}

/* Полоски справа: полупрозрачная подложка, заливка растёт по мере прогресса. */
function renderBars(el, rows){
  if(!el) return;
  el.innerHTML = rows.map(r=>{
    const p = Math.round(clamp(+r.p||0, 0, 1)*100);
    return '<div class="pbar" style="--c:var(--md-sys-color-'+r.color+')">'
      + '<div class="pb-fill" style="width:'+p+'%"></div>'
      + '<div class="pb-txt">'
      +   '<div class="pb-top"><span class="pb-n">'+esc(r.label)+'</span>'
      +     '<span class="pb-p num">'+p+'%</span></div>'
      +   '<div class="pb-v num">'+esc(r.sub||"")+'</div>'
      + '</div></div>';
  }).join("");
}

const RING_R = [88, 70, 52];

/* rows: [{p:0..1, color:"primary"|"secondary"|"amber"|…, label:"Индекс"}] */
function renderRings(el, rows, centerHTML){
  if(!el) return;
  const parts = rows.map((r,i)=>{
    const R = RING_R[i] || 40, C = 2*Math.PI*R;
    const p = clamp(+r.p||0, 0, 1);
    const col = "var(--md-sys-color-"+r.color+")";
    return '<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="var(--md-sys-color-outline-variant)"'
         + ' stroke-opacity=".35" stroke-width="14"/>'
         + '<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="url(#rg'+i+')" stroke-width="14"'
         + ' stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'"'
         + ' stroke-dashoffset="'+(C*(1-p)).toFixed(2)+'" style="transition:stroke-dashoffset .6s"/>';
  }).join("");
  const defs = rows.map((r,i)=>{
    const col = "var(--md-sys-color-"+r.color+")";
    return '<linearGradient id="rg'+i+'" x1="0" y1="0" x2="1" y2="1">'
         + '<stop offset="0%" stop-color="'+col+'"/>'
         + '<stop offset="100%" stop-color="'+col+'" stop-opacity=".6"/></linearGradient>';
  }).join("");
  el.innerHTML =
    '<svg viewBox="0 0 200 200" role="img" aria-label="Кольца прогресса">'
    + '<defs>'+defs+'</defs>'
    + '<g transform="rotate(-90 100 100)">'+parts+'</g></svg>'
    + '<div class="mid">'+(centerHTML||"")+'</div>';
}

/* легенда — отдельными строками с абсолютными числами, а не только процентом */
function ringLegend(el, rows){
  if(!el) return;
  el.innerHTML = rows.map(r=>
    '<div class="li"><span class="dot" style="background:var(--md-sys-color-'+r.color+')"></span>'
    + '<span class="lg-n">' + esc(r.label) + '</span>'
    + '<span class="lg-s mut">' + esc(r.sub || "") + '</span>'
    + '<span class="lg-p num">' + Math.round(clamp(+r.p||0,0,1)*100) + '%</span></div>'
  ).join("");
}

/* индекс за 30 дней: зоны фоном, линия, градиент, точки */
function drawChart(canvas){
  const c = canvas || document.getElementById("chart");
  if(!c || !c.getContext) return;
  const data = checkins().slice(-30);
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 320, h = c.clientHeight || 150;
  c.width = w*dpr; c.height = h*dpr;
  const x = c.getContext("2d");
  if(!x) return;
  x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,w,h);
  const cs = getComputedStyle(document.documentElement);
  const tok = n => (cs.getPropertyValue("--md-sys-color-"+n)||"#888").trim();
  const pad = 20, W = w-2*pad, H = h-2*pad;

  // зоны готовности
  [["error",0,34],["tertiary",34,50],["amber",50,70],["primary",70,85],["secondary",85,100]].forEach(([n,a,b])=>{
    x.globalAlpha = .12; x.fillStyle = tok(n);
    x.fillRect(pad, pad+H*(1-b/100), W, H*(b-a)/100);
    x.globalAlpha = 1;
  });

  if(data.length < 2){
    x.fillStyle = tok("on-surface-variant");
    x.font = "12px system-ui"; x.textAlign = "center";
    x.fillText("Нужно ≥2 дня", w/2, h/2);
    _chartPts = [];
    return;
  }
  const px = i => pad + W*i/(data.length-1);
  const py = v => pad + H*(1 - v/100);

  // заливка под линией
  const grad = x.createLinearGradient(0, pad, 0, pad+H);
  grad.addColorStop(0, tok("primary")+"40");
  grad.addColorStop(1, tok("primary")+"00");
  x.beginPath(); x.moveTo(px(0), pad+H);
  data.forEach((r,i)=>x.lineTo(px(i), py(r.index)));
  x.lineTo(px(data.length-1), pad+H); x.closePath();
  x.fillStyle = grad; x.fill();

  x.beginPath();
  data.forEach((r,i)=>{ i ? x.lineTo(px(i), py(r.index)) : x.moveTo(px(i), py(r.index)); });
  x.strokeStyle = tok("primary"); x.lineWidth = 2; x.lineJoin = "round"; x.stroke();

  x.fillStyle = tok("primary");
  _chartPts = data.map((r,i)=>{
    const cx = px(i), cy = py(r.index);
    x.beginPath(); x.arc(cx, cy, 3, 0, 6.284); x.fill();
    return {x:cx, y:cy, date:r.date, index:r.index};
  });
}

var _chartPts = [];
/* тултип по тапу: ближайшая точка */
function chartTip(ev){
  const c = document.getElementById("chart");
  if(!c || !_chartPts.length) return;
  const r = c.getBoundingClientRect();
  const mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
  let best = _chartPts[0];
  _chartPts.forEach(p=>{ if(Math.abs(p.x-mx) < Math.abs(best.x-mx)) best = p; });
  const d = new Date(best.date+"T00:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"long"});
  toast(d + " · индекс " + best.index);
}
