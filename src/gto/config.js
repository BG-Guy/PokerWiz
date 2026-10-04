// Switches for the GTO engine.

// Player reads (profiles: tendencies, skill levels, tilt) are still recorded with hands, but the engine doesn't
// use them yet: everyone is assumed to play GTO. Once reads are wired into the engine (see hand.js), turning
// this on brings the read pickers back in the recorder, the coach review and Practice.
export const PLAYER_READS = false;
