import { summarizeRuns } from './playtest.js?v=29';
import {SPATIAL_CALIBRATION} from './spatial-perception.js?v=29';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
  const summary=[['反跑关卡分析','',''],['指标','数值','口径'],['任务状态',report.status||'complete','取消或失败只包含已处理关卡'],
    ['游戏',meta.game==='both'?'Word Tiles / Zen Word':meta.game==='zen'?'Zen Word':meta.game==='web'?'网页生成关卡':'Word Tiles',''],['语言',meta.language||'english',''],
    ['跑关模式',meta.mode||'ordinary',meta.mode==='rules'?'全知规则校验':'认识80%目标词 + 空间观察 + 滑动试探，待真人验证'],
    ['已处理关卡',report.levels.length,'原主线重复位置分别统计'],['请求关卡数',report.requested??report.levels.length,''],
    ['有效模拟局数',s.samples,'排除错误、规则异常与内部搜索保护终止'],['通关局数',s.wins,''],['模拟通关率',s.winRate,'有效局数为分母'],
    ['通关率95%下界',s.ciLow,'Wilson 区间，仅反映模拟抽样误差'],['通关率95%上界',s.ciHigh,'不包含模型与人群误差'],
    ['耗时中位数（秒）',s.medianSeconds,'含未通关局，机器使用虚拟时间'],['耗时P90（秒）',s.p90Seconds,''],['通关耗时中位数（秒）',s.medianWinSeconds,'只含通关局'],
    ['平均提示数',s.meanHints,''],['平均错误数',s.meanMistakes,'额外词和重复已完成词不算错误'],['错误或异常局数',s.errors,''],
    ['平均试探滑动',s.meanTrialSwipes,'探索性滑动，即使碰巧命中也计入；区别于全部提交和错误'],['平均未命中目标',s.meanFailedSwipes,'所有未完成目标的提交，包括额外词与重复词'],
    ['目标认识率设定',meta.mode==='rules'?null:.8,'每局固定比例，非整数随机取整，多局平均80%；不随排布改变'],['实际平均认识率',s.meanKnownRate,'仅普通英语模式'],
    ['平均认识但漏看词数',s.meanKnownMissedTargets,'每局至少出现一次漏识别的已知目标词，去重计数'],['平均累计漏识别次数',s.meanMissedRecognitions,'已知词被有限扫描检出后，空间识别未成功的次数'],
    ['随机方式','系统随机','每个新网页关卡和每局模拟使用系统随机值；原包关卡保留原始内容'],['每关重复次数',meta.repeats??null,''],
    ['模型版本',profile.version||'',''],['校准状态',profile.status||'prior','可导入英语真人记录进行校准'],
    ['自动结束','通关或持续卡关后放弃','无手填时间上限；虚拟耗时来自观察、思考、手势；内部步骤保护不计有效样本'],['最多提示数',profile.maxHints??null,'每次揭一个前字位字母，不扣格子次数，不自动提交'],['词频版本',report.frequencyVersion||'',''],
    ['空间模型版本',SPATIAL_CALIBRATION.version,''],['空间校准状态',SPATIAL_CALIBRATION.status,'同词同长度排布工程锚点拟合；不是海外真人统计'],['真人验证',SPATIAL_CALIBRATION.humanValidated?'已验证':'未验证','80%为用户设定，工程对照仅验证模型响应顺序'],
    ['原包SHA256',meta.sourceSha256||'',''],['词长口径','2～10字完整列出；实际长词继续追加','该词长的实际目标词数 ÷ 本关总目标词数；目标 / 额外词分别统计'],
    ['路径口径','结构与本局操作分开','原结构按参考路径；识别指标取相同消耗集合中最易识别路径；操作按真实提交；Zen空间项为空'],
    ['识别率口径','已认识词的一轮识别估计','逻辑回归分数：方向、拐弯、外圈比例、词长、同字邻格歧义；不等于通关率'],
    ['排布口径','顺读 / 倒向 / 多拐 / 外圈','顺读=无左或上步；倒向=反向步>50%；多拐≥2次；外圈格占比≥80%；低识别<55%'],
    ['反向连接口径','终点在起点左侧或上方','按画面坐标判断；原包上下行序已换算'],
    ['重复格子口径','被至少两个目标词共用的格子','最大使用次数按所有目标参考路径计算'],
    ['词频来源','wordfreq 3.1.1','https://github.com/rspeer/wordfreq；CC BY-SA 4.0'],
    ['玩家反馈来源','Word Tiles 英国 App Store','https://apps.apple.com/gb/app/word-tiles-relaxing-puzzle/id6783815362?see-all=reviews'],
    ['研究依据','Thanasuan & Mueller (2014)','https://doi.org/10.3389/fpsyg.2014.01018'],['生成时间',report.createdAt||new Date().toISOString(),'']];
  const lengths=[...new Set([...Array.from({length:9},(_,i)=>String(i+2)),...report.levels.flatMap(r=>[...Object.keys(r.wordLengths||{}),...Object.keys(r.extraWordLengths||{})])])].map(Number).sort((a,b)=>a-b);
  const columns=[['game','游戏'],['dictionaryOrigin','词库来源'],['dictionaryVersion','词库版本'],['sourceSha256','来源SHA256'],['language','语言'],['bank','关卡列表'],['position','原序号'],['editorNumber','编辑关号'],['plannedDifficulty','计划难度'],['id','关卡ID'],['difficulty','原难度档'],['score','原难度分'],
    ['rows','棋盘行数'],['cols','棋盘列数'],['wordCount','本关总词数'],['targetCount','目标词数'],['extras','额外词数'],['targets','目标词'],
    ...lengths.flatMap(n=>[['targetLength'+n,n+'字目标词数'],['extraLength'+n,n+'字额外词数'],['lengthShare'+n,n+'字目标占比']]),
    ['wordLengthRatio','全部目标词长比（约分）'],
    ['totalTurns','目标拐弯总次数'],['reverseTargets','反向目标词数'],['straightWords','直线目标词数'],['multiTurnTargets','多拐目标词数'],['sharedTiles','重复使用格子数'],['maxTileUses','最大格子使用次数'],
    ['readingForwardTargets','顺读目标词数'],['reverseMajorityTargets','倒向目标词数'],['mixedDirectionTargets','混合方向目标词数'],['outerTargets','外圈目标词数'],['spatialMultiTurnTargets','识别路径多拐词数'],['innerMultiTurnTargets','内圈多拐词数'],['hardToSpotTargets','低识别词数'],
    ['meanBackwardShare','平均反向步占比'],['meanEdgeShare','平均外圈格占比'],['meanKnownRecognition','已认识词单轮识别估计'],['meanLayoutDifficulty','排布难度估计（0～100）'],
    ['meanTurnOperations','平均本局拐弯次数'],['meanReverseConnections','平均本局反向连接次数'],
    ['minZipf','最低英语Zipf'],['meanZipf','平均英语Zipf'],['unknownFrequency','无词频词数'],['obstacles','原障碍数'],
    ['samples','有效局数'],['wins','通关局数'],['winRate','模拟通关率'],['ciLow','95%下界'],['ciHigh','95%上界'],
    ['medianSeconds','耗时中位数（秒）'],['p90Seconds','耗时P90（秒）'],['medianWinSeconds','通关耗时中位数（秒）'],['meanHints','平均提示'],['meanAttempts','平均全部提交'],['meanTrialSwipes','平均试探滑动'],['meanFailedSwipes','平均未命中目标'],['meanMistakes','平均错误'],
    ['meanKnownCount','平均认识词数'],['meanKnownRate','平均实际认识率'],['meanKnownMissedTargets','平均认识但漏看词数'],['meanMissedRecognitions','平均累计漏识别次数'],['meanKnownUnsolvedTargets','平均认识却未解词数'],['errors','错误局数'],['error','错误原因'],['runMode','跑关模式']];
  const runCols=[['game','游戏'],['dictionaryOrigin','词库来源'],['language','语言'],['bank','关卡列表'],['position','原序号'],['id','关卡ID'],['repeat','重复编号'],['runId','本局编号'],['mode','模式'],
    ['outcome','结果'],['elapsedSeconds','虚拟耗时（秒）'],['attempts','提交次数'],['trialSwipes','试探滑动次数'],['failedSwipes','未命中目标次数'],['mistakes','错误次数'],['hints','提示字母数'],['scans','观察轮数'],
    ['knownCount','认识目标词数'],['knownRate','实际认识率'],['knownMissedTargets','认识但漏看词数'],['missedRecognitions','累计漏识别次数'],['knownUnsolvedTargets','认识却未解词数'],['spatialVersion','空间模型版本'],['calibrationStatus','空间校准状态'],['turnOperations','本局拐弯次数'],['reverseConnections','本局反向连接次数'],
    ['completed','完成目标数'],['targetCount','目标总数'],['bonusWords','找到额外词数'],['modelVersion','模型版本'],['frequencyVersion','词频版本'],['error','错误原因']];
  const rows=report.levels.map(r=>{const out={...r};for(const n of lengths){out['targetLength'+n]=r.wordLengths?.[n]||0;out['extraLength'+n]=r.extraWordLengths?.[n]||0;out['lengthShare'+n]=r.wordLengthShares?.[n]??(r.targetCount?(r.wordLengths?.[n]||0)/r.targetCount:0);}return out;});
  const mapTable=(data,cols)=>[cols.map(c=>c[1]),...data.map(r=>cols.map(c=>r[c[0]]??null))];
  const percentKeys=new Set(['share3','share4','share5','winRate','ciLow','ciHigh','meanBackwardShare','meanEdgeShare','meanKnownRecognition','meanKnownRate',...lengths.map(n=>'lengthShare'+n)]);
  const sheets=[{name:'分析总览',rows:summary,widths:[34,30,98],headerRow:2,percentCells:summary.flatMap((r,i)=>['模拟通关率','通关率95%下界','通关率95%上界','目标认识率设定','实际平均认识率'].includes(r[0])?['B'+(i+1)]:[])},
    {name:'逐关分析',rows:mapTable(rows,columns),percentColumns:columns.flatMap(([key],i)=>percentKeys.has(key)?[i]:[]),widths:columns.map(([k])=>k==='targets'?60:k==='bank'?36:k==='id'?36:k==='error'?60:22)},
    {name:'逐局明细',rows:mapTable(report.runs,runCols),percentColumns:runCols.flatMap(([key],i)=>key==='knownRate'?[i]:[]),widths:runCols.map(([k])=>['bank','id','runId','modelVersion','frequencyVersion'].includes(k)?38:22)}];
  if(report.words?.length){const cols=[['game','游戏'],['language','语言'],['bank','关卡列表'],['position','原序号'],['levelId','关卡ID'],['role','名单角色'],['word','单词'],['zipf','英语Zipf'],
    ['length','目标词长'],['turns','识别路径拐弯'],['backwardSteps','反向步数'],['backwardShare','反向步占比'],['edgeShare','外圈格占比'],['readingForward','是否顺读'],['reverseMajority','是否倒向'],['multiTurn','是否多拐'],['outer','是否外圈'],['recognitionProbability','已认识时单轮识别估计'],['layoutDifficulty','排布难度估计（0～100）'],['ambiguity','同字邻格歧义'],
    ['knownSamples','认识该词局数'],['missedKnownSamples','认识但漏看局数'],['missedRecognitions','累计漏识别次数'],['trialSwipes','针对该词试探次数'],['hintLetters','累计提示字母'],['successes','成功局数'],['hinted','提示局数'],['samples','有效模拟局数']];
    sheets.push({name:'词汇明细',rows:mapTable(report.words,cols),percentColumns:cols.flatMap(([key],i)=>['backwardShare','edgeShare','recognitionProbability'].includes(key)?[i]:[]),widths:cols.map(([key])=>['bank','levelId'].includes(key)?36:24)});}
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
