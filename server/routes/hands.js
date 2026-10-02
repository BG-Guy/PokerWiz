// /api/hands: list, read, create, edit, re-record and delete hand histories.
import { Router } from 'express';
import * as Hands from '../models/hands.js';

export const handsRouter = Router();

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

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isCardList = (value, max) => Array.isArray(value) && value.length <= max && value.every((c) => /^[2-9TJQKA][shdc]$/.test(c));

// Checks the detail fields an edit may carry; returns an error message, or null when they are fine.
function invalidEdit(changes) {
  if (changes.title !== undefined && !String(changes.title).trim()) return 'A hand needs a title';
  if (changes.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(changes.date)) return 'Date must look like YYYY-MM-DD';
  if (changes.holeCards !== undefined && !(isCardList(changes.holeCards, 2) && changes.holeCards.length === 2)) return 'Pick both of your cards';
  if (changes.board !== undefined && !isCardList(changes.board, 5)) return 'The board has at most five cards';
  if (changes.potSize !== undefined && !(isNumber(changes.potSize) && changes.potSize >= 0)) return 'The pot must be zero or more';
  if (changes.result !== undefined && !isNumber(changes.result)) return 'The result must be a number';
  if (changes.tags !== undefined && !Array.isArray(changes.tags)) return 'Tags must be a list';
  const cards = [...(changes.holeCards ?? []), ...(changes.board ?? []), ...(changes.players ?? []).flatMap((p) => (p.role === 'hero' ? [] : p.cards ?? []))];
  if (new Set(cards).size !== cards.length) return 'The same card is used twice';
  return null;
}

// Edit a hand: review fields (verdict, notes, rating 0-5, tilt 1-5, coach score and reads)
// or its details (title, date, stakes, position, cards, board, pot, result, tags).
handsRouter.patch('/:id', (req, res) => {
  const changes = req.body ?? {};
  const problem = invalidEdit(changes);
  if (problem) return res.status(400).json({ error: problem });
  const hand = Hands.updateHand(req.params.id, changes);
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  res.json(hand);
});

// Replace a hand with a re-recorded version (same shape as a new hand).
handsRouter.put('/:id', (req, res) => {
  const next = req.body ?? {};
  if (!Array.isArray(next.holeCards) || !Array.isArray(next.streets)) {
    return res.status(400).json({ error: 'A hand needs hole cards and streets' });
  }
  const hand = Hands.replaceHand(req.params.id, next);
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  res.json(hand);
});

handsRouter.delete('/:id', (req, res) => {
  if (!Hands.findHand(req.params.id)) return res.status(404).json({ error: 'Hand not found' });
  Hands.deleteHand(req.params.id);
  res.status(204).end();
});
