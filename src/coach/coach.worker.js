// Web worker that runs the coach off the main thread (range tracking and equity sampling take a moment).
// Message in:  { id, record }   Message out: { id, report } or { id, error }
import { analyzeHand } from './analyzeHand.js';

self.onmessage = (event) => {
  const { id, record } = event.data;
  try {
    self.postMessage({ id, report: analyzeHand(record) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
