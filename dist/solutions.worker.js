import { calculateLevelSolutions } from './core/level-solutions.js?v=13';
self.onmessage = ({ data }) => {
  self.postMessage({ requestId:data.requestId, result:calculateLevelSolutions(data.level, data.dictionary, data.options) });
};
