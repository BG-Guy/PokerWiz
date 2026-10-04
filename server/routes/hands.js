// /api/hands: list, read, create, edit and delete hand histories.
import { Router } from 'express';
import * as Hands from '../models/hands.js';

export const handsRouter = Router();

const CARD = /^[2-9TJQKA][shdc]$/;
const isCardList = (value, max) => Array.isArray(value) && value.length <= max && value.every((code) => CARD.test(code));
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// What's wrong with a set of changes to a hand, or null (only the fields present are checked).
function editProblem(changes) {
  if (!changes || typeof changes !== 'object') return 'No changes sent';
  if (changes.title !== undefined && (typeof changes.title !== 'string' || !changes.title.trim() || changes.title.length > 200)) {
    return 'A hand needs a title (up to 200 characters)';
  }
  if (changes.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(changes.date)) return 'The date must look like 2026-10-04';
  if (changes.holeCards !== undefined && !(isCardList(changes.holeCards, 2) && changes.holeCards.length === 2)) return 'Your hand needs two cards';
  if (changes.board !== undefined && !isCardList(changes.board, 5)) return 'The board has up to five cards';
  const cards = [...(changes.holeCards ?? []), ...(changes.board ?? [])];
  if (new Set(cards).size !== cards.length) return 'The same card is used twice';
  for (const key of ['potSize', 'result']) if (changes[key] !== undefined && !isNumber(changes[key])) return `The ${key === 'potSize' ? 'pot' : 'result'} must be a number`;
  if (changes.potSize !== undefined && changes.potSize < 0) return 'The pot can’t be negative';
  if (changes.rating != null && (!isNumber(changes.rating) || changes.rating < 0 || changes.rating > 5)) return 'Rating must be between 0 and 5';
  if (changes.tilt != null && (!Number.isInteger(changes.tilt) || changes.tilt < 1 || changes.tilt > 5)) return 'Tilt must be 1 to 5';
  if (changes.tags !== undefined && !(Array.isArray(changes.tags) && changes.tags.every((tag) => typeof tag === 'string' && tag.length <= 40))) {
    return 'Tags must be short words';
  }
  if (changes.streets !== undefined && !Array.isArray(changes.streets)) return 'Invalid action log';
  if (changes.players !== undefined && !Array.isArray(changes.players)) return 'Invalid players';
  return null;
}

handsRouter.get('/', (req, res) => {
  res.json(Hands.listHands());
});

handsRouter.get('/:id', (req, res) => {
  const hand = Hands.findHand(req.params.id);
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  res.json(hand);
});

// Save a hand recorded in the Add Hand flow.
handsRouter.post('/', (req, res) => {
  const hand = req.body ?? {};
  if (!hand.title || !Array.isArray(hand.holeCards) || !Array.isArray(hand.streets)) {
    return res.status(400).json({ error: 'A hand needs a title, hole cards and streets' });
  }
  res.status(201).json(Hands.createHand(hand));
});

// Edit a hand: the review (verdict, notes, rating 0-5, tilt 1-5, tags), the coach's score and reads, or the
// hand itself (title, date, stakes, cards, board, pot, result, and a re-recorded action).
handsRouter.patch('/:id', (req, res) => {
  const problem = editProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const hand = Hands.updateHand(req.params.id, req.body);
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  res.json(hand);
});

// Delete a hand (and its entry on a session timeline).
handsRouter.delete('/:id', (req, res) => {
  if (!Hands.deleteHand(req.params.id)) return res.status(404).json({ error: 'Hand not found' });
  res.status(204).end();
});
