/* picker.js — барабанный пикер значений (вес, повторы, минуты, секунды).
   Экспортирует: openPicker(), pickWeight(), pickReps(), pickMinutes(), pickSeconds(). */

const ITEM_H = 40;
var _picker = null;

/* opts: {title, columns:[{values, value, suffix}], onChange(vals), onDone(vals)} */
function openPicker(opts){
  const cols = opts.columns.map(c=>{
    const i = c.values.findIndex(v=>String(v) === String(c.value));
    return Object.assign({}, c, {idx: i < 0 ? 0 : i});
  });
  _picker = {opts, cols, keyboard:false};

  const body =
    '<h2>'+esc(opts.title||"Значение")+'</h2>'
  + '<div id="pkBody"></div>'
  + '<div class="row" style="margin-top:16px;gap:8px">'
  +   '<button class="chip" id="pkKbd">⌨️</button>'
  +   '<button class="btn-filled" id="pkDone" style="flex:1 1 auto">Готово</button>'
  + '</div>';
  openSheet(body, true);
  renderPicker();

  $("pkKbd").addEventListener("click", ()=>{ _picker.keyboard = !_picker.keyboard; renderPicker(); });
  $("pkDone").addEventListener("click", ()=>{
    const vals = readPicker();
    closeSheet(true);
    _picker = null;
    if(opts.onDone) opts.onDone(vals);
  });
}
function readPicker(){
  if(!_picker) return [];
  if(_picker.keyboard){
    return _picker.cols.map((c,i)=>{
      const el = $("pkIn"+i);
      return el ? el.value.trim() : String(c.values[c.idx]);
    });
  }
  return _picker.cols.map(c=>String(c.values[c.idx]));
}
function renderPicker(){
  const P = _picker; if(!P) return;
  const box = $("pkBody");
  if(P.keyboard){
    box.innerHTML = '<div class="row" style="gap:10px">' + P.cols.map((c,i)=>
      '<div class="field" style="flex:1 1 0;margin:0"><label>'+esc(c.label||"")+'</label>'
      + '<input type="text" inputmode="decimal" id="pkIn'+i+'" value="'+esc(String(c.values[c.idx]))+'"></div>'
    ).join("") + '</div>';
    const first = $("pkIn0"); if(first) first.focus();
    return;
  }
  box.innerHTML = '<div class="drums">' + P.cols.map((c,i)=>
      '<div class="drumcol"><div class="drumwrap"><div class="drumband"></div>'
      + '<div class="drum" id="pkDrum'+i+'" data-col="'+i+'">'
      +   '<div class="pad"></div>'
      +   c.values.map((v,j)=>'<div class="item'+(j===c.idx?" on":"")+'">'+esc(String(v))+(c.suffix||"")+'</div>').join("")
      +   '<div class="pad"></div>'
      + '</div></div>'
      + '<div class="drumsteps"><button class="chip" data-step="-1" data-col="'+i+'">−</button>'
      + '<button class="chip" data-step="1" data-col="'+i+'">+</button></div></div>'
    ).join("") + '</div>';

  P.cols.forEach((c,i)=>{
    const d = $("pkDrum"+i);
    d.scrollTop = c.idx * ITEM_H;
    let raf = 0;
    d.addEventListener("scroll", ()=>{
      if(raf) return;
      raf = requestAnimationFrame(()=>{
        raf = 0;
        const idx = clamp(Math.round(d.scrollTop / ITEM_H), 0, c.values.length-1);
        if(idx !== c.idx){
          c.idx = idx;
          try{ navigator.vibrate && navigator.vibrate(5); }catch(e){}
          markDrum(d, idx);
          if(P.opts.onChange) P.opts.onChange(readPicker());
        }
      });
    }, {passive:true});
  });
  box.querySelectorAll("[data-step]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = +b.dataset.col, c = P.cols[i];
      c.idx = clamp(c.idx + (+b.dataset.step), 0, c.values.length-1);
      const d = $("pkDrum"+i);
      d.scrollTo({top: c.idx*ITEM_H, behavior:"smooth"});
      markDrum(d, c.idx);
      if(P.opts.onChange) P.opts.onChange(readPicker());
    });
  });
}
function markDrum(d, idx){
  const items = d.querySelectorAll(".item");
  items.forEach((el,j)=>el.classList.toggle("on", j === idx));
}

function range(a, b, step){
  const out = [];
  for(let v = a; v <= b; v += (step||1)) out.push(Math.round(v*10)/10);
  return out;
}

/* вес: грубая колонка шагом 5 кг + точная добавка 0–5 шагом 0,5 */
function pickWeight(cur, cb){
  const v = parseFloat(String(cur).replace(",", ".")) || 0;
  const base = clamp(Math.floor(v/5)*5, 0, 300);
  const add  = Math.round((v - base)*2)/2;          // 0 … 4.5
  openPicker({
    title:"Вес, кг",
    columns:[{values: range(0,300,5),  value: base, label:"кг, шаг 5"},
             {values: range(0,5,0.5),  value: add,  label:"+ точно"}],
    onDone: vals=>{
      const n = (parseFloat(vals[0])||0) + (parseFloat(vals[1])||0);
      cb(String(Math.round(n*10)/10));
    }
  });
}
function pickReps(cur, cb){
  openPicker({
    title:"Повторы",
    columns:[{values: range(0,50,1), value: parseInt(cur,10) || 0, label:"повт"}],
    onDone: vals=>cb(String(parseInt(vals[0],10) || 0))
  });
}
function pickMinutes(cur, cb){
  openPicker({
    title:"Минуты кардио",
    columns:[{values: range(5,120,5), value: parseInt(cur,10) || 20, label:"мин"}],
    onDone: vals=>cb(String(parseInt(vals[0],10) || 20))
  });
}
function pickSeconds(cur, cb){
  openPicker({
    title:"Пауза, секунды",
    columns:[{values: range(15,300,5), value: parseInt(cur,10) || 90, label:"сек"}],
    onDone: vals=>cb(String(parseInt(vals[0],10) || 90))
  });
}
