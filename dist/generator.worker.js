import { generateLevel } from './core/algorithm2.js?v=14';
self.onmessage = ({ data }) => {
  const { requestId, dictionary, seed, config } = data;
  try {
    const result = generateLevel(config, dictionary, seed, { onProgress: stats => self.postMessage({ type: 'progress', requestId, stats }) });
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message });
  }
};
