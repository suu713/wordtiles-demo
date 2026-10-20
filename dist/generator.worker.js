import { generateLevel } from './core/algorithm2.js?v=21';
self.onmessage = ({ data }) => {
  const { requestId, dictionary, seed, config,levelConfig,engine,composition } = data;
  try {
    const result = generateLevel(config, dictionary, seed, {levelConfig,engine, onProgress: stats => self.postMessage({ type: 'progress', requestId, stats }) });
    if(result.ok&&composition)result.level.source={...result.level.source,targetComposition:composition};
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message });
  }
};
