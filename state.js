// =====================================================
// PITCH ROYALE — state, palette, field constants
// Geladen als eerste van de 5 scripts. Geen externe deps.
// =====================================================

// Cache-bust marker: bump GAME_BUILD on every change so we can verify
// the live site is actually serving the latest code. If this string
// doesn't show up in DevTools console after a refresh, the browser /
// GitHub Pages CDN is still serving an older cached copy.
const GAME_BUILD = 'v59-solid-net-panels (2026-05-07)';
console.log(`%c[GAME] build: ${GAME_BUILD}`,
    'background:#16a34a;color:#000;font-weight:bold;padding:3px 8px;border-radius:3px');

// ----------- state -----------
const STATE = {
    screen: 'loading',         // loading | launch | setup | coin | playing | over
    mode: 'duo',               // duo (Hot-Seat) | cpu
    p1: { name: 'Speler 1', team: 1 },   // team: 1 = red, 2 = blue
    p2: { name: 'Speler 2', team: 2 },
    callerSide: 'p1',          // who calls heads/tails
    kickoffTeam: 1,
    score1: 0,
    score2: 0,
    gameDuration: 90,          // seconds
    gameStartTime: null,
    inputLocked: true,         // unlocked after kickoff countdown
    scoring: false,            // true during the goal-celebration freeze
    paused: false,             // true while the pause overlay is up
};

// ----------- in-game color palette (Stadium Nightfall) -----------
const COLORS = {
    pitch:        0x0e6a3a,
    pitchDark:    0x094f29,
    line:         0xe7e2d2,
    ground:       0x080a14,
    team1:        0xe0203a,    // crimson
    team1Hot:     0xff5b6e,
    team2:        0x1f5dff,    // cobalt
    team2Hot:     0x6da4ff,
    skin:         0xe2c39a,
    keeperBand:   0xf0c14a,
    skyTop:       0x000000,
    skyMid:       0x040406,
    skyBottom:    0x000000,
    fogColor:     0x000000,
};

// ----------- field constants -----------
const FIELD_W = 110;
const FIELD_L = 70;
// v56 — goal-afmetingen schaalden niet met de echte football proportions:
// real-world goal is 7.32m × 2.44m op 105m pitch (≈7% breed, 2.3% hoog,
// W:H = 3:1). Onze 22 × 10 was 20% breed, 9% hoog, 2.2:1 — voelde als
// American-football posts. Nu 10 × 3 (≈9% × 2.7%, ratio 3.3:1) — echte
// football proporties met een arcade-iets-ruimere goal-mond.
const GOAL_W = 10;
const GOAL_H = 3;
const PLAYER_SIZE = 3.4;
const BALL_SIZE = 1.05;

// v42/v44 — playable area voor field players is veel strakker dan
// FIELD_W × FIELD_L. Bij Etihad zit het zichtbare doel-gebied (in de
// GLB gebakken) duidelijk binnen de pitch-bounding-box, en de gebruiker
// wil dat de veldspeler stopt waar het doel zichtbaar is — niet door-
// loopt naar de hoek van het zichtbare gras (zie 7.png — rode poppetje
// = de stop-positie). Keeper-clamps blijven op FIELD_W/2 (zij wonen
// per definitie op de doellijn) en ball-scoring blijft op FIELD_W/2.
// v49 — bounds gefinetuned op de zichtbare Etihad-pitch: x ±42 / z ±25
// houdt de speler binnen het groen, ver weg van de run-off strook en de
// tribunes, terwijl 'ie wel tot voorbij de keeper (±41) kan komen om te
// scoren. Keepers zijn ook 1.4× groter geschaald in buildPlayers zodat
// ze duidelijk zichtbaar blijven.
const PLAY_BOUND_X = 42;               // ±42
const PLAY_BOUND_Z = 25;               // ±25

// v55 — Goal line X. Default = FIELD_W/2 (procedurele arena), wordt
// per stadion overschreven bij stadium-load via setGoalLineX(). Alle
// scoring / wall-bounce / keeper / AI-logica leest deze waarde i.p.v.
// hardcoded FIELD_W/2 — zodat een GLB met smaller zichtbaar veld
// (zoals Etihad, visuele rand op ±42) consistent is.
let GOAL_LINE_X = FIELD_W / 2;
function setGoalLineX(x) { GOAL_LINE_X = x; }

// Clamp a player to the playable rectangle. Field players use the
// shrunken PLAY_BOUND area (zichtbare Etihad-gras); keepers krijgen de
// volle FIELD_W/L want zij wonen op de doellijn (een aparte hard clamp
// in updateKeeper houdt ze in hun goal-box). Eén bron voor alle clamp-
// callsites — geen duplicate Math.max/min meer.
function clampPlayerToBounds(player) {
    const isKeeper = !!player.isKeeper;
    const bX = isKeeper ? FIELD_W/2 : PLAY_BOUND_X;
    const bZ = isKeeper ? FIELD_L/2 : PLAY_BOUND_Z;
    const r  = PLAYER_SIZE / 2;
    player.position.x = Math.max(-bX + r, Math.min(bX - r, player.position.x));
    player.position.z = Math.max(-bZ + r, Math.min(bZ - r, player.position.z));
}
