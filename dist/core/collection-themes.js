// Categories are inferred from the saved definition so this module does not
// ship a second hard-coded vocabulary list.
export const COLLECTION_THEMES=Object.freeze([
  {id:'food',name:'食物与饮品',english:'FOOD & DRINK',icon:'food',color:'peach'},
  {id:'everyday',name:'日常生活',english:'EVERYDAY LIFE',icon:'home',color:'sand'},
  {id:'nature',name:'自然与风景',english:'THE GREAT OUTDOORS',icon:'leaf',color:'sage'},
  {id:'animals',name:'动物伙伴',english:'ANIMAL WORLD',icon:'paw',color:'sky'},
  {id:'travel',name:'旅行与探索',english:'ON THE ROAD',icon:'compass',color:'sky'},
  {id:'people',name:'人物与心情',english:'PEOPLE & FEELINGS',icon:'heart',color:'rose'},
  {id:'actions',name:'动作与表达',english:'LITTLE EXPRESSIONS',icon:'spark',color:'sage'},
  {id:'discoveries',name:'更多发现',english:'MORE TO EXPLORE',icon:'book',color:'sand'}
]);
const categoryThemes=Object.freeze({
  '水果':'food','蔬菜':'food','饮品':'food','食物':'food','乳品':'food','肉禽与蛋':'food','水产食品':'food','谷物与豆类':'food','成品食品':'food','调味品':'food',
  '哺乳动物':'animals','鸟类':'animals','鱼类':'animals','昆虫':'animals','爬行动物与两栖动物':'animals','其他动物与真菌':'animals',
  '植物':'nature','树木':'nature','花卉':'nature','地点与自然地理':'nature','天气与气候':'nature',
  '家居与日用品':'everyday','服饰与穿戴':'everyday','工具与器具':'everyday','建筑与构筑物':'everyday','计量单位':'everyday',
  '道路交通':'travel','交通工具':'travel','航海与船舶':'travel','航空与航天':'travel',
  '人物与身份称谓':'people','职业':'people','亲属关系':'people','社会关系':'people','情感':'people','认知与心理':'people','人体与解剖':'people','疾病与健康状态':'people','医药与治疗':'people',
  '动作与行为':'actions','交流与传播':'actions',
  '性质与特征':'discoveries','状态与情形':'discoveries','数词与数量':'discoveries','语法功能词':'discoveries',
  '食物/餐饮':'food','食物/水果':'food','食物/蔬菜':'food',
  '服装/饰品':'everyday','器物/工具':'everyday','建筑/空间':'everyday','单位/度量':'everyday',
  '植物/自然':'nature','动物/生物':'animals','交通/出行':'travel',
  '身体/医疗':'people','社会/职业':'people','情绪/心理':'people',
  '动作/行为':'actions','沟通/语言':'actions',
  '属性/状态':'discoveries','通用/描述':'discoveries','科技/数码':'discoveries',
  '商业/经济':'discoveries','艺术/文化':'discoveries','地理/天文':'discoveries'
});
const rules=[
  ['animals',/\b(?:mammal|reptile|amphibian|invertebrate|rodent|carnivorous|bird|insect|fishes|a fish|animal|larva|canine|feline)\b|动物|哺乳|爬行|昆虫|鸟类|鱼类|兽类|猫科|犬科/i],
  ['food',/\b(?:edible|food|beverage|drink|dish|dessert|fruit|vegetable|pastry|confection|cheese|bread|flour|cuisine|cereal|spice|cooking|cooked|baked|soup)\b|食品|食物|饮料|水果|蔬菜|糕点|面包|奶酪|烹饪|蛋糕|谷物|调味|香料|糖|茶|咖啡|酒|汤/i],
  ['nature',/\b(?:a tree|a plant|shrub|flower|foliage|botanical|geological|mineral|mountain|river|ocean|weather|precipitation|landscape|forest|evergreen)\b|植物|树木|花卉|山脉|河流|湖泊|海洋|天气|矿物|气候|自然|森林|草地|岩石|降雨|降雪|风|云|地貌/i],
  ['travel',/\b(?:vehicle|aircraft|railway|railroad|locomotive|vessel|seaport|harbor|harbour|journey|tourism|traveler|traveller|hotel|roadway)\b|交通工具|车辆|飞机|火车|铁路|轮船|港口|旅行|旅游|道路|酒店|机场|车站|航行|签证|路线/i],
  ['everyday',/\b(?:furniture|garment|clothing|fabric|utensil|household|kitchen|bedroom|footwear|jewelry|jewellery|appliance|container|furnishing)\b|家具|衣物|衣服|布料|织物|器具|家庭|厨房|卧室|鞋类|首饰|家用|容器|家居|工具|桌子|椅子|镜子|器皿/i],
  ['people',/\b(?:emotion|feeling|kinship|relative|friendship|affection|happiness|sadness|anxiety|a person who|one who)\b|情绪|感情|亲属|朋友|友谊|亲人|幸福|悲伤|焦虑|人类|人物|职业|家人/i],
  ['actions',/\b(?:vt|vi)\.|\b(?:action|act|move|movement|speech|express)\b|动词|动作|行为|移动|表达|说话|表示/i]
];
export function collectionTheme(word,definition='',language='english'){
  if(language!=='english')return 'discoveries';
  if(definition&&typeof definition==='object'&&categoryThemes[definition.category])return categoryThemes[definition.category];
  if(definition&&typeof definition==='object'){
    const classified=String(definition.category||'').split(/[、，,；;]/).map(category=>categoryThemes[category.trim()]).find(Boolean);
    if(classified)return classified;
  }
  const sense=String(typeof definition==='object'?(definition.definitionZh||definition.definition||''):definition).split(' / ')[0].slice(0,400);
  return rules.find(([,pattern])=>pattern.test(sense))?.[0]||'discoveries';
}
export function collectedWords(entries,lookup=()=>null){
  const unique=new Map();
  for(const entry of entries){
    if(!entry?.word||!entry.language)continue;
    const key=entry.language+':'+entry.word,source=lookup(entry.word,entry.origin)||'';
    const definition=typeof source==='object'?(source.definitionZh||source.definition||''):source,category=typeof source==='object'?source.category:null;
    const previous=unique.get(key);
    if(previous){const nextTime=Date.parse(entry.firstFoundAt),priorTime=Date.parse(previous.firstFoundAt);if(Number.isFinite(nextTime)&&(!Number.isFinite(priorTime)||nextTime<priorTime))previous.firstFoundAt=entry.firstFoundAt;if(!previous.definition)previous.definition=definition;if(!previous.category)previous.category=category;continue;}
    unique.set(key,{...entry,definition,category});
  }
  return [...unique.values()].map(entry=>({...entry,theme:collectionTheme(entry.word,{definition:entry.definition,category:entry.category},entry.language)})).sort((a,b)=>a.word.localeCompare(b.word)||a.language.localeCompare(b.language));
}
export function groupCollectionByTheme(words){
  return COLLECTION_THEMES.map(theme=>({...theme,words:words.filter(word=>word.theme===theme.id)})).filter(group=>group.words.length);
}
export const collectionGroups=groupCollectionByTheme;
