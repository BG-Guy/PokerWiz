// Settings endpoints (server/routes/settings.js): your profile, app preferences and saved custom stakes.
import { request } from './client.js';

// Every setting: { name, nickname, homeCasino, usualStakes, favoriteGame, playingSince, buyInDepth, customStakes }.
export const getSettings = () => request('/settings');

// Change some of them ({ key: value }; null clears one). Replies every setting.
export const updateSettings = (changes) => request('/settings', { method: 'PATCH', body: changes });
