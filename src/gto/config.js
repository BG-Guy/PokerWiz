// Switches for the GTO engine.

// Player reads (profiles: tendencies, skill levels, tilt). The engine supports them (gto/players: a read
// player plays their tendency and everyone else answers it), and they're wired into the coach, Practice and
// replays. Off for now: everyone plays GTO and the read pickers stay hidden. Turning it on brings the pickers
// back in the recorder, the coach review and Practice, and the engine starts using the reads.
export const PLAYER_READS = false;
