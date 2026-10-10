import { generateLevel } from './core/generator.js';
self.onmessage = ({ data }) => {
  const { requestId, dictionary, seed, budget } = data;
  try {
    const result = generateLevel(dictionary, seed, { budget, onProgress: stats => self.postMessage({ type: 'progress', requestId, stats }) });
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message });
  }
};
