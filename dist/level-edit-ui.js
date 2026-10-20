import {createAlgorithmSession} from './core/algorithm-v1-adapter.js?v=21';
import {clone,RULES_VERSION} from './core/rules.js?v=21';

export function mountLevelEditor({onSave}) {
  const dialog=document.createElement('dialog');dialog.id='sequence-level-editor';dialog.className='batch-generation-dialog sequence-level-editor';dialog.setAttribute('aria-labelledby','sequence-edit-title');
  dialog.innerHTML='<div class="bulk-dialog-heading"><div><span class="bulk-eyebrow">关卡编辑</span><h2 id="sequence-edit-title">编辑本关</h2></div><button id="sequence-edit-close" type="button" aria-label="关闭关卡编辑">×</button></div><div class="bulk-dialog-body"><p class="bulk-intro">修改字母、目标词和连线路径。格子次数随目标路径自动计算，保存前会重新校验全部路径与完成状态。</p><label class="sequence-edit-limit">每格使用上限<input id="sequence-edit-max-uses" type="number" min="1" max="9" value="3"></label><div class="sequence-edit-layout"><section><h3>棋盘字母与使用次数</h3><div id="sequence-edit-board" class="sequence-edit-board"></div><p class="bulk-note">路径使用格号，从 1 开始。点目标行的“重新选路径”，再点棋盘上的格号连线。</p></section><section><h3>目标词与路径</h3><div id="sequence-edit-targets"></div><button id="sequence-edit-add" type="button">添加目标词</button></section></div><p id="sequence-edit-status" class="bulk-validation" role="status"></p></div><div class="bulk-dialog-footer"><button id="sequence-edit-cancel" type="button">取消</button><button id="sequence-edit-save" class="bulk-primary" type="button">校验并保存</button></div>';
  document.body.append(dialog);const $=id=>document.getElementById(id);
  let item=null,draft=null,activePath=-1;
  const inputs=()=>$('sequence-edit-board').querySelectorAll('input');
  function readTargets(){return [...$('sequence-edit-targets').children].map(row=>({word:row.querySelector('.sequence-edit-word').value.trim().toUpperCase(),path:row.querySelector('.sequence-edit-path').value.split(/[,，\s→\-]+/).filter(Boolean).map(n=>Number(n)-1)}));}
  function updateCounts(){const counts=Array(draft.board.rows*draft.board.cols).fill(0);for(const t of readTargets())for(const c of t.path)if(Number.isInteger(c)&&c>=0&&c<counts.length)counts[c]++;for(const [i,el]of [...$('sequence-edit-board').children].entries())el.querySelector('small').textContent=`使用 ${counts[i]} 次`;}
  function renderTargets(){
    $('sequence-edit-targets').replaceChildren(...draft.targets.map((target,index)=>{const row=document.createElement('div');row.className='sequence-edit-target';const word=document.createElement('input');word.className='sequence-edit-word';word.value=target.word;word.maxLength=10;word.setAttribute('aria-label',`目标词 ${index+1}`);const path=document.createElement('input');path.className='sequence-edit-path';path.value=target.path.map(n=>n+1).join(' → ');path.setAttribute('aria-label',`目标 ${index+1} 的格号路径`);const choose=document.createElement('button');choose.type='button';choose.textContent='重新选路径';choose.onclick=()=>{activePath=index;path.value='';word.value='';for(const r of $('sequence-edit-targets').children)r.classList.remove('selecting');row.classList.add('selecting');$('sequence-edit-status').textContent=`为第 ${index+1} 个目标选择相邻格号`;updateCounts();};const remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.onclick=()=>{draft.targets=readTargets().filter((_,i)=>i!==index);activePath=-1;renderTargets();};row.append(word,path,choose,remove);return row;}));
    $('sequence-edit-add').disabled=draft.targets.length>=16;updateCounts();
  }
  $('sequence-edit-add').onclick=()=>{draft.targets=readTargets();draft.targets.push({word:'',path:[]});renderTargets();};
  dialog.addEventListener('input',updateCounts);
  for(const id of ['sequence-edit-close','sequence-edit-cancel'])$(id).onclick=()=>dialog.close();
  $('sequence-edit-save').onclick=()=>{try{
    const level={...draft,board:{...draft.board,letters:[...inputs()].map(i=>i.value.trim().toUpperCase())},targets:readTargets()};
    const counts=Array(level.board.letters.length).fill(0);for(const t of level.targets)for(const cell of t.path)if(Number.isInteger(cell)&&cell>=0&&cell<counts.length)counts[cell]++;
    level.board.counts=counts;level.config={rows:level.board.rows,cols:level.board.cols,wordLengths:level.targets.map(t=>t.word.length),maxUses:Number($('sequence-edit-max-uses').value)};
    const s=createAlgorithmSession(level,item.dictionary);level.source={...level.source,edited:true,difficultyParameters:null,validationStates:s.report.stateChecks};
    onSave(item,level);dialog.close();
  }catch(e){$('sequence-edit-status').textContent=e.report?.errors?.map(x=>x.message).join('；')||e.message;}};
  return {open(entry){
    item=entry;const s=createAlgorithmSession(entry.level,entry.dictionary);draft=clone(s.initial);
    draft={...draft,schemaVersion:2,kind:'web',id:entry.level.id||`edited-${entry.level.seed}`,algorithmVersion:RULES_VERSION,dictionaryVersion:entry.dictionary.version,
      config:{rows:draft.board.rows,cols:draft.board.cols,wordLengths:draft.targets.map(t=>t.word.length),maxUses:draft.config?.maxUses??3},
      source:{...draft.source,dictionaryOrigin:entry.dictionary.metadata.origin,dictionaryVersion:entry.dictionary.version,dictionaryMetadata:entry.dictionary.metadata,sourceSha256:entry.dictionary.metadata.sourceSha256,generationEngine:'flexible'}};
    activePath=-1;$('sequence-edit-title').textContent=`编辑第 ${entry.number} 关`;$('sequence-edit-status').textContent='';$('sequence-edit-max-uses').value=draft.config.maxUses;
    $('sequence-edit-board').style.gridTemplateColumns=`repeat(${draft.board.cols}, minmax(0,1fr))`;
    $('sequence-edit-board').replaceChildren(...draft.board.letters.map((letter,index)=>{const tile=document.createElement('div'),number=document.createElement('button'),input=document.createElement('input'),count=document.createElement('small');tile.className='sequence-edit-tile';number.type='button';number.textContent=`格 ${index+1}`;input.value=letter;input.maxLength=1;input.setAttribute('aria-label',`格 ${index+1} 的字母`);number.onclick=()=>{if(activePath<0)return;const row=$('sequence-edit-targets').children[activePath],targets=readTargets(),path=targets[activePath].path;if(path.includes(index)){ $('sequence-edit-status').textContent='一个词内不能重复经过同一格';return;}if(path.length){const last=path.at(-1),cols=draft.board.cols;if(Math.abs(Math.floor(last/cols)-Math.floor(index/cols))+Math.abs(last%cols-index%cols)!==1){$('sequence-edit-status').textContent='请选择上下左右相邻的格子';return;}}path.push(index);row.querySelector('.sequence-edit-path').value=path.map(c=>c+1).join(' → ');row.querySelector('.sequence-edit-word').value=path.map(c=>inputs()[c].value.toUpperCase()).join('');updateCounts();};tile.append(number,input,count);return tile;}));
    renderTargets();dialog.showModal();
  }};
}
