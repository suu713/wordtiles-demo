import {isWTLevel,WTSourceSession} from './wt-source-session.js?v=40';
import {createAlgorithmSession} from './algorithm-v1-adapter.js?v=21';
export function createPlaySession(level,dictionary){return isWTLevel(level)?new WTSourceSession(level):createAlgorithmSession(level,dictionary);}
