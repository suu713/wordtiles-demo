export const BACKGROUND_THEME_KEY='wordtiles.background-theme.v1';
export const BACKGROUND_THEMES=Object.freeze([
  {id:'desert',label:'沙漠落日',file:'desert.png'},
  {id:'lakeside',label:'碧湖森林',file:'lakeside.png'},
  {id:'lavender',label:'薰衣草田',file:'lavender.png'},
  {id:'snow',label:'雪山冰湖',file:'snow.png'},
]);
const themeFor=id=>BACKGROUND_THEMES.find(theme=>theme.id===id)||BACKGROUND_THEMES[0];
const sourceFor=theme=>new URL('./art/themes/'+theme.file,import.meta.url).href;

// Appearance is independent of the game session and its progress.
export function mountBackgroundThemes({storage,root=document.documentElement,options=document.getElementById('background-theme-options'),status=document.getElementById('background-theme-status')}={}){
  let saved;try{saved=storage?.getItem(BACKGROUND_THEME_KEY);}catch{}
  let current=themeFor(saved),request=0;
  const loads=new Map();
  function preload(theme){
    if(!loads.has(theme.id)){
      const image=new Image();image.src=sourceFor(theme);
      loads.set(theme.id,image.decode().catch(error=>{loads.delete(theme.id);throw error;}));
    }
    return loads.get(theme.id);
  }
  function paint(theme){
    current=theme;root.dataset.backgroundTheme=theme.id;
    root.style.setProperty('--scene-background',`url("${sourceFor(theme)}")`);
    for(const input of options.querySelectorAll('input')){
      input.checked=input.value===theme.id;
      input.closest('label').classList.toggle('selected',input.checked);
    }
  }
  options.replaceChildren(...BACKGROUND_THEMES.map(theme=>{
    const label=document.createElement('label');label.className='background-theme-choice';
    const radio=document.createElement('input');radio.type='radio';radio.name='background-theme';radio.value=theme.id;radio.setAttribute('aria-label',theme.label);
    const image=document.createElement('img');image.src=sourceFor(theme);image.alt='';image.decoding='async';image.loading='lazy';
    const caption=document.createElement('span');caption.textContent=theme.label;
    label.append(radio,image,caption);return label;
  }));
  paint(current);
  status.textContent='当前：'+current.label;
  async function choose(id,persist=true){
    const theme=themeFor(id),token=++request;
    status.textContent='正在切换…';
    try{await preload(theme);}catch{
      if(token===request){paint(current);status.textContent='背景加载失败，请重试。';}
      return;
    }
    if(token!==request)return;
    paint(theme);
    let remembered=true;
    if(persist)try{if(storage)storage.setItem(BACKGROUND_THEME_KEY,theme.id);else remembered=false;}catch{remembered=false;}
    status.textContent='当前：'+theme.label+(remembered?'':'（仅本次有效）');
  }
  options.addEventListener('change',event=>{
    if(event.target.matches('input[name="background-theme"]'))void choose(event.target.value);
  });
  window.addEventListener('storage',event=>{
    if(event.storageArea===storage&&event.key===BACKGROUND_THEME_KEY)void choose(event.newValue,false);
  });
  const ready=preload(current);
  // Warm the other choices so comparisons do not flash while loading.
  void Promise.allSettled(BACKGROUND_THEMES.map(preload));
  return {ready};
}
