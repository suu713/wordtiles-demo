// The original PNGs remain untouched. Complementary SVG masks split the visible
// ornaments from the plate, so each can move without a duplicate underneath.
export const FLORAL_BANNERS=Object.freeze([
  {id:'book',file:'5@2x.png',width:1072,height:358,ink:'#fffbed',
    left:'M0 0H186L185 101L175 152L207 182L229 203L286 204L326 252L370 294L343 315L288 327L0 358Z',
    right:'M1072 0H1001L985 47L964 94L944 126L932 163L916 191L905 219L897 249L881 274L877 304L888 317L916 293L950 282L973 276L994 255L1007 223L1072 200Z',
    leftOrigin:'21% 83%',rightOrigin:'84% 85%',text:{left:30,top:26,width:48,height:42}},
  {id:'blossom',file:'6@2x.png',width:1172,height:368,ink:'#fffbed',
    left:'M0 0H224L209 84L186 104L169 139L161 173L183 179L198 198L211 215L234 202L261 195L292 192L281 212L263 231L258 248L280 235L300 230L310 235L303 251L290 262L318 267L349 284L372 306L392 323L357 330L321 321L291 317L265 325L258 340L0 368Z',
    right:'M1172 0H933L936 70L913 83L940 99L962 105L976 125L987 148L978 172L963 191L966 212L975 232L954 221L942 214L943 238L947 254L922 260L898 272L876 292L857 322L905 319L942 315L967 331L980 351L1172 368Z',
    leftOrigin:'22% 80%',rightOrigin:'84% 79%',text:{left:30,top:29,width:46,height:42}},
  {id:'iris',file:'7@2x.png',width:1062,height:356,ink:'#fffbed',
    left:'M0 0H300L300 66L286 95L278 120L290 139L312 135L297 153L279 170L272 187L299 205L315 228L324 264L314 301L335 329L0 356Z',
    right:'M1062 0H867L869 59L879 82L868 103L871 130L853 112L834 104L842 126L856 155L867 181L849 188L823 180L800 179L777 188L803 195L827 211L848 233L864 250L836 256L802 273L774 292L744 319L786 316L829 311L872 309L916 302L1062 356Z',
    leftOrigin:'20% 82%',rightOrigin:'85% 81%',text:{left:31,top:29,width:44,height:42}},
  {id:'rose',file:'8@2x.png',width:1048,height:296,ink:'#77533e',
    left:'M0 0H170L154 60L148 80L165 101L151 118L158 139L170 155L180 171L193 188L224 189L250 202L264 220L286 227L313 230L341 244L349 270L317 281L279 268L249 258L218 254L190 262L150 263L0 296Z',
    right:'M1048 0H929L934 51L953 71L965 94L967 117L940 119L919 129L902 140L885 145L862 158L835 166L830 186L842 210L823 220L801 216L769 220L733 235L706 255L693 283L737 276L767 268L807 271L840 275L896 278L1048 296Z',
    leftOrigin:'23% 81%',rightOrigin:'84% 80%',text:{left:30,top:27,width:45,height:44}},
]);

export function floralBannerMarkup(variant,prefix='floral'){
  const art=typeof variant==='string'?FLORAL_BANNERS.find(item=>item.id===variant):variant;
  if(!art)throw new Error('Unknown floral banner');
  const left=prefix+'-left',right=prefix+'-right',plate=prefix+'-plate';
  const source=`./art/floral-banners/${art.file}`;
  const sprite=`<image href="${source}" width="${art.width}" height="${art.height}"/>`;
  const ornament=(side,path,origin)=>`<g class="floral-bloom floral-${side}" style="--floral-origin:${origin}"><g class="floral-sway" clip-path="url(#${path})">${sprite}</g></g>`;
  return `<svg class="floral-art" viewBox="0 0 ${art.width} ${art.height}" aria-hidden="true" focusable="false">
    <defs><clipPath id="${left}"><path d="${art.left}"/></clipPath><clipPath id="${right}"><path d="${art.right}"/></clipPath>
      <mask id="${plate}" maskUnits="userSpaceOnUse" x="0" y="0" width="${art.width}" height="${art.height}" style="mask-type:luminance"><rect width="${art.width}" height="${art.height}" fill="white"/><path d="${art.left}" fill="black"/><path d="${art.right}" fill="black"/></mask>
    </defs>
    <g class="floral-plate" mask="url(#${plate})">${sprite}</g>
    ${ornament('left',left,art.leftOrigin)}${ornament('right',right,art.rightOrigin)}
  </svg>`;
}

let nextView=0;
export class FloralBannerView{
  constructor(host){
    this.prefix='floral-view-'+(++nextView);this.element=document.createElement('div');this.element.className='floral-banner';this.element.hidden=true;
    host.append(this.element);
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);
  }
  show(variant,text,duration=2200){
    const art=typeof variant==='string'?FLORAL_BANNERS.find(item=>item.id===variant):variant;
    if(!art)throw new Error('Unknown floral banner');
    const root=this.element;root.classList.remove('floral-active');root.dataset.variant=art.id;
    root.style.setProperty('--floral-ratio',`${art.width}/${art.height}`);root.style.setProperty('--floral-ink',art.ink);
    root.style.setProperty('--floral-duration',duration+'ms');
    for(const [name,value]of Object.entries(art.text))root.style.setProperty('--floral-text-'+name,value+'%');
    root.innerHTML=floralBannerMarkup(art,this.prefix)+'<strong class="floral-label"><span></span></strong>';
    root.querySelector('.floral-label>span').textContent=text;root.hidden=false;this.fit();
    void root.offsetWidth;root.classList.add('floral-active');
  }
  fit(){
    const root=this.element;if(root.hidden||!root.querySelector('.floral-label'))return;
    const label=root.querySelector('.floral-label'),copy=label.firstElementChild;label.style.fontSize='';
    const box=label.getBoundingClientRect(),content=copy.getBoundingClientRect();
    const scale=Math.min(1,box.width/Math.max(1,content.width),box.height/Math.max(1,content.height));
    if(scale<1)label.style.fontSize=(parseFloat(getComputedStyle(label).fontSize)*scale)+'px';
  }
  hide(){this.element.hidden=true;this.element.classList.remove('floral-active');}
}

export async function preloadFloralBanners(){
  await Promise.all(FLORAL_BANNERS.map(async art=>{const image=new Image();image.src=new URL('./art/floral-banners/'+art.file,import.meta.url).href;await image.decode();}));
}
