import { summarizeRuns } from './playtest.js?v=46';
import {SPATIAL_CALIBRATION} from './spatial-perception.js?v=46';
import {TARGET_LENGTH_RATIO_ORDER,TARGET_LENGTH_RATIO_TITLE,targetLengthRatio} from './playtest-metrics.js?v=46';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const omittedSimulationFields=new Set(['maxHints','hintAfter','hints','meanHints','hintLetters','hinted','winRate','ciLow','ciHigh','knownUnsolvedTargets','meanKnownUnsolvedTargets','extraWordLengths','samples','wins','emptyGridWins','meanCompleted','errors','error','ratio345','obstacles','meanSeconds','medianSeconds','p90Seconds','medianWinSeconds','elapsedSeconds']);
const completionValue=value=>Number.isFinite(value)?value:null;
const completionRun=run=>({...run,completionSeconds:run.outcome==='won'?completionValue(run.elapsedSeconds):null});
export function exportAnalysisJson(report) {
  const meta=report.job||{},summary=summarizeRuns((report.runs||[]).filter(run=>!run.mode||!meta.mode||run.mode===meta.mode)),snapshot={...report,
    levels:report.levels.map(level=>({...level,completionSeconds:completionValue(level.medianWinSeconds),wordLengthRatio:targetLengthRatio(level.wordLengths),wordLengthRatioOrder:[...TARGET_LENGTH_RATIO_ORDER]})),
    runs:(report.runs||[]).map(completionRun),summary:{...summary,completionSeconds:completionValue(summary.medianWinSeconds)}};
  if(meta.includeRuns===false)delete snapshot.runs;
  return JSON.stringify(snapshot,(key,value)=>omittedSimulationFields.has(key)?undefined:value,2);
}
const encoder=new TextEncoder();
const xml=value=>String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function columnName(index) {let s='';for(let i=index+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes) {let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function concat(parts) {const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
// Stored ZIP entries keep the exporter dependency-free and usable offline on static hosting.
export function zipFiles(files) {
  const local=[],central=[];let offset=0;
  for(const [name,text] of files) {
    const filename=encoder.encode(name),bytes=encoder.encode(text),crc=crc32(bytes);
    const header=new Uint8Array(30),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);
    h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,filename.length,true);
    local.push(header,filename,bytes);
    const cd=new Uint8Array(46),c=new DataView(cd.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
    c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);
    central.push(cd,filename);offset+=header.length+filename.length+bytes.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer),centralSize=central.reduce((s,p)=>s+p.length,0);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return concat([...local,...central,end]);
}
export function analysisSheets(report) {
  const meta=report.job||{},profile=meta.profile||{},s=summarizeRuns(report.runs.filter(r=>!r.mode||!meta.mode||r.mode===meta.mode));
  const knowledgeRate=profile.knowledgeRate??.8,rateLabel=Number((knowledgeRate*100).toFixed(2))+'%';
  const meanScore=key=>{const values=report.levels.map(level=>level[key]).filter(Number.isFinite);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;};
  const summary=[['反跑关卡分析','',''],['指标','数值','口径'],['任务状态',report.status||'complete','取消或失败只包含已处理关卡'],
    ['游戏',meta.game==='uploaded'?'上传关卡':meta.game==='both'?'Word Tiles / Zen Word':meta.game==='zen'?'Zen Word':meta.game==='web'?'网页生成关卡':'Word Tiles',''],['语言',meta.language||'english',''],
    ...(meta.uploadedSource?[['上传文件',meta.uploadedSource.name,'按文件顺序使用起止序号'],['文件总关卡数',meta.uploadedSource.count,'']]:[]),
    ['跑关模式',meta.mode||'ordinary',meta.mode==='rules'?'全知规则校验':`认识${rateLabel}目标词 + 空间观察 + 滑动试探，待真人验证`],
    ['已处理关卡',report.levels.length,'原主线重复位置分别统计'],['请求关卡数',report.requested??report.levels.length,''],
    ['附加逐局明细',meta.includeRuns===false?'否':'是','仅控制导出明细，所有均值仍按本批实际试玩数据计算'],
    ['通关耗时（秒）',s.medianWinSeconds,'仅已通关局用时的中位数；无通关样本留空；机器使用预计玩家时间'],
    ['平均错误数',s.meanMistakes,'额外词和重复已完成词不算错误'],
    ['平均原识别估计分',meanScore('meanKnownRecognition'),'按已处理关卡平均；原静态排布分不随认识比例改变'],['平均校正后识别估计分',meanScore('meanCorrectedRecognition'),'按已处理且适用的关卡平均，采用本批认识比例；不适用项留空'],
    ['平均试探滑动',s.meanTrialSwipes,'探索性滑动，即使碰巧命中也计入；区别于全部提交和错误'],['平均未命中目标',s.meanFailedSwipes,'所有未完成目标的提交，包括额外词与重复词'],
    ['目标认识率设定',meta.mode==='rules'?null:knowledgeRate,'按设定比例抽取目标词，非整数随机取整；不随排布改变'],['实际平均认识率',s.meanKnownRate,'仅普通英语模式'],
    ['平均认识但漏看词数',s.meanKnownMissedTargets,'每局至少出现一次漏识别的已知目标词，去重计数'],['平均累计漏识别次数',s.meanMissedRecognitions,'已知词被有限扫描检出后，空间识别未成功的次数'],
    ['随机方式','系统随机','每局模拟使用系统随机值；原包固定配置保留，生成关卡使用工作簿必答词'],['每关重复次数',meta.repeats??null,''],
    ['模型版本',profile.version||'',''],['校准状态',profile.status||'prior','可导入英语真人记录进行校准'],
    ['自动结束','通关或持续卡关后放弃','虚拟耗时来自观察、思考、手势；不自动使用付费道具；内部步骤保护不计有效样本'],['词频版本',report.frequencyVersion||'',''],
    ['空间模型版本',SPATIAL_CALIBRATION.version,''],['空间校准状态',SPATIAL_CALIBRATION.status,'同词同长度排布工程锚点拟合；不是海外真人统计'],['真人验证',SPATIAL_CALIBRATION.humanValidated?'已验证':'未验证','认识比例由用户设定，工程对照仅验证模型响应顺序'],
    ['来源SHA256',meta.sourceSha256||'',meta.game==='uploaded'?'上传的关卡 JSON；逐关保留词库及原包来源':meta.game==='wordtiles'?'来源为 Word Tiles 1.4.0 XAPK；原词、原棋盘、原帘子':'来源为 WT词库.xlsx'],['词长口径','按本批实际目标词长生成列','该词长的实际目标词数 ÷ 本关总目标词数；不导出各词长额外词数量'],
    ['校正分口径','已认识词在推进清除后的识别估计','使用本批认识比例；WT原包按真实帘子、全部路径并集扣次及替代格清理规则推进；0%认识时没有条件样本，留空'],
    ['路径口径','结构与本局操作分开','原结构按参考路径；识别指标取相同消耗集合中最易识别路径；操作按真实提交；Zen空间项为空'],
    ['识别率口径','已认识词的一轮识别估计','逻辑回归分数：方向、拐弯、外圈比例、词长、同字邻格歧义；不等于通关率'],
    ['排布难度口径','100 ×（1 − 原识别估计分）','仅是原识别分的反向换算，越高越难识别，不是通关失败概率'],
    ['熟悉度口径','1档→5.1；2档→4.5；3档→3.9；4档→3.3；5档→2.7','来自工作簿生僻档位的近似映射，越高越常见；并非真实词频'],
    ['缺少标注口径','未在当前工作簿找到熟悉度标注的目标词数','不等于机器不认识词数；缺失词不计入平均与最低熟悉度'],
    ['排布口径','顺读 / 倒向 / 多拐 / 外圈','顺读=无左或上步；倒向=反向步>50%；多拐≥2次；外圈格占比≥80%；低识别<55%'],
    ['反向连接口径','终点在起点左侧或上方','按棋盘显示方向判断'],
    ['重复格子口径','被至少两个目标词共用的格子','生成关按参考路径；WT 1.4.0 原包每词全部路径的格子并集计次'],
    ['词频来源','WT词库.xlsx 生僻程度 1～5 映射为词频近似','没有外部词频文件'],
    ['玩家反馈来源','Word Tiles 英国 App Store','https://apps.apple.com/gb/app/word-tiles-relaxing-puzzle/id6783815362?see-all=reviews'],
    ['研究依据','Thanasuan & Mueller (2014)','https://doi.org/10.3389/fpsyg.2014.01018'],['生成时间',report.createdAt||new Date().toISOString(),'']];
  const lengths=[...new Set(report.levels.flatMap(r=>Object.keys(r.wordLengths||{})))].map(Number).sort((a,b)=>a-b);
  const columns=[['game','游戏'],['dictionaryOrigin','词库来源'],['dictionaryVersion','词库版本'],['sourceSha256','来源SHA256'],['language','语言'],['bank','关卡列表'],['position','原序号'],['editorNumber','编辑关号'],['plannedDifficulty','计划难度'],['id','关卡ID'],['difficulty','原难度档'],['score','原难度分'],
    ['rows','棋盘行数'],['cols','棋盘列数'],['wordCount','本关总词数'],['targetCount','目标词数'],['extras','额外词数'],['targets','目标词'],
    ...lengths.flatMap(n=>[['targetLength'+n,n+'字目标词数'],['lengthShare'+n,n+'字目标占比']]),
    ['wordLengthRatio',TARGET_LENGTH_RATIO_TITLE],
    ['totalTurns','目标拐弯总次数'],['reverseTargets','反向目标词数'],['straightWords','直线目标词数'],['multiTurnTargets','多拐目标词数'],['sharedTiles','重复使用格子数'],['maxTileUses','最大格子使用次数'],
    ['readingForwardTargets','顺读目标词数'],['reverseMajorityTargets','倒向目标词数'],['mixedDirectionTargets','混合方向目标词数'],['outerTargets','外圈目标词数'],['spatialMultiTurnTargets','识别路径多拐词数'],['innerMultiTurnTargets','内圈多拐词数'],['hardToSpotTargets','低识别词数'],
    ['meanBackwardShare','平均反向步占比'],['meanEdgeShare','平均外圈格占比'],['meanKnownRecognition','原识别估计分'],['meanCorrectedRecognition','校正后识别估计分'],['meanLayoutDifficulty','排布难度估计（0～100）'],
    ['meanTurnOperations','平均本局拐弯次数'],['meanReverseConnections','平均本局反向连接次数'],
    ['minZipf','最低熟悉度近似分'],['meanZipf','平均熟悉度近似分'],['unknownFrequency','缺少熟悉度标注词数'],
    ['completionSeconds','通关耗时（秒）'],['meanAttempts','平均全部提交'],['meanTrialSwipes','平均试探滑动'],['meanFailedSwipes','平均未命中目标'],['meanMistakes','平均错误'],
    ['meanKnownCount','平均认识词数'],['meanKnownRate','平均实际认识率'],['meanKnownMissedTargets','平均认识但漏看词数'],['meanMissedRecognitions','平均累计漏识别次数'],['runtime','规则版本'],['runMode','跑关模式']];
  const runCols=[['game','游戏'],['dictionaryOrigin','词库来源'],['language','语言'],['bank','关卡列表'],['position','原序号'],['id','关卡ID'],['repeat','重复编号'],['runId','本局编号'],['mode','模式'],
    ['outcome','结果'],['victoryReason','通关原因'],['completionSeconds','通关耗时（秒）'],['attempts','提交次数'],['trialSwipes','试探滑动次数'],['failedSwipes','未命中目标次数'],['mistakes','错误次数'],['scans','观察轮数'],
    ['knownCount','认识目标词数'],['knownRate','实际认识率'],['knownMissedTargets','认识但漏看词数'],['missedRecognitions','累计漏识别次数'],['spatialVersion','空间模型版本'],['calibrationStatus','空间校准状态'],['turnOperations','本局拐弯次数'],['reverseConnections','本局反向连接次数'],
    ['completed','完成目标数'],['targetCount','目标总数'],['bonusWords','找到额外词数'],['modelVersion','模型版本'],['frequencyVersion','词频版本']];
  const rows=report.levels.map(r=>{const out={...r,completionSeconds:completionValue(r.medianWinSeconds),wordLengthRatio:targetLengthRatio(r.wordLengths)};for(const n of lengths){out['targetLength'+n]=r.wordLengths?.[n]||0;out['lengthShare'+n]=r.wordLengthShares?.[n]??(r.targetCount?(r.wordLengths?.[n]||0)/r.targetCount:0);}return out;});
  const mapTable=(data,cols)=>[cols.map(c=>c[1]),...data.map(r=>cols.map(c=>r[c[0]]??null))];
  const percentKeys=new Set(['share3','share4','share5','meanBackwardShare','meanEdgeShare','meanKnownRecognition','meanCorrectedRecognition','meanKnownRate',...lengths.map(n=>'lengthShare'+n)]);
  const sheets=[{name:'分析总览',rows:summary,widths:[34,30,98],headerRow:2,percentCells:summary.flatMap((r,i)=>['目标认识率设定','实际平均认识率','平均原识别估计分','平均校正后识别估计分'].includes(r[0])?['B'+(i+1)]:[])},
    {name:'逐关分析',rows:mapTable(rows,columns),percentColumns:columns.flatMap(([key],i)=>percentKeys.has(key)?[i]:[]),widths:columns.map(([k])=>k==='targets'?60:k==='bank'?36:k==='id'?36:k==='error'?60:22)}];
  if(meta.includeRuns!==false)sheets.push({name:'逐局明细',rows:mapTable(report.runs.map(completionRun),runCols),percentColumns:runCols.flatMap(([key],i)=>key==='knownRate'?[i]:[]),widths:runCols.map(([k])=>['bank','id','runId','modelVersion','frequencyVersion'].includes(k)?38:22)});
  if(report.words?.length){const cols=[['game','游戏'],['language','语言'],['bank','关卡范围'],['position','关卡序号'],['levelId','关卡ID'],['role','名单角色'],['word','单词'],['zipf','熟悉度近似分'],
    ['length','目标词长'],['turns','识别路径拐弯'],['backwardSteps','反向步数'],['backwardShare','反向步占比'],['edgeShare','外圈格占比'],['readingForward','是否顺读'],['reverseMajority','是否倒向'],['multiTurn','是否多拐'],['outer','是否外圈'],['recognitionProbability','原识别估计分'],['correctedRecognitionProbability','校正后识别估计分'],['layoutDifficulty','排布难度估计（0～100）'],['ambiguity','同字邻格歧义'],
    ['knownSamples','认识该词局数'],['missedKnownSamples','认识但漏看局数'],['missedRecognitions','累计漏识别次数'],['trialSwipes','针对该词试探次数'],['successes','成功局数']];
    sheets.push({name:'词汇明细',rows:mapTable(report.words,cols),percentColumns:cols.flatMap(([key],i)=>['backwardShare','edgeShare','recognitionProbability','correctedRecognitionProbability'].includes(key)?[i]:[]),widths:cols.map(([key])=>['bank','levelId'].includes(key)?36:24)});}
  return sheets;
}

function sheetXml(sheet) {
  if(sheet.rows.length>1048576)throw new Error('数据超过 Excel 单表行数，请缩小范围');
  const width=sheet.rows.reduce((max,row)=>Math.max(max,row.length),0),end=columnName(width-1)+sheet.rows.length,header=sheet.headerRow||1;
  const rows=sheet.rows.map((row,ri)=>`<row r="${ri+1}"${ri+1===header?' ht="36" customHeight="1"':''}>${row.map((value,ci)=>{
    if(value===null||value===undefined)return '';
    const cell=columnName(ci)+(ri+1),style=ri+1===header?1:sheet.percentColumns?.includes(ci)||sheet.percentCells?.includes(cell)?2:typeof value==='number'?(Number.isInteger(value)?0:3):0;
    if(typeof value==='number')return Number.isFinite(value)?`<c r="${cell}" s="${style}"><v>${value}</v></c>`:'';
    if(typeof value==='boolean')return `<c r="${cell}" s="${style}" t="b"><v>${value?1:0}</v></c>`;
    return `<c r="${cell}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value).slice(0,32767))}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${header}" topLeftCell="A${header+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols>${Array.from({length:width},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${sheet.widths?.[i]||22}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${header===1?`<autoFilter ref="A1:${end}"/>`:''}</worksheet>`;
}
export function exportAnalysisXlsx(report) {
  const sheets=analysisSheets(report),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const files=[['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`<styleSheet xmlns="${ns}"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/><color rgb="FF263B33"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF174E43"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]];
  sheets.forEach((s,i)=>files.push([`xl/worksheets/sheet${i+1}.xml`,sheetXml(s)]));return zipFiles(files);
}
export function downloadFile(data,filename,type='application/json') {
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
