// /api/hands: list, read, create and update (review fields) hand histories.
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

// Change verdict, notes, title, tags, rating (0-5), tilt (1-5), or the coach's score and reads.
handsRouter.patch('/:id', (req, res) => {
  const hand = Hands.updateHand(req.params.id, req.body ?? {});
  if (!hand) return res.status(404).json({ error: 'Hand not found' });
  res.json(hand);
});
