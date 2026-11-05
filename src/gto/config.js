// Switches for the GTO engine.

// Player reads (profiles: tendencies, skill levels, tilt). The engine supports them (gto/players: a read
// player plays their tendency and everyone else answers it), and they're wired into the coach, Practice and
// replays. On: the pickers are in the recorder, the coach review and Practice, and the engine uses the reads
// that are set. A player with no read (the default) plays GTO, so nothing changes until you set one. Turning
// it off hides the pickers and makes everyone play GTO again.
export const PLAYER_READS = true;
