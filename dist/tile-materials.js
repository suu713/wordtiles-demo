export const TILE_MATERIAL_KEY='wordtiles.tile-material.v1';
export const TILE_MATERIALS=Object.freeze([
  {id:'original',label:'原版',normal:'./art/yanqi/dancikuai_2@2x.png',selected:'./art/yanqi/dancikuai_1@2x.png',ink:'#211a14',selectedInk:'#fff',count:'#30251d',selectedCount:'#fff2ff',line:'#e357f3'},
  {id:'stone',label:'石纹',ink:'#30221c',selectedInk:'#fff4e6',line:'#ffe2b6'},
  {id:'sand',label:'沙土',ink:'#35200e',line:'#ffe1a6'},
  {id:'ice',label:'冰晶',ink:'#123842',selectedInk:'#e9fcff',line:'#c5faff'},
  {id:'biscuit',label:'饼干',ink:'#44250e',line:'#fff0b3'},
  {id:'jelly',label:'果冻',ink:'#582343',selectedInk:'#fff7ff',line:'#ffe0ff'},
  {id:'wood',label:'木纹',ink:'#40230d',line:'#ffe5ba'},
]);
const materialFor=id=>TILE_MATERIALS.find(material=>material.id===id)||TILE_MATERIALS[0];
const pressFor=id=>id==='pressed'?'pressed':'short';
function read(value){let saved;try{saved=JSON.parse(value);}catch{}return {material:materialFor(saved?.material),press:pressFor(saved?.press)};}
function filesFor(material,press){
  if(material.id==='original')return {normal:material.normal,selected:material.selected,pressed:material.selected,collected:material.selected,bridge:'./art/tile-materials/connectors/purple.png'};
  const base='./art/tile-materials/'+material.id+'/';
  const pressed=base+(press==='pressed'?'pressed.png':'pressed-short.png');
  return {normal:base+'highlight.png',selected:pressed,pressed,collected:base+'normal.png',bridge:pressed};
}
const url=file=>new URL(file,import.meta.url).href;

// Only paint CSS variables. Changing a material never recreates tiles or a session.
export function mountTileMaterials({storage,root=document.documentElement,
  select=document.getElementById('tile-material-select'),pressSelect=document.getElementById('tile-press-select'),
  next=document.getElementById('tile-material-next'),status=document.getElementById('tile-material-status')}={}){
  let saved;try{saved=storage?.getItem(TILE_MATERIAL_KEY);}catch{}
  let current=read(saved),desired=current,request=0,stopped=false;
  const loads=new Map();
  function preload(material){
    if(!loads.has(material.id)){
      const sources=new Set([...Object.values(filesFor(material,'pressed')),...Object.values(filesFor(material,'short'))]);
      loads.set(material.id,Promise.all([...sources].map(async file=>{const image=new Image();image.src=url(file);await image.decode();})).catch(error=>{loads.delete(material.id);throw error;}));
    }
    return loads.get(material.id);
  }
  select.replaceChildren(...TILE_MATERIALS.map(material=>{const option=document.createElement('option');option.value=material.id;option.textContent=material.label;return option;}));
  function paint(state){
    current=state;desired=state;const {material,press}=state,files=filesFor(material,press);
    root.dataset.tileMaterial=material.id;root.dataset.tilePress=press;
    for(const [name,file]of Object.entries(files))root.style.setProperty('--tile-material-'+name,`url("${url(file)}")`);
    // The supplied purple strip belongs to the original purple tile. Every
    // special material crops its own pressed face, never a tinted foreign strip.
    root.style.setProperty('--tile-bridge-background-size',material.id==='original'?'100% 100%':'592.3077% 339.1304%');
    root.style.setProperty('--tile-bridge-center-x',material.id==='original'?'.5':'.49');
    root.style.setProperty('--tile-bridge-center-y',material.id!=='original'&&press==='short'?'.468':'.452');
    root.style.setProperty('--tile-material-ink',material.ink);
    root.style.setProperty('--tile-material-target-ink',material.id==='original'?'#574741':material.ink);
    root.style.setProperty('--tile-material-selected-ink',material.selectedInk||material.ink);
    root.style.setProperty('--tile-material-count',material.count||material.ink);
    root.style.setProperty('--tile-material-selected-count',material.selectedCount||material.selectedInk||material.ink);
    root.style.setProperty('--tile-material-line',material.line);
    select.value=material.id;pressSelect.value=press;pressSelect.disabled=material.id==='original';
    document.getElementById('tile-material-samples').setAttribute('aria-label',material.label+'：浅色普通、深色按住、收集后效果');
  }
  async function choose(state,persist=true){
    if(stopped)return;
    desired=state;const token=++request;status.textContent='正在切换…';
    try{await preload(state.material);}catch{
      if(token===request&&!stopped){paint(current);status.textContent='材质加载失败，请重试。';}return;
    }
    if(token!==request||stopped)return;
    paint(state);let remembered=true;
    if(persist)try{if(storage)storage.setItem(TILE_MATERIAL_KEY,JSON.stringify({material:state.material.id,press:state.press}));else remembered=false;}catch{remembered=false;}
    status.textContent=remembered?'':'仅本次有效';
  }
  select.addEventListener('change',()=>void choose({material:materialFor(select.value),press:desired.press}));
  pressSelect.addEventListener('change',()=>void choose({material:desired.material,press:pressFor(pressSelect.value)}));
  next.addEventListener('click',()=>void choose({material:TILE_MATERIALS[(TILE_MATERIALS.indexOf(desired.material)+1)%TILE_MATERIALS.length],press:desired.press}));
  window.addEventListener('storage',event=>{if(event.storageArea===storage&&event.key===TILE_MATERIAL_KEY)void choose(read(event.newValue),false);});
  paint(current);
  const ready=preload(current.material).catch(()=>{if(request===0&&!stopped){paint(read(null));status.textContent='材质加载失败，已使用原版。';}});
  void Promise.allSettled(TILE_MATERIALS.map(preload));
  return {ready,prepareDataReset(){stopped=true;++request;next.disabled=true;select.disabled=true;pressSelect.disabled=true;}};
}
