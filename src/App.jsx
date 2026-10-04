// Route table: maps each URL to its page, all rendered inside the shared app layout.
// The heavier pages (the GTO coach and practice, equity, re-recording a hand) load on first visit.
import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useUnit } from './theme/UnitContext.jsx';
import AppLayout from './components/AppLayout/AppLayout.jsx';
import Dashboard from './pages/Dashboard/Dashboard.jsx';
import HandReview from './pages/HandReview/HandReview.jsx';
import AddHand from './pages/AddHand/AddHand.jsx';
import LiveSession from './pages/LiveSession/LiveSession.jsx';
import GameHistory from './pages/GameHistory/GameHistory.jsx';
import Insights from './pages/Insights/Insights.jsx';
import Goals from './pages/Goals/Goals.jsx';
import Profile from './pages/Profile/Profile.jsx';
import HandHighlights from './pages/HandHighlights/HandHighlights.jsx';
import HandInsights from './pages/HandInsights/HandInsights.jsx';

const EditHand = lazy(() => import('./pages/EditHand/EditHand.jsx'));
const Equity = lazy(() => import('./pages/Equity/Equity.jsx'));
const Coach = lazy(() => import('./pages/Coach/Coach.jsx'));
const Practice = lazy(() => import('./pages/Practice/Practice.jsx'));

export default function App() {
  // Re-render every page when the BB/$ switch changes (amounts are formatted during render).
  useUnit();
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {/* Hands: the list, highlights, hand insights, the step-by-step recorder, one opened hand, and its action re-recorded */}
        <Route path="hands" element={<HandReview />} />
        <Route path="hands/highlights" element={<HandHighlights />} />
        <Route path="hands/insights" element={<HandInsights />} />
        <Route path="hands/new" element={<AddHand />} />
        <Route path="hands/:handId" element={<HandReview />} />
        <Route path="hands/:handId/edit" element={<EditHand />} />
        <Route path="session" element={<LiveSession />} />
        <Route path="history" element={<GameHistory />} />
        <Route path="insights" element={<Insights />} />
        <Route path="goals" element={<Goals />} />
        <Route path="equity" element={<Equity />} />
        <Route path="coach" element={<Coach />} />
        <Route path="practice" element={<Practice />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
