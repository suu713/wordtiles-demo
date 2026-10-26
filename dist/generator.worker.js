import { generateWithQuality } from './core/quality-generation.js?v=39';
self.onmessage = ({ data }) => {
  const { requestId, dictionary, seed, config,levelConfig,engine,composition,quality } = data;
  try {
    const result = generateWithQuality(config, dictionary, seed, {levelConfig,engine,quality,onProgress: stats => self.postMessage({ type: 'progress', requestId, stats }),onQualityProgress:stats=>self.postMessage({type:'quality-progress',requestId,stats})});
    if(result.ok&&composition)result.level.source={...result.level.source,targetComposition:composition};
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message });
  }
};
