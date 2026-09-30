// Web worker that runs the coach off the main thread (range tracking and equity sampling take a moment).
// Message in:  { id, record, unit }   Message out: { id, report } or { id, error }
// unit = the BB/$ display unit, so option labels and notes match the rest of the app.
import { analyzeHand } from './analyzeHand.js';
import { setMoneyUnit } from '../utils/format.js';

self.onmessage = (event) => {
  const { id, record, unit } = event.data;
  setMoneyUnit(unit);
  try {
    self.postMessage({ id, report: analyzeHand(record) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
