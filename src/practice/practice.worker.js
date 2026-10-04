// Web worker that runs Practice hands: the GTO opponents solve their spots here, off the main thread.
// It keeps the hand being played (with its engine); the page sends what you do and gets the hand back.
// Messages in:  { id, type: 'new', setup } | { id, type: 'replay', hand, options } | { id, type: 'act', action }
//               | { id, type: 'deal', codes (null = random) }
// Messages out: { id, spot } (the hand without the engine, or null if no spot came up) or { id, error }.
import '../gto/chartUrls.js';
import { generateSpot, heroAct, dealStreet, snapshot } from './generateSpot.js';
import { spotFromSavedHand } from './replaySpot.js';

let current = null;

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === 'new') current = await generateSpot(event.data.setup);
    else if (type === 'replay') {
      const result = await spotFromSavedHand(event.data.hand, event.data.options);
      if (result.error) throw new Error(result.error);
      current = result;
    } else if (!current) throw new Error('No hand in progress.');
    else if (type === 'act') current = heroAct(current, event.data.action);
    else if (type === 'deal') current = dealStreet(current, event.data.codes ?? null);
    self.postMessage({ id, spot: snapshot(current) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
