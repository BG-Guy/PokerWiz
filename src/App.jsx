// Route table: maps each URL to its page, all rendered inside the shared app layout.
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout.jsx';
import Dashboard from './pages/Dashboard/Dashboard.jsx';
import HandReview from './pages/HandReview/HandReview.jsx';
import AddHand from './pages/AddHand/AddHand.jsx';
import LiveSession from './pages/LiveSession/LiveSession.jsx';
import GameHistory from './pages/GameHistory/GameHistory.jsx';
import Insights from './pages/Insights/Insights.jsx';
import Goals from './pages/Goals/Goals.jsx';
import Equity from './pages/Equity/Equity.jsx';
import Coach from './pages/Coach/Coach.jsx';
import HandHighlights from './pages/HandHighlights/HandHighlights.jsx';
import HandInsights from './pages/HandInsights/HandInsights.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {/* Hands: the list, highlights, hand insights, the step-by-step recorder, and one opened hand */}
        <Route path="hands" element={<HandReview />} />
        <Route path="hands/highlights" element={<HandHighlights />} />
        <Route path="hands/insights" element={<HandInsights />} />
        <Route path="hands/new" element={<AddHand />} />
        <Route path="hands/:handId" element={<HandReview />} />
        <Route path="session" element={<LiveSession />} />
        <Route path="history" element={<GameHistory />} />
        <Route path="insights" element={<Insights />} />
        <Route path="goals" element={<Goals />} />
        <Route path="equity" element={<Equity />} />
        <Route path="coach" element={<Coach />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
