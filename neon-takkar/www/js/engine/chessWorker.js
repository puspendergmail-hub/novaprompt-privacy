/** Runs chess AI search off the UI thread. */
import { chooseMove, deserialize } from './chess.js';

self.onmessage = (e) => {
  const { id, state, level } = e.data;
  const move = chooseMove(deserialize(state), level);
  self.postMessage({ id, move });
};
