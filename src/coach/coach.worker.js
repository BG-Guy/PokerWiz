// Web worker that runs the coach off the main thread (GTO solves take a few seconds per street).
// Message in:  { id, record, unit, detail?, preflopOnly? }
// Messages out: { id, progress } while it works, then { id, report } or { id, error }.
// unit = the BB/$ display unit, so option labels and notes match the rest of the app.
// preflopOnly = grade the preflop decisions only (instant), for a first look at many hands.
import '../gto/chartUrls.js';
import { analyzeHand } from './analyzeHand.js';
import { setMoneyUnit } from '../utils/format.js';

self.onmessage = async (event) => {
  const { id, record, unit, detail, preflopOnly } = event.data;
  setMoneyUnit(unit);
  try {
    const report = await analyzeHand(record, { detail, preflopOnly, onProgress: (progress) => self.postMessage({ id, progress }) });
    self.postMessage({ id, report });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
