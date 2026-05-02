// =====================================================
// PITCH ROYALE — Stadium Nightfall
// Local 2-player football game
// =====================================================

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
    skyTop:       0x05070d,
    skyMid:       0x111935,
    skyBottom:    0x223060,
    fogColor:     0x05070d,
};

// ----------- field constants -----------
const FIELD_W = 110;
const FIELD_L = 70;
const GOAL_W = 22;
const GOAL_H = 10;
const PLAYER_SIZE = 5;
const BALL_SIZE = 1.5;

// ----------- stadium catalog -----------
// Voeg je eigen stadions toe: drop een .glb in media/stadiums/ (of media/models/),
// kopieer een entry hieronder en pas de waarden aan. De `id` is uniek en wordt
// in localStorage opgeslagen — hergebruik nooit een id van een stadion dat al
// eerder is uitgekozen door iemand anders, anders krijgen ze een ander stadion
// dan ze hadden gekozen.
//
//   id          — slug, uniek, wordt in localStorage gezet
//   name        — display naam (Anton-cap)
//   sub         — kleine subtitle op de kaart (mono, ALL CAPS)
//   tagline     — sfeerregel onder de naam
//   file        — pad naar .glb (of null = procedureel veld zonder model)
//   accent      — accent-kleur voor kaart-glow + dot
//   capacity    — vrije tekst (vb '60.000', 'INTIEM', 'TBD')
//   mood        — vrije tekst (vb 'NACHT', 'AVONDLICHT')
//   silhouette  — 'bowl' | 'rect' | 'classic'  (welke kaart-illustratie)
//
// Optionele tuning-velden (default = 1.0 of 0):
//   scaleMul    — multiplier op de auto-fit schaal (kleiner = stadion dichter
//                 om het veld; groter = stadion verder weg)
//   offsetY     — handmatige y-verschuiving in scene units (positief = stadion
//                 omhoog, negatief = omlaag). Gebruik om interne pitch-hoogte
//                 te laten matchen met y=0
//   colorScale  — multiplier op alle base/emissive kleuren (vb 0.55 = ~half
//                 zo licht). Goed voor day-textures die je als nacht wil
//   rotateY     — extra y-rotatie in radians (vb Math.PI/2) als de pitch in
//                 het model 90° gedraaid staat
const STADIUMS = [
    {
        id: 'arena-nocturne',
        name: 'Arena Nocturne',
        sub: 'HOMETURF · MIDNIGHT',
        tagline: 'Het hart van Pitch Royale.',
        file: 'media/models/arena.glb',
        accent: '#22c55e',
        capacity: '60.000',
        mood: 'NACHT',
        silhouette: 'bowl',
    },
    {
        id: 'camp-nou',
        name: 'Camp Nou',
        sub: 'AWAY · BLAUGRANA',
        tagline: 'Honderdduizend zielen, één gezang.',
        file: 'media/models/stadiums/camp_nou_stadium.glb',
        accent: '#a50044',
        capacity: '99.354',
        mood: 'AVOND',
        silhouette: 'bowl',
        // tuning — daylight-baked textures; dim ~50% to match night atmosphere
        // and shrink slightly so the model's interior pitch lines up with FIELD_W
        scaleMul: 0.78,
        colorScale: 0.55,
        offsetY: 0,
    },
    // ↓ Voeg hier nieuwe stadions toe ↓
];

const STADIUM_STORAGE_KEY = 'pitchRoyale.stadium';
function getSelectedStadium() {
    let id = null;
    try { id = localStorage.getItem(STADIUM_STORAGE_KEY); } catch (_) {}
    return STADIUMS.find(s => s.id === id) || STADIUMS[0];
}
function setSelectedStadium(id) {
    if (!STADIUMS.find(s => s.id === id)) return;
    try { localStorage.setItem(STADIUM_STORAGE_KEY, id); } catch (_) {}
}

// ----------- DOM helpers -----------
const $ = (id) => document.getElementById(id);
const screens = ['loading-screen','launch-screen','setup-screen','coin-screen','game-screen','over-screen','stadium-screen'];
const SCREEN_TO_DOM = {
    loading: 'loading-screen',
    launch:  'launch-screen',
    setup:   'setup-screen',
    coin:    'coin-screen',
    playing: 'game-screen',
    over:    'over-screen',
    stadium: 'stadium-screen',
};
function showScreen(id) {
    screens.forEach(s => $(s)?.classList.toggle('active', s === id));
}

// History-API navigation. Each forward call pushes a state so the browser
// back button can walk back through screens.
function gotoScreen(target, { replace = false } = {}) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
    const stateObj = { screen: target };
    const url = '#' + target;
    if (replace) history.replaceState(stateObj, '', url);
    else         history.pushState(stateObj, '', url);
}

function navigateToFromPopState(target) {
    if (STATE.screen === 'playing' && target !== 'playing') teardownGame();
    STATE.screen = target;
    showScreen(SCREEN_TO_DOM[target] || (target + '-screen'));
}

// ----------- screen flow -----------
document.addEventListener('DOMContentLoaded', () => {
    bindLaunch();
    bindSetup();
    bindCoin();
    bindOver();
    bindPause();
    bindStadium();
    updateLaunchStadiumLabel();
    window.addEventListener('keydown', (e) => {
        if (STATE.screen === 'launch' && (e.code === 'Space' || e.code === 'Enter')) {
            goToSetup();
        }
    });

    // loading screen → launch after the rolling-ball animation has played a full cycle
    setTimeout(() => {
        if (STATE.screen === 'loading') {
            // 'launch' becomes the base history state — pressing back from any
            // future screen eventually lands here, then exits the page.
            gotoScreen('launch', { replace: true });
        }
    }, 2200);

    // initial history entry so popstate has somewhere to land
    history.replaceState({ screen: 'loading' }, '', '');

    // browser back / forward → navigate to the recorded screen
    window.addEventListener('popstate', (e) => {
        const target = (e.state && e.state.screen) || 'launch';
        navigateToFromPopState(target);
    });
});

// ----------- LAUNCH -----------
function bindLaunch() {
    // the entire poster is one big call-to-action — click anywhere to enter…
    $('launch-screen').addEventListener('click', () => {
        if (STATE.screen === 'launch') goToSetup();
    });
    // …except clicks on the Stadion meta-block, which open the picker instead
    const pick = $('launch-stadium-pick');
    pick?.addEventListener('click', (e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        openStadiumPicker();
    });
}
function updateLaunchStadiumLabel() {
    const lbl = $('launch-stadium-name');
    if (lbl) lbl.textContent = getSelectedStadium().name;
}
function goToSetup() {
    gotoScreen('setup');
}

// ----------- STADIUM PICKER -----------
let stadiumPickerIdx = 0;

function bindStadium() {
    const prev    = $('stadium-prev');
    const next    = $('stadium-next');
    const back    = $('stadium-back');
    const confirm = $('stadium-confirm');

    prev?.addEventListener('click',    (e) => { e.currentTarget.blur(); navigateStadium(-1); });
    next?.addEventListener('click',    (e) => { e.currentTarget.blur(); navigateStadium(+1); });
    back?.addEventListener('click',    (e) => { e.currentTarget.blur(); history.back(); });
    confirm?.addEventListener('click', (e) => {
        e.currentTarget.blur();
        const stadium = STADIUMS[stadiumPickerIdx];
        if (stadium) {
            setSelectedStadium(stadium.id);
            updateLaunchStadiumLabel();
        }
        history.back();
    });

    // keyboard nav, scoped to the picker screen
    document.addEventListener('keydown', (e) => {
        if (STATE.screen !== 'stadium') return;
        if (e.code === 'ArrowLeft')                       { e.preventDefault(); navigateStadium(-1); }
        else if (e.code === 'ArrowRight')                 { e.preventDefault(); navigateStadium(+1); }
        else if (e.code === 'Enter' || e.code === 'Space'){ e.preventDefault(); confirm?.click(); }
        else if (e.code === 'Escape')                     { e.preventDefault(); history.back(); }
    });
}

function openStadiumPicker() {
    const sel = getSelectedStadium();
    stadiumPickerIdx = STADIUMS.findIndex(s => s.id === sel.id);
    if (stadiumPickerIdx < 0) stadiumPickerIdx = 0;
    renderStadiumCard(stadiumPickerIdx, 0);
    renderStadiumDots();
    refreshStadiumArrows();
    gotoScreen('stadium');
}

function navigateStadium(delta) {
    if (STADIUMS.length <= 1) return;
    stadiumPickerIdx = (stadiumPickerIdx + delta + STADIUMS.length) % STADIUMS.length;
    renderStadiumCard(stadiumPickerIdx, delta);
    renderStadiumDots();
}

function refreshStadiumArrows() {
    const single = STADIUMS.length <= 1;
    const prev = $('stadium-prev');
    const next = $('stadium-next');
    if (prev) prev.disabled = single;
    if (next) next.disabled = single;
}

function renderStadiumDots() {
    const dots = $('stadium-dots');
    if (!dots) return;
    dots.innerHTML = STADIUMS.map((s, i) =>
        `<button class="stadium-dot${i === stadiumPickerIdx ? ' is-active' : ''}" `
        + `data-idx="${i}" aria-label="${s.name}" style="--accent-card: ${s.accent};"></button>`
    ).join('');
    dots.querySelectorAll('.stadium-dot').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const idx = parseInt(btn.dataset.idx, 10);
            const dir = idx > stadiumPickerIdx ? 1 : -1;
            stadiumPickerIdx = idx;
            renderStadiumCard(stadiumPickerIdx, dir);
            renderStadiumDots();
        });
    });
}

function renderStadiumCard(idx, dir) {
    const card = $('stadium-card');
    if (!card) return;
    const stadium = STADIUMS[idx];
    const selectedId = getSelectedStadium().id;
    const isCurrent  = stadium.id === selectedId;

    card.style.setProperty('--accent-card', stadium.accent);
    card.dataset.silhouette = stadium.silhouette || 'bowl';
    card.classList.toggle('is-selected', isCurrent);

    card.innerHTML = `
        <div class="stadium-card__chrome">
            <span class="stadium-card__tag">${isCurrent ? 'GESELECTEERD' : 'OPTIE'}</span>
            <span class="stadium-card__num tabular">${String(idx+1).padStart(2,'0')} / ${String(STADIUMS.length).padStart(2,'0')}</span>
        </div>
        <div class="stadium-card__art">${stadiumSilhouetteSVG(stadium)}</div>
        <div class="stadium-card__sub">${stadium.sub}</div>
        <h3 class="stadium-card__name">${stadium.name}</h3>
        <p class="stadium-card__tagline">${stadium.tagline}</p>
        <div class="stadium-card__stats">
            <div><span class="k">Capaciteit</span><span class="v tabular">${stadium.capacity}</span></div>
            <div><span class="k">Sfeer</span><span class="v">${stadium.mood}</span></div>
            <div><span class="k">Type</span><span class="v">${(stadium.silhouette || 'bowl').toUpperCase()}</span></div>
        </div>
    `;

    // re-trigger slide animation
    card.classList.remove('slide-from-left', 'slide-from-right');
    void card.offsetWidth;
    if (dir > 0)      card.classList.add('slide-from-right');
    else if (dir < 0) card.classList.add('slide-from-left');
}

function stadiumSilhouetteSVG(stadium) {
    const acc = stadium.accent;
    const sil = stadium.silhouette || 'bowl';
    const initial = (stadium.name[0] || 'A').toUpperCase();
    const gradId = `silTurf-${stadium.id}`;

    // outer shell varies by silhouette type
    let shell;
    if (sil === 'rect') {
        shell = `<path d="M 30 165 L 30 105 L 330 105 L 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    } else if (sil === 'classic') {
        shell = `<path d="M 30 165 Q 30 95 180 88 Q 330 95 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    } else { // bowl
        shell = `<path d="M 30 165 Q 30 110 90 110 L 270 110 Q 330 110 330 165 Z"
                       fill="rgba(255,255,255,0.04)" stroke="${acc}" stroke-width="1.6" opacity="0.9"/>`;
    }

    return `
    <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="${acc}" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="${acc}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <ellipse cx="180" cy="65" rx="170" ry="42" fill="url(#${gradId})"/>
        ${shell}
        <ellipse cx="180" cy="142" rx="120" ry="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
        <line x1="180" y1="122" x2="180" y2="162" stroke="rgba(255,255,255,0.22)" stroke-width="0.9"/>
        <ellipse cx="180" cy="142" rx="14" ry="4.5" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.9"/>
        <g stroke="${acc}" stroke-width="1.4" opacity="0.9">
            <line x1="50"  y1="105" x2="50"  y2="55"/>
            <line x1="310" y1="105" x2="310" y2="55"/>
            <circle cx="50"  cy="50" r="6" fill="${acc}"/>
            <circle cx="310" cy="50" r="6" fill="${acc}"/>
        </g>
        <text x="180" y="84" text-anchor="middle"
              fill="${acc}" opacity="0.16"
              style="font-family: Anton, Impact, sans-serif; font-size: 80px; letter-spacing: -3px;">${initial}</text>
    </svg>`;
}

// ----------- SETUP -----------
function bindSetup() {
    const p1Input = $('p1-name');
    const p2Input = $('p2-name');
    const submit = $('to-coin');

    const refreshSubmit = () => {
        const p1ok = p1Input.value.trim().length >= 2;
        const p2ok = STATE.mode === 'cpu' || p2Input.value.trim().length >= 2;
        submit.disabled = !(p1ok && p2ok);
    };
    // toggle a `has-value` class on the wrapper for browsers without :has()
    const reflectValue = (inp) => {
        const wrap = inp.closest('.field__wrap');
        if (wrap) wrap.classList.toggle('has-value', inp.value.length > 0);
    };
    [p1Input, p2Input].forEach(inp => {
        inp.addEventListener('input', () => { reflectValue(inp); refreshSubmit(); });
        reflectValue(inp);
    });

    // mode toggle ---------------------------------------
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const mode = btn.dataset.mode;
            STATE.mode = mode;
            document.querySelectorAll('.mode-tab').forEach(b => {
                const on = b.dataset.mode === mode;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            applyMode();
            refreshSubmit();
        });
    });

    // delete / clear buttons ----------------------------
    document.querySelectorAll('.field__clear').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const target = $(btn.dataset.target);
            if (!target) return;
            target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.focus();
        });
    });

    $('swap-teams').addEventListener('click', () => {
        const tmp = STATE.p1.team;
        STATE.p1.team = STATE.p2.team;
        STATE.p2.team = tmp;
        renderRosterColors();
    });

    submit.addEventListener('click', () => {
        STATE.p1.name = (p1Input.value.trim() || 'SPELER 1').toUpperCase().slice(0, 14);
        if (STATE.mode === 'cpu') {
            STATE.p2.name = 'CPU.NOCTURNE';
        } else {
            STATE.p2.name = (p2Input.value.trim() || 'SPELER 2').toUpperCase().slice(0, 14);
        }
        // CPU never wins the toss randomly — keep it human-friendly: human always calls
        STATE.callerSide = STATE.mode === 'cpu' ? 'p1' : (Math.random() < 0.5 ? 'p1' : 'p2');
        goToCoin();
    });
}

function applyMode() {
    const cpuCard = document.querySelector('.roster-card[data-slot="p2"]');
    const cpuPanel = cpuCard?.querySelector('.roster-card__cpu');
    const p2Field = cpuCard?.querySelector('.field');
    if (!cpuCard) return;

    if (STATE.mode === 'cpu') {
        cpuCard.classList.add('is-cpu');
        if (cpuPanel) cpuPanel.hidden = false;
        // also update the "Controls" meta line to read CPU
        const metaCtrl = cpuCard.querySelectorAll('.roster-card__meta .v')[1];
        if (metaCtrl) metaCtrl.textContent = 'AUTONOMOUS';
    } else {
        cpuCard.classList.remove('is-cpu');
        if (cpuPanel) cpuPanel.hidden = true;
        const metaCtrl = cpuCard.querySelectorAll('.roster-card__meta .v')[1];
        if (metaCtrl) metaCtrl.textContent = 'PIJLEN · ENTER';
    }
}

function renderRosterColors() {
    // re-skin the two cards to reflect current team assignments
    const cardP1 = document.querySelector('#setup-screen .roster-card:nth-of-type(1)');
    const cardP2 = document.querySelector('#setup-screen .roster-card:nth-of-type(3)');
    // p1 is always the LEFT card; just toggle red/blue class
    cardP1.classList.toggle('roster-card--red', STATE.p1.team === 1);
    cardP1.classList.toggle('roster-card--blue', STATE.p1.team === 2);
    cardP2.classList.toggle('roster-card--red', STATE.p2.team === 1);
    cardP2.classList.toggle('roster-card--blue', STATE.p2.team === 2);

    // update labels too
    const labelP1 = cardP1.querySelector('.roster-card__meta .v');
    const labelP2 = cardP2.querySelector('.roster-card__meta .v');
    if (labelP1) labelP1.textContent = STATE.p1.team === 1 ? 'Rood' : 'Blauw';
    if (labelP2) labelP2.textContent = STATE.p2.team === 1 ? 'Rood' : 'Blauw';

    const crestP1 = cardP1.querySelector('.roster-card__crest span');
    const crestP2 = cardP2.querySelector('.roster-card__crest span');
    if (crestP1) crestP1.textContent = STATE.p1.team === 1 ? 'R' : 'B';
    if (crestP2) crestP2.textContent = STATE.p2.team === 1 ? 'R' : 'B';

    const tagP1 = cardP1.querySelector('.roster-card__tag');
    const tagP2 = cardP2.querySelector('.roster-card__tag');
    if (tagP1) tagP1.textContent = STATE.p1.team === 1 ? 'THUIS' : 'UIT';
    if (tagP2) tagP2.textContent = STATE.p2.team === 1 ? 'THUIS' : 'UIT';
}

// ----------- COIN -----------
function bindCoin() {
    $('pick-heads').addEventListener('click', () => callCoin('heads'));
    $('pick-tails').addEventListener('click', () => callCoin('tails'));
    $('kickoff-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startGame(); });
}

function goToCoin() {
    // reset coin UI
    const callerEl = $('coin-caller-name');
    callerEl.textContent = STATE.callerSide === 'p1' ? STATE.p1.name : STATE.p2.name;

    const coin = $('coin3d');
    coin.classList.remove('flipping','land-heads','land-tails');
    coin.style.removeProperty('--final-rot');
    $('coin-result').classList.remove('show');
    $('coin-result').querySelector('.coin-result__line').textContent = '';
    $('coin-result').querySelector('.coin-result__text').textContent = '';
    $('kickoff-btn').hidden = true;
    document.querySelectorAll('.pick-btn').forEach(b => {
        b.disabled = false;
        b.classList.remove('chosen');
    });

    gotoScreen('coin');
}

function tossCoin() {
    // Use crypto when available — every flip is a fresh, unbiased bit.
    if (window.crypto && window.crypto.getRandomValues) {
        const buf = new Uint8Array(1);
        window.crypto.getRandomValues(buf);
        return (buf[0] & 1) === 0 ? 'heads' : 'tails';
    }
    return Math.random() < 0.5 ? 'heads' : 'tails';
}

function callCoin(choice) {
    const result = tossCoin();
    const won = choice === result;

    const buttons = document.querySelectorAll('.pick-btn');
    buttons.forEach(b => b.disabled = true);
    document.getElementById(choice === 'heads' ? 'pick-heads' : 'pick-tails').classList.add('chosen');

    const coin = $('coin3d');
    coin.style.setProperty('--final-rot', result === 'heads' ? '3600deg' : '3780deg');
    coin.classList.add('flipping');

    setTimeout(() => {
        coin.classList.remove('flipping');
        coin.classList.add(result === 'heads' ? 'land-heads' : 'land-tails');

        const resultEl = $('coin-result');
        const callerName = STATE.callerSide === 'p1' ? STATE.p1.name : STATE.p2.name;
        const otherName  = STATE.callerSide === 'p1' ? STATE.p2.name : STATE.p1.name;
        const winnerName = won ? callerName : otherName;
        const choiceLabel = choice === 'heads' ? 'KOP' : 'MUNT';
        const resultLabel = result === 'heads' ? 'KOP' : 'MUNT';

        resultEl.querySelector('.coin-result__line').textContent =
            `JIJ KOOS ${choiceLabel} · UITKOMST ${resultLabel}`;
        resultEl.querySelector('.coin-result__text').textContent =
            `${winnerName} krijgt de aftrap`;
        resultEl.classList.add('show');

        if (won) {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p1.team : STATE.p2.team;
        } else {
            STATE.kickoffTeam = STATE.callerSide === 'p1' ? STATE.p2.team : STATE.p1.team;
        }

        $('kickoff-btn').hidden = false;
    }, 3000);
}

// ----------- GAME OVER -----------
function bindOver() {
    $('play-again').addEventListener('click', (e) => {
        e.currentTarget.blur();
        teardownGame();
        STATE.score1 = 0; STATE.score2 = 0;
        STATE.callerSide = STATE.mode === 'cpu' ? 'p1' : (Math.random() < 0.5 ? 'p1' : 'p2');
        goToCoin();
    });
    $('back-home').addEventListener('click', (e) => {
        e.currentTarget.blur();
        teardownGame();
        STATE.score1 = 0; STATE.score2 = 0;
        // collapse the history stack — going back from launch leaves the page
        gotoScreen('launch', { replace: true });
    });
}

// =====================================================
// THREE.JS GAME
// =====================================================
let scene, camera, renderer, animationId;
let team1Players = [], team2Players = [];
let ball;
let controlledP1, controlledP2;     // human-controlled veldspelers
const keys = {};

function startGame() {
    STATE.paused = false;
    gotoScreen('playing');

    // hud names + colors
    paintHud();

    initThree();
    runKickoffCountdown(() => {
        STATE.gameStartTime = Date.now();
        STATE.inputLocked = false;
    });
}

// ----------- pause -----------
let pauseFreezeStart = 0;
function togglePause(force) {
    if (STATE.screen !== 'playing') return;
    const next = (force === undefined) ? !STATE.paused : !!force;
    if (next === STATE.paused) return;

    STATE.paused = next;
    const overlay = $('pause-overlay');
    if (overlay) overlay.hidden = !next;

    if (next) {
        // remember when we paused so the game timer can be paused too
        pauseFreezeStart = Date.now();
        // wipe held keys so they don't auto-fire on resume
        clearAllKeys();
    } else {
        // shift the start time forward by the paused duration
        if (STATE.gameStartTime && pauseFreezeStart) {
            STATE.gameStartTime += (Date.now() - pauseFreezeStart);
        }
        pauseFreezeStart = 0;
    }
}

function bindPause() {
    const btn = $('pause-btn');
    if (btn) btn.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
    const resume = $('pause-resume');
    if (resume) resume.addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(false); });

    // P or ESC anywhere during play
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (STATE.screen !== 'playing') return;
        if (e.code === 'KeyP' || e.code === 'Escape') {
            e.preventDefault();
            togglePause();
        }
    });
}

function paintHud() {
    // HUD halves are visually fixed: red on the left, blue on the right.
    const redPlayer  = STATE.p1.team === 1 ? STATE.p1 : STATE.p2;
    const bluePlayer = STATE.p1.team === 2 ? STATE.p1 : STATE.p2;
    $('hud-p1-name').textContent = redPlayer.name;
    $('hud-p2-name').textContent = bluePlayer.name;

    // Controls hint
    if (STATE.mode === 'cpu') {
        // human always uses WASD/Pijlen + SPATIE; CPU has no controls
        $('hud-controls-p1').textContent = STATE.p1.name + ' · ' + (STATE.p1.team === 1 ? 'ROOD' : 'BLAUW');
        const p2Col = document.querySelector('.hud-controls__col--blue');
        if (p2Col) {
            p2Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p2">CPU.NOCTURNE · ${STATE.p2.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <span class="hud-controls__cpu-dot"></span>
                <span class="hud-controls__plus">AUTONOMOUS</span>
            `;
        }
        // also: in CPU mode, P1 may use either WASD or arrows -> reflect
        const p1Col = document.querySelector('.hud-controls__col--red');
        if (p1Col) {
            p1Col.innerHTML = `
                <span class="hud-controls__who" id="hud-controls-p1">${STATE.p1.name} · ${STATE.p1.team === 1 ? 'ROOD' : 'BLAUW'}</span>
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span class="hud-controls__or">/</span>
                <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
                <span class="hud-controls__plus">+</span>
                <kbd>SPATIE</kbd>
                <span class="hud-controls__hint">houd = harder · <kbd>Q</kbd>/<kbd>⇧</kbd> = pass / vraag</span>
            `;
        }
    } else {
        $('hud-controls-p1').textContent = STATE.p1.name + ' · ' + (STATE.p1.team === 1 ? 'ROOD' : 'BLAUW');
        $('hud-controls-p2').textContent = STATE.p2.name + ' · ' + (STATE.p2.team === 1 ? 'ROOD' : 'BLAUW');
    }
}

function initThree() {
    if (!scene) {
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(COLORS.fogColor, 130, 320);

        camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 800);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        // cap pixel ratio harder — Retina at 2× quadruples GPU work for marginal gain
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        $('game-screen').appendChild(renderer.domElement);

        window.addEventListener('resize', onResize);
        // capture: true so focused buttons / iframes can't swallow the keystroke first
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp, { capture: true });
        // if the window loses focus, drop all held keys so the player doesn't drift
        window.addEventListener('blur', clearAllKeys);
        // tab visibility flip ALSO clears, so a held arrow doesn't get stuck on
        // the way back from a switched tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) clearAllKeys();
        });
        // any time a button steals keyboard focus during play, blur it so arrow
        // keys + space go straight to the game instead of activating the button
        document.addEventListener('focusin', (e) => {
            if (STATE.screen !== 'playing') return;
            const tgt = e.target;
            if (tgt && tgt.tagName === 'BUTTON') tgt.blur();
        });
    }

    // clear previous scene contents
    while (scene.children.length) scene.remove(scene.children[0]);

    buildSky();
    buildLights();
    buildField();
    buildGoals();
    buildStadium();        // imports media/models/arena.glb
    buildPlayers();
    buildBall();
    positionForKickoff();

    // cinematic angle
    camera.position.set(0, 62, 88);
    camera.lookAt(0, 4, 0);

    // reset fixed-step bookkeeping
    physicsAccum = 0;
    lastFrameTime = 0;
    // wipe any stale held keys
    clearAllKeys();
    // sync the bot's perception to the real ball at kickoff
    resetBotPerception();

    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(animate);
}

function buildSky() {
    const skyGeo = new THREE.SphereGeometry(420, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            top:    { value: new THREE.Color(COLORS.skyTop) },
            mid:    { value: new THREE.Color(COLORS.skyMid) },
            bottom: { value: new THREE.Color(COLORS.skyBottom) },
        },
        vertexShader: `
            varying vec3 vPos;
            void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
            uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
            varying vec3 vPos;
            void main() {
                float h = normalize(vPos).y;
                vec3 col;
                if (h > 0.0) col = mix(mid, top, smoothstep(0.0, 0.7, h));
                else         col = mix(mid, bottom, smoothstep(0.0, 0.6, -h));
                // subtle starfield from a hashed noise — only in the upper half
                float s = fract(sin(dot(vPos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
                float star = step(0.9985, s) * smoothstep(0.0, 0.4, h);
                col += vec3(star) * 0.8;
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function buildLights() {
    scene.add(new THREE.AmbientLight(0x4a557a, 0.45));

    // hemisphere wash — sky tint above, deep ground below
    const hemi = new THREE.HemisphereLight(0x6f7fb8, 0x10141f, 0.55);
    scene.add(hemi);

    // primary directional fill (replaces the harsher key)
    const fill = new THREE.DirectionalLight(0xc8d2ee, 0.35);
    fill.position.set(0, 120, 30);
    scene.add(fill);

    // four cinematic stadium spotlights at the corners
    const corners = [
        [ FIELD_W * 0.7,  90,  FIELD_L * 0.85],
        [-FIELD_W * 0.7,  90,  FIELD_L * 0.85],
        [ FIELD_W * 0.7,  90, -FIELD_L * 0.85],
        [-FIELD_W * 0.7,  90, -FIELD_L * 0.85],
    ];
    corners.forEach(([x, y, z], i) => {
        const spot = new THREE.SpotLight(0xfff7e0, 1.3, 260, Math.PI / 4.6, 0.45, 1.4);
        spot.position.set(x, y, z);
        spot.target.position.set(x * 0.15, 0, z * 0.15);
        // shadows on just one for perf
        if (i === 0) {
            spot.castShadow = true;
            spot.shadow.mapSize.width = 1024;
            spot.shadow.mapSize.height = 1024;
            spot.shadow.bias = -0.0003;
            spot.shadow.camera.near = 30;
            spot.shadow.camera.far = 280;
        }
        scene.add(spot);
        scene.add(spot.target);
    });

    // team-coloured rim lights behind each goal
    const redGlow = new THREE.PointLight(COLORS.team1Hot, 1.6, 80, 2.0);
    redGlow.position.set(-FIELD_W/2 - 4, 6, 0);
    scene.add(redGlow);

    const blueGlow = new THREE.PointLight(COLORS.team2Hot, 1.6, 80, 2.0);
    blueGlow.position.set(FIELD_W/2 + 4, 6, 0);
    scene.add(blueGlow);
}

function makeStripeTexture() {
    // higher-resolution canvas for crisper stripes + faint vertical wear marks
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const ctx = c.getContext('2d');
    const lit  = '#' + COLORS.pitch.toString(16).padStart(6, '0');
    const dark = '#' + COLORS.pitchDark.toString(16).padStart(6, '0');
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? lit : dark;
        ctx.fillRect(0, i * 32, 64, 32);
    }
    // subtle noise overlay
    const img = ctx.getImageData(0, 0, 64, 256);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        img.data[i]   = Math.max(0, Math.min(255, img.data[i]   + n));
        img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
        img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 7);
    tex.anisotropy = 4;
    return tex;
}

function buildField() {
    const stripe = makeStripeTexture();
    const fieldGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_L);
    const fieldMat = new THREE.MeshStandardMaterial({
        map: stripe,
        roughness: 0.92,
        metalness: 0.0,
        color: 0xffffff,
    });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    scene.add(field);

    // surrounding dark border (visual track)
    const borderGeo = new THREE.PlaneGeometry(FIELD_W + 36, FIELD_L + 30);
    const borderMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1.0 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = -0.05;
    border.receiveShadow = true;
    scene.add(border);

    // markings
    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.9 });
    const drawSegs = (pts) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        scene.add(new THREE.Line(g, lineMat));
    };

    // outer boundary
    drawSegs([
        new THREE.Vector3(-FIELD_W/2, 0.05, -FIELD_L/2),
        new THREE.Vector3( FIELD_W/2, 0.05, -FIELD_L/2),
        new THREE.Vector3( FIELD_W/2, 0.05,  FIELD_L/2),
        new THREE.Vector3(-FIELD_W/2, 0.05,  FIELD_L/2),
        new THREE.Vector3(-FIELD_W/2, 0.05, -FIELD_L/2),
    ]);
    // halfway line
    drawSegs([
        new THREE.Vector3(0, 0.05, -FIELD_L/2),
        new THREE.Vector3(0, 0.05,  FIELD_L/2),
    ]);
    // penalty boxes
    const PB_W = 22, PB_D = 14;
    [-1, 1].forEach(side => {
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05, -PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2),         0.05, -PB_W/2),
        ]);
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05,  PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2),         0.05,  PB_W/2),
        ]);
        drawSegs([
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05, -PB_W/2),
            new THREE.Vector3(side * (FIELD_W/2 - PB_D), 0.05,  PB_W/2),
        ]);
    });

    // center circle
    const ringGeo = new THREE.RingGeometry(9.6, 10, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.line, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);

    // center spot
    const spotGeo = new THREE.CircleGeometry(0.6, 24);
    const spot = new THREE.Mesh(spotGeo, ringMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.06;
    scene.add(spot);
}

function buildGoals() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.3 });
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });

    [-1, 1].forEach(side => {
        const x = side * FIELD_W / 2;
        // posts
        const postGeo = new THREE.CylinderGeometry(0.18, 0.18, GOAL_H, 12);
        const post1 = new THREE.Mesh(postGeo, postMat);
        post1.position.set(x, GOAL_H/2, -GOAL_W/2);
        post1.castShadow = true;
        scene.add(post1);

        const post2 = new THREE.Mesh(postGeo, postMat);
        post2.position.set(x, GOAL_H/2, GOAL_W/2);
        post2.castShadow = true;
        scene.add(post2);

        // crossbar
        const crossGeo = new THREE.CylinderGeometry(0.18, 0.18, GOAL_W, 12);
        const cross = new THREE.Mesh(crossGeo, postMat);
        cross.rotation.x = Math.PI / 2;
        cross.position.set(x, GOAL_H, 0);
        cross.castShadow = true;
        scene.add(cross);

        // back of goal — net mesh as line grid
        const depth = 5 * side; // points outward
        const netGroup = new THREE.Group();
        const cols = 9, rows = 6;
        for (let i = 0; i <= cols; i++) {
            const t = i / cols;
            const z = -GOAL_W/2 + t * GOAL_W;
            const pts = [
                new THREE.Vector3(x, 0, z),
                new THREE.Vector3(x, GOAL_H, z),
                new THREE.Vector3(x + depth, GOAL_H, z),
                new THREE.Vector3(x + depth, 0, z),
            ];
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            netGroup.add(new THREE.Line(g, netMat));
        }
        for (let j = 0; j <= rows; j++) {
            const t = j / rows;
            const y = t * GOAL_H;
            const pts = [
                new THREE.Vector3(x, y, -GOAL_W/2),
                new THREE.Vector3(x + depth, y, -GOAL_W/2),
                new THREE.Vector3(x + depth, y,  GOAL_W/2),
                new THREE.Vector3(x, y,  GOAL_W/2),
            ];
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            netGroup.add(new THREE.Line(g, netMat));
        }
        scene.add(netGroup);
    });
}

// ----------- stadium model -----------
let stadiumLoaded = false;
function buildStadium() {
    const stadium = getSelectedStadium();
    // procedural-only entry, or loader unavailable
    if (!stadium.file || typeof THREE.GLTFLoader !== 'function') {
        buildStadiumFallback();
        return;
    }

    // per-stadium tuning (defaults preserve the old behaviour for arena.glb)
    const scaleMul   = stadium.scaleMul   ?? 1.0;        // multiplies auto-fit
    const offsetY    = stadium.offsetY    ?? 0;          // lift / lower after fit
    const colorScale = stadium.colorScale ?? 1.0;        // <1 = darken textures
    const rotateY    = stadium.rotateY    ?? 0;          // radians, useful when pitch is rotated 90°

    const loader = new THREE.GLTFLoader();
    loader.load(
        stadium.file,
        (gltf) => {
            const arena = gltf.scene;
            arena.rotation.y = rotateY;

            // auto-fit: scale arena so its longest horizontal axis covers ~2.4× field width
            const bbox = new THREE.Box3().setFromObject(arena);
            const size = bbox.getSize(new THREE.Vector3());
            const targetSpan = FIELD_W * 2.4;
            const span = Math.max(size.x, size.z);
            const scale = (span > 0.01 ? targetSpan / span : 1) * scaleMul;
            arena.scale.setScalar(scale);

            // recenter & sit on the ground (with optional manual y nudge)
            const fitted = new THREE.Box3().setFromObject(arena);
            const center = fitted.getCenter(new THREE.Vector3());
            arena.position.x -= center.x;
            arena.position.z -= center.z;
            arena.position.y -= fitted.min.y;
            arena.position.y += offsetY;

            arena.traverse((c) => {
                if (c.isMesh) {
                    c.receiveShadow = true;
                    c.castShadow = false;
                    if (c.material) {
                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                        mats.forEach(m => {
                            // tame overly emissive baked-in lighting (sun, daylight)
                            if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = 0.4;
                            if (m.emissive && colorScale < 1) m.emissive.multiplyScalar(colorScale);
                            if (m.metalness !== undefined) m.metalness = Math.min(0.4, m.metalness);
                            // optionally darken base colors (good for daylight-textured imports)
                            if (colorScale < 1 && m.color) m.color.multiplyScalar(colorScale);
                        });
                    }
                }
            });

            arena.userData.tag = 'stadium';
            scene.add(arena);
            stadiumLoaded = true;
        },
        undefined,
        (err) => {
            console.warn(`stadium "${stadium.id}" (${stadium.file}) failed to load — falling back to procedural surroundings`, err);
            buildStadiumFallback();
        }
    );

    // always render the fallback bowl too — it sits below the imported model
    // so we always have *something* if the GLB is small/transparent in spots.
    buildStadiumFallback();
}

function buildStadiumFallback() {
    // a low concrete bowl + tribunes silhouette so the world doesn't feel empty
    const bowlGeo = new THREE.RingGeometry(FIELD_W * 0.85, FIELD_W * 1.6, 64, 1);
    const bowlMat = new THREE.MeshStandardMaterial({
        color: 0x171b2c,
        roughness: 1.0,
        metalness: 0.0,
    });
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.rotation.x = -Math.PI / 2;
    bowl.position.y = -0.04;
    bowl.receiveShadow = true;
    scene.add(bowl);

    // tribune silhouette as a low torus
    const tribGeo = new THREE.TorusGeometry(FIELD_W * 1.25, 8, 8, 80);
    const tribMat = new THREE.MeshStandardMaterial({
        color: 0x0d1020,
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true,
    });
    const tribune = new THREE.Mesh(tribGeo, tribMat);
    tribune.rotation.x = Math.PI / 2;
    tribune.position.y = 4;
    tribune.scale.set(1, 1, 0.55);
    scene.add(tribune);

    // four light pylons at the corners
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1a2240, metalness: 0.5, roughness: 0.6 });
    const pylonGeo = new THREE.CylinderGeometry(0.6, 0.9, 60, 8);
    [
        [ FIELD_W * 0.85,  FIELD_L * 0.95],
        [-FIELD_W * 0.85,  FIELD_L * 0.95],
        [ FIELD_W * 0.85, -FIELD_L * 0.95],
        [-FIELD_W * 0.85, -FIELD_L * 0.95],
    ].forEach(([x, z]) => {
        const py = new THREE.Mesh(pylonGeo, pylonMat);
        py.position.set(x, 30, z);
        scene.add(py);

        // lamp head
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(6, 1.5, 3),
            new THREE.MeshStandardMaterial({
                color: 0xfff7e0,
                emissive: 0xfff7e0,
                emissiveIntensity: 0.8,
                roughness: 0.5,
            })
        );
        head.position.set(x * 0.92, 60, z * 0.92);
        head.lookAt(0, 4, 0);
        scene.add(head);
    });
}

function makePlayer(color, isKeeper, controlled) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.2,
        roughness: 0.55,
        emissive: controlled ? color : 0x000000,
        emissiveIntensity: controlled ? 0.18 : 0,
    });
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(PLAYER_SIZE/2, PLAYER_SIZE/2 + 0.4, PLAYER_SIZE, 16),
        bodyMat
    );
    body.position.y = PLAYER_SIZE/2;
    body.castShadow = true;
    group.add(body);

    const headMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6, metalness: 0.05 });
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(PLAYER_SIZE * 0.35, 16, 12),
        headMat
    );
    head.position.y = PLAYER_SIZE + PLAYER_SIZE * 0.32;
    head.castShadow = true;
    group.add(head);

    // controlled-player ring under feet
    if (controlled) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.95, 32),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.08;
        group.userData.ring = ring;
        group.add(ring);
    }

    // keeper jersey marker — gold band
    if (isKeeper) {
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(PLAYER_SIZE/2 + 0.05, PLAYER_SIZE/2 + 0.45, 0.6, 16),
            new THREE.MeshStandardMaterial({ color: COLORS.keeperBand, metalness: 0.7, roughness: 0.3 })
        );
        band.position.y = PLAYER_SIZE * 0.7;
        group.add(band);
    }

    group.userData.isKeeper = isKeeper;
    return group;
}

function buildPlayers() {
    team1Players = [];
    team2Players = [];

    // determine which veldspeler is human-controlled per mode
    // Hot-Seat (duo): both veldspelers are human (P1 + P2)
    // CPU mode:       only P1 is human, the other team's veldspeler is the bot
    const isCpu = STATE.mode === 'cpu';

    // RED team
    const redKeeper = makePlayer(COLORS.team1, true, false);
    redKeeper.position.set(-FIELD_W/2 + 5, 0, 0);
    redKeeper.team = 1;
    redKeeper.isKeeper = true;
    redKeeper.homePosition = { x: -FIELD_W/2 + 5, z: 0 };
    scene.add(redKeeper);
    team1Players.push(redKeeper);

    // is this team's veldspeler human or bot?
    const redIsHuman = isCpu ? STATE.p1.team === 1 : true;
    const redField = makePlayer(COLORS.team1, false, redIsHuman);
    redField.position.set(-25, 0, 0);
    redField.team = 1;
    redField.isKeeper = false;
    redField.homePosition = { x: -25, z: 0 };
    redField.userData.isBot = !redIsHuman;
    scene.add(redField);
    team1Players.push(redField);

    // BLUE team
    const blueKeeper = makePlayer(COLORS.team2, true, false);
    blueKeeper.position.set(FIELD_W/2 - 5, 0, 0);
    blueKeeper.team = 2;
    blueKeeper.isKeeper = true;
    blueKeeper.homePosition = { x: FIELD_W/2 - 5, z: 0 };
    scene.add(blueKeeper);
    team2Players.push(blueKeeper);

    const blueIsHuman = isCpu ? STATE.p1.team === 2 : true;
    const blueField = makePlayer(COLORS.team2, false, blueIsHuman);
    blueField.position.set(25, 0, 0);
    blueField.team = 2;
    blueField.isKeeper = false;
    blueField.homePosition = { x: 25, z: 0 };
    blueField.userData.isBot = !blueIsHuman;
    scene.add(blueField);
    team2Players.push(blueField);

    // assign controllers
    controlledP1 = STATE.p1.team === 1 ? redField : blueField;
    if (isCpu) {
        controlledP2 = null; // bot drives the other team
    } else {
        controlledP2 = STATE.p2.team === 1 ? redField : blueField;
    }
}

function buildBall() {
    const geo = new THREE.SphereGeometry(BALL_SIZE, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.05,
        roughness: 0.4,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
    });
    ball = new THREE.Mesh(geo, mat);
    ball.position.set(0, BALL_SIZE, 0);
    ball.castShadow = true;
    ball.velocity = { x: 0, y: 0, z: 0 };
    scene.add(ball);
}

function positionForKickoff() {
    ball.position.set(0, BALL_SIZE, 0);
    ball.velocity = { x: 0, y: 0, z: 0 };

    // clear any in-flight keeper holds and player charges
    [...team1Players, ...team2Players].forEach(p => {
        p.userData.holdingBall = false;
        p.userData.holdStart = 0;
        p.userData.charging = false;
        p.userData.chargeStart = 0;
        p.userData.shootHeld = false;
    });

    // home positions
    team1Players[0].position.set(-FIELD_W/2 + 5, 0, 0);   // red keeper
    team2Players[0].position.set( FIELD_W/2 - 5, 0, 0);   // blue keeper

    if (STATE.kickoffTeam === 1) {
        team1Players[1].position.set(-3, 0, 0);
        team2Players[1].position.set( 18, 0, 0);
    } else {
        team1Players[1].position.set(-18, 0, 0);
        team2Players[1].position.set( 3, 0, 0);
    }
}

function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------- input -----------
// keys[]        : currently held (level-triggered, used for movement)
// keysPressed[] : just-pressed this tick (edge-triggered, used for shooting)
const keysPressed = {};
const GAME_KEYS = new Set([
    'KeyW','KeyA','KeyS','KeyD',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Space','Enter',
    'KeyQ','ShiftRight','ShiftLeft',     // back-pass keys
]);
// Numpad fallback — when NumLock is off some laptops fire Numpad codes for arrows.
// We map them onto the canonical Arrow* code so movement code only checks one name.
const KEY_ALIASES = {
    'Numpad8': 'ArrowUp',
    'Numpad2': 'ArrowDown',
    'Numpad4': 'ArrowLeft',
    'Numpad6': 'ArrowRight',
};
// e.key fallback for legacy / odd browsers that fail to populate e.code (rare,
// but seen on some virtual keyboards / Bluetooth dongles)
const KEY_FROM_EKEY = {
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    ' ': 'Space', 'Enter': 'Enter',
    'w': 'KeyW', 'W': 'KeyW',
    'a': 'KeyA', 'A': 'KeyA',
    's': 'KeyS', 'S': 'KeyS',
    'd': 'KeyD', 'D': 'KeyD',
    'q': 'KeyQ', 'Q': 'KeyQ',
};
function resolveKeyCode(e) {
    if (e.code && KEY_ALIASES[e.code]) return KEY_ALIASES[e.code];
    if (e.code && GAME_KEYS.has(e.code)) return e.code;
    if (e.key && KEY_FROM_EKEY[e.key]) return KEY_FROM_EKEY[e.key];
    if (e.key === 'Shift') return e.location === 2 ? 'ShiftRight' : 'ShiftLeft';
    return null;
}
function onKeyDown(e) {
    // gate by screen so name inputs / page navigation aren't hijacked
    if (STATE.screen !== 'playing') return;
    const code = resolveKeyCode(e);
    if (!code) return;
    keys[code] = true;
    if (!e.repeat) keysPressed[code] = true;
    e.preventDefault();
}
function onKeyUp(e) {
    // releases always fire — otherwise a key held when leaving the screen
    // would stay 'pressed' forever
    const code = resolveKeyCode(e);
    if (!code) return;
    keys[code] = false;
}
function clearAllKeys() {
    Object.keys(keys).forEach(k => keys[k] = false);
    Object.keys(keysPressed).forEach(k => keysPressed[k] = false);
}

// ----------- kickoff countdown -----------
function runKickoffCountdown(done) {
    const overlay = $('kickoff-overlay');
    const num = $('kickoff-num');
    const seq = ['3','2','1','GO!'];
    let i = 0;
    overlay.hidden = false;
    num.textContent = seq[0];
    // re-trigger animation each step
    const tick = () => {
        num.textContent = seq[i];
        num.style.animation = 'none';
        // force reflow
        void num.offsetWidth;
        num.style.animation = 'kickoff-num 1s ease-out';
        i++;
        if (i < seq.length) {
            setTimeout(tick, 850);
        } else {
            setTimeout(() => {
                overlay.hidden = true;
                done && done();
            }, 600);
        }
    };
    tick();
}

// ----------- fixed-step game loop -----------
// Render runs at the display rate; game logic ticks at exactly 60 Hz so the
// game feels identical on a 60 Hz, 144 Hz or 240 Hz monitor.
const PHYSICS_HZ = 60;
const PHYSICS_STEP = 1 / PHYSICS_HZ;
let physicsAccum = 0;
let lastFrameTime = 0;

// The bot uses a *delayed, smoothed* version of the ball position for strategic
// decisions, so it can't react instantly to the user's input — eliminates the
// "the CPU mirrors me" feel.
const botPerception = { x: 0, z: 0, init: false };
function resetBotPerception() {
    botPerception.x = ball ? ball.position.x : 0;
    botPerception.z = ball ? ball.position.z : 0;
    botPerception.init = true;
}

function animate(now) {
    if (STATE.screen !== 'playing') return;
    animationId = requestAnimationFrame(animate);

    if (lastFrameTime === 0) lastFrameTime = now;
    let frameDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = PHYSICS_STEP;
    if (frameDt > 0.25) frameDt = 0.25;     // tab/sleep recovery cap

    if (!STATE.paused) {
        physicsAccum += frameDt;
        let safety = 5;
        while (physicsAccum >= PHYSICS_STEP && safety-- > 0) {
            physicsAccum -= PHYSICS_STEP;
            gameTick();
        }
        if (safety <= 0) physicsAccum = 0;       // dropped frames — don't spiral
    } else {
        physicsAccum = 0;                          // no catch-up on resume
    }

    updateChargeFx();
    updateTimer();
    renderer.render(scene, camera);
}

// Charge feedback: scale + brighten the controlled-player's underfoot ring,
// so the user can SEE how hard their shot will be.
function updateChargeFx() {
    [controlledP1, controlledP2].forEach(p => {
        if (!p) return;
        const ring = p.userData.ring;
        if (!ring) return;
        let t = 0;
        if (p.userData.charging) {
            const ms = performance.now() - (p.userData.chargeStart || performance.now());
            t = Math.min(1, Math.max(0, (ms - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS)));
        }
        const target = 1 + t * 0.55;
        const cur = ring.scale.x;
        ring.scale.setScalar(cur + (target - cur) * 0.35);
        ring.material.opacity = 0.7 + t * 0.3;
        // also a subtle pulse on the body's emissive when fully charged
        const body = p.children[0];
        if (body && body.material && body.material.emissiveIntensity !== undefined) {
            body.material.emissiveIntensity = 0.18 + t * 0.6;
        }
    });
}

function gameTick() {
    if (STATE.paused) return;
    if (!STATE.inputLocked && !STATE.scoring) {
        if (STATE.mode === 'cpu') {
            movePlayer(controlledP1, {
                up:    ['KeyW', 'ArrowUp'],
                down:  ['KeyS', 'ArrowDown'],
                left:  ['KeyA', 'ArrowLeft'],
                right: ['KeyD', 'ArrowRight'],
            });
            handleShoot(controlledP1, ['Space']);
            handleBackPass(controlledP1, ['KeyQ', 'ShiftLeft', 'ShiftRight']);
        } else {
            movePlayer(controlledP1, {
                up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
            });
            movePlayer(controlledP2, {
                up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
            });
            handleShoot(controlledP1, ['Space']);
            handleShoot(controlledP2, ['Enter']);
            handleBackPass(controlledP1, ['KeyQ']);
            handleBackPass(controlledP2, ['ShiftRight', 'ShiftLeft']);
        }
    }

    updateAI();
    separatePlayers();
    updateBall();

    // Update the bot's perception of the ball: smoothed lerp with ~150 ms lag.
    // Bot AI uses this for strategy, not the raw ball position.
    if (!botPerception.init) resetBotPerception();
    botPerception.x += (ball.position.x - botPerception.x) * 0.10;
    botPerception.z += (ball.position.z - botPerception.z) * 0.10;

    // consume edge-triggered presses so a held key only fires once
    for (const k in keysPressed) keysPressed[k] = false;
}

function pressedOnce(arr) { return arr.some(k => keysPressed[k]); }

// Push overlapping players apart so they can't lock into a single tile.
// Each pair finds the overlap and shoves them along the connecting axis.
function separatePlayers() {
    const all = [...team1Players, ...team2Players];
    const minDist = PLAYER_SIZE * 1.2;        // tighter contact — less wall-feeling
    const minDist2 = minDist * minDist;
    for (let i = 0; i < all.length; i++) {
        const a = all[i];
        for (let j = i + 1; j < all.length; j++) {
            const b = all[j];
            const dx = a.position.x - b.position.x;
            const dz = a.position.z - b.position.z;
            const d2 = dx*dx + dz*dz;
            if (d2 >= minDist2) continue;

            // exact overlap — nudge with a deterministic direction
            let nx, nz, d;
            if (d2 < 0.01) {
                nx = 1; nz = 0; d = 0;
            } else {
                d = Math.sqrt(d2);
                nx = dx / d; nz = dz / d;
            }
            const overlap = (minDist - d) * 0.5 + 0.02;
            // shove rules:
            //   keeper vs field player → only the field player moves
            //   human  vs bot          → bot does most of the dance (90/10)
            //   else                   → 50/50
            const aIsKeeper = a.userData && a.userData.isKeeper;
            const bIsKeeper = b.userData && b.userData.isKeeper;
            const aIsHuman = (a === controlledP1 || a === controlledP2);
            const bIsHuman = (b === controlledP1 || b === controlledP2);
            let aShove, bShove;
            if (aIsKeeper && !bIsKeeper)        { aShove = 0;    bShove = 1; }
            else if (bIsKeeper && !aIsKeeper)   { aShove = 1;    bShove = 0; }
            else if (aIsHuman && !bIsHuman)     { aShove = 0.1;  bShove = 0.9; }
            else if (bIsHuman && !aIsHuman)     { aShove = 0.9;  bShove = 0.1; }
            else                                { aShove = 0.5;  bShove = 0.5; }
            a.position.x += nx * overlap * (aShove * 2);
            a.position.z += nz * overlap * (aShove * 2);
            b.position.x -= nx * overlap * (bShove * 2);
            b.position.z -= nz * overlap * (bShove * 2);

            // clamp both to pitch bounds
            a.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, a.position.x));
            a.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, a.position.z));
            b.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, b.position.x));
            b.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, b.position.z));
        }
    }
}

function pressed(arr) { return arr.some(k => keys[k]); }

function movePlayer(player, k) {
    if (!player) return;

    // collect raw input direction
    let inX = 0, inZ = 0;
    if (pressed(k.up))    inZ -= 1;
    if (pressed(k.down))  inZ += 1;
    if (pressed(k.left))  inX -= 1;
    if (pressed(k.right)) inX += 1;

    const inLen = Math.hypot(inX, inZ);
    if (inLen === 0) return;

    // normalize so diagonal isn't 41% faster than cardinal
    const speed = 0.95;
    const mx = (inX / inLen) * speed;
    const mz = (inZ / inLen) * speed;

    // remember last movement direction so the shoot command can aim with it
    player.userData.aimX = inX / inLen;
    player.userData.aimZ = inZ / inLen;

    // Slide-along-defender: project velocity onto the contact tangent so the
    // player slips around opponents instead of jittering between canX / canZ.
    // The human keeps a small fraction of inward velocity so they can muscle
    // the bot back instead of feeling stuck against a wall.
    const all = [...team1Players, ...team2Players];
    const minDist = PLAYER_SIZE * 1.2;
    const minDist2 = minDist * minDist;
    // Only cancel inward velocity vs the keeper (hard wall — no walking through
    // him into the goal). Vs field players we let the human plough through at
    // full speed; separatePlayers shoves the bot aside afterwards. Result: the
    // arrows always translate to motion, no sticky / laggy feel during a press.
    for (const other of all) {
        if (other === player) continue;
        const otherIsKeeper = other.userData && other.userData.isKeeper;
        if (!otherIsKeeper) continue;
        const ndx = (player.position.x + mx) - other.position.x;
        const ndz = (player.position.z + mz) - other.position.z;
        const nd2 = ndx*ndx + ndz*ndz;
        if (nd2 >= minDist2) continue;
        const nd = Math.sqrt(nd2) || 0.001;
        const nx = ndx / nd;
        const nz = ndz / nd;
        const dot = mx * nx + mz * nz;
        if (dot < 0) {
            mx -= dot * nx;
            mz -= dot * nz;
        }
    }
    player.position.x += mx;
    player.position.z += mz;

    // pitch bounds
    player.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, player.position.x));
    player.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, player.position.z));
}

// charge-shot tuning
const CHARGE_MIN_MS = 0;        // any press counts — even a flick fires
const CHARGE_MAX_MS = 500;      // saturates fast — arcade feel
const POWER_MIN = 3.0;          // tap shot — controllable
const POWER_MAX = 4.8;          // full charge — strong without flying out the stadium

function handleShoot(player, key) {
    if (!player) return;

    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    // sticky-ball follow (independent of shoot input)
    const stickRange = PLAYER_SIZE/2 + BALL_SIZE + 1.4;
    if (dist < PLAYER_SIZE + BALL_SIZE + 2) {
        if (dist > stickRange) {
            ball.position.x = player.position.x + (dx / dist) * stickRange;
            ball.position.z = player.position.z + (dz / dist) * stickRange;
        }
        ball.velocity.x *= 0.25;
        ball.velocity.z *= 0.25;
        if (ball.velocity.y < 0) ball.velocity.y *= 0.4;
    }

    // charge mechanic: press starts a timer, release fires with scaled power
    const isHeld = pressed(key);
    const wasHeld = !!player.userData.shootHeld;

    if (isHeld && !wasHeld) {
        // just-pressed — only start charging if you're near the ball
        if (dist < PLAYER_SIZE + BALL_SIZE + 4) {
            player.userData.charging = true;
            player.userData.chargeStart = performance.now();
        }
    }

    if (!isHeld && wasHeld && player.userData.charging) {
        // released — fire
        const heldMs = performance.now() - (player.userData.chargeStart || 0);
        const clamped = Math.min(CHARGE_MAX_MS, Math.max(CHARGE_MIN_MS, heldMs));
        const t = (clamped - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS);
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * t;
        player.userData.charging = false;
        player.userData.chargeStart = 0;
        fireShot(player, power, t);
    }

    player.userData.shootHeld = isHeld;
}

function fireShot(player, power, charge01) {
    // refuse the kick if the ball has rolled out of reach during the charge
    const rdx = ball.position.x - player.position.x;
    const rdz = ball.position.z - player.position.z;
    const rdist = Math.sqrt(rdx*rdx + rdz*rdz);
    if (rdist > PLAYER_SIZE + BALL_SIZE + 5) return;

    const goalX = player.team === 1 ? FIELD_W/2 : -FIELD_W/2;

    // The shot is ALWAYS directed at the enemy goal — no more sideline kicks.
    // Lateral movement input picks WHICH part of the goal mouth you aim at.
    let aimZ = 0;                                       // default: dead centre
    const inputZ = player.userData.aimZ;
    if (inputZ !== undefined && Math.abs(inputZ) > 0.1) {
        const reach = GOAL_W * 0.48;                    // almost touching the post
        aimZ = Math.max(-reach, Math.min(reach, inputZ * reach));
    }

    const dx = goalX - ball.position.x;
    const dz = aimZ - ball.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;

    // arc: light taps have a tiny lift, full power is a flat laser. Both stay low.
    const arc = 0.28 - charge01 * 0.25;  // 0.28 → 0.03 across the range

    ball.velocity.x = nx * power;
    ball.velocity.z = nz * power;
    ball.velocity.y = arc;
    ball.position.x = player.position.x + nx * (PLAYER_SIZE + BALL_SIZE);
    ball.position.z = player.position.z + nz * (PLAYER_SIZE + BALL_SIZE);
    ball.position.y = BALL_SIZE + 0.3;
}

// One key serves two purposes:
//   * If your keeper is currently HOLDING the ball → he passes to you (ASK FOR BALL)
//   * Otherwise, if you're near the ball              → back-pass to your keeper
function handleBackPass(player, keyArr) {
    if (!player) return;
    if (!pressedOnce(keyArr)) return;

    const keeper = player.team === 1 ? team1Players[0] : team2Players[0];

    // ── CASE A: keeper has the ball — release it to me ──────────────────
    if (keeper && keeper.userData.holdingBall) {
        const px = player.position.x - keeper.position.x;
        const pz = player.position.z - keeper.position.z;
        const plen = Math.hypot(px, pz) || 1;
        const nx = px / plen;
        const nz = pz / plen;
        const power = 2.6;
        ball.velocity.x = nx * power;
        ball.velocity.z = nz * power;
        ball.velocity.y = 0.42;
        ball.position.x = keeper.position.x + nx * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
        ball.position.z = keeper.position.z + nz * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
        ball.position.y = BALL_SIZE + 0.3;
        keeper.userData.holdingBall = false;
        keeper.userData.holdStart = 0;
        return;
    }

    // ── CASE B: I have the ball — pass back to my keeper ───────────────
    const dx = ball.position.x - player.position.x;
    const dz = ball.position.z - player.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > PLAYER_SIZE + BALL_SIZE + 4) return;
    if (!keeper) return;

    const px = keeper.position.x - ball.position.x;
    const pz = keeper.position.z - ball.position.z;
    const plen = Math.hypot(px, pz) || 1;
    const nx = px / plen;
    const nz = pz / plen;

    const power = 2.6;
    ball.velocity.x = nx * power;
    ball.velocity.z = nz * power;
    ball.velocity.y = 0.32;
    ball.position.x = player.position.x + nx * (PLAYER_SIZE + BALL_SIZE);
    ball.position.z = player.position.z + nz * (PLAYER_SIZE + BALL_SIZE);
    ball.position.y = BALL_SIZE + 0.3;

    if (player.userData.charging) {
        player.userData.charging = false;
        player.userData.chargeStart = 0;
    }
}

// ----------- AI -----------
function updateAI() {
    [...team1Players, ...team2Players].forEach(p => {
        if (p === controlledP1 || p === controlledP2) return;
        if (p.userData.isKeeper) updateKeeper(p);
        else if (p.userData.isBot) updateBotFieldPlayer(p);
    });
}

function updateKeeper(k) {
    const isTeam1 = k.team === 1;
    const goalLineX = isTeam1 ? -FIELD_W/2 : FIELD_W/2;
    const homeX = goalLineX + (isTeam1 ? 4 : -4);    // 4 units in front of the goal line

    // ball is "threatening" only when it's actually in the keeper's defensive third
    const threatX = isTeam1 ? -FIELD_W * 0.20 : FIELD_W * 0.20;
    const ballThreatening = isTeam1 ? ball.position.x < threatX : ball.position.x > threatX;

    let targetX = homeX;
    let targetZ;

    if (!ballThreatening) {
        // ball is far away — keeper does NOT track. Drift back to the center of the goal.
        targetZ = 0;
    } else {
        // ball is in this keeper's third — light lateral tracking, beatable on the corners
        targetZ = ball.position.z * 0.40;

        // step out at most 2 units, only when the ball is right on top of the goal
        const dist = Math.abs(ball.position.x - goalLineX);
        const advance = Math.max(0, 2 - dist / 12);    // 0..2 units
        targetX = homeX + (isTeam1 ? advance : -advance);
    }

    targetZ = Math.max(-GOAL_W/2 + 1, Math.min(GOAL_W/2 - 1, targetZ));

    // sluggish lerp — keeper reacts slowly so a well-aimed shot can beat them
    k.position.x += (targetX - k.position.x) * 0.05;
    k.position.z += (targetZ - k.position.z) * 0.07;

    // hard clamp: keeper never leaves a small box around its goal
    const boxMinX = isTeam1 ? -FIELD_W/2 : FIELD_W/2 - 8;
    const boxMaxX = isTeam1 ? -FIELD_W/2 + 8 : FIELD_W/2;
    k.position.x = Math.max(boxMinX, Math.min(boxMaxX, k.position.x));
    k.position.z = Math.max(-GOAL_W/2 + 0.5, Math.min(GOAL_W/2 - 0.5, k.position.z));

    // catch → hold → release (only when pressured, or after a safety timeout)
    const dx = ball.position.x - k.position.x;
    const dz = ball.position.z - k.position.z;
    const d2 = dx*dx + dz*dz;
    // dual catch radius:
    //   * fast-moving ball (a shot) → wider, easier to grab
    //   * slow ball (sticky to a dribbling attacker) → much smaller — you can dribble in closer
    const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
    const reach = ballSpeed > 0.8
        ? (PLAYER_SIZE/2 + BALL_SIZE) * 0.85
        : (PLAYER_SIZE/2 + BALL_SIZE) * 0.55;

    // begin holding the moment the ball touches the keeper
    if (d2 < reach * reach && !k.userData.holdingBall) {
        k.userData.holdingBall = true;
        k.userData.holdStart = performance.now();
    }

    if (k.userData.holdingBall) {
        // sticky to keeper — bal is in zijn handen
        ball.position.x = k.position.x;
        ball.position.z = k.position.z;
        ball.position.y = BALL_SIZE + 1.6;
        ball.velocity.x = 0;
        ball.velocity.y = 0;
        ball.velocity.z = 0;

        // pressure detection: nearest enemy field player
        const enemyField = isTeam1 ? team2Players[1] : team1Players[1];
        let enemyDist = Infinity;
        if (enemyField) {
            const eDx = enemyField.position.x - k.position.x;
            const eDz = enemyField.position.z - k.position.z;
            enemyDist = Math.hypot(eDx, eDz);
        }

        const heldMs = performance.now() - (k.userData.holdStart || performance.now());
        const minHold = 380;        // brief catch animation — never instant
        const maxHold = 2400;       // safety release so the game doesn't stall
        const pressureRange = 13;   // an enemy this close = panic-pass

        const pressured = enemyDist < pressureRange;
        const release = heldMs > minHold && (pressured || heldMs > maxHold);

        if (release) {
            const teammate = isTeam1 ? team1Players[1] : team2Players[1];
            if (teammate) {
                const px = teammate.position.x - k.position.x;
                const pz = teammate.position.z - k.position.z;
                const plen = Math.hypot(px, pz) || 1;
                const nx = px / plen;
                const nz = pz / plen;
                // pressured pass goes a bit harder/flatter than a calm release
                const power = pressured ? 2.5 : 2.0;
                const arc   = pressured ? 0.25 : 0.36;
                ball.velocity.x = nx * power;
                ball.velocity.z = nz * power;
                ball.velocity.y = arc;
                ball.position.x = k.position.x + nx * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
                ball.position.z = k.position.z + nz * (PLAYER_SIZE/2 + BALL_SIZE + 0.7);
                ball.position.y = BALL_SIZE + 0.3;
            } else {
                const dir = isTeam1 ? 1 : -1;
                ball.velocity.x = dir * 1.1;
                ball.velocity.z = (Math.random() - 0.5) * 0.5;
                ball.velocity.y = 0.35;
                ball.position.x = k.position.x + dir * (PLAYER_SIZE/2 + BALL_SIZE + 0.5);
            }
            k.userData.holdingBall = false;
            k.userData.holdStart = 0;
        }
    }
}

// CPU field player — chase / dribble / shoot / defend
function updateBotFieldPlayer(p) {
    if (STATE.inputLocked) return;

    const ownGoalX = p.team === 1 ? -FIELD_W/2 : FIELD_W/2;
    const enemyGoalX = -ownGoalX;
    const goalSign = p.team === 1 ? 1 : -1;

    // contact uses real ball pos (so dribble/tackle still works);
    // strategy uses lagged perception so the bot can't cheat-read your inputs.
    const realDX = ball.position.x - p.position.x;
    const realDZ = ball.position.z - p.position.z;
    const ballDist = Math.sqrt(realDX*realDX + realDZ*realDZ);

    const perX = botPerception.x;
    const perZ = botPerception.z;

    const owner = getBallOwner();
    const haveBall = owner === p;
    const teammateHasBall = owner && owner !== p && owner.team === p.team;
    const enemyHasBall = owner && owner.team !== p.team;

    let targetX, targetZ;

    if (haveBall) {
        // dribble toward enemy goal — use real ball pos because we're carrying it
        targetX = enemyGoalX;
        targetZ = ball.position.z * 0.6 + Math.sin(Date.now() * 0.003) * 8;
    } else if (teammateHasBall) {
        // hang around for a return ball — minimal lateral following
        targetX = (perX + enemyGoalX) / 2;
        targetZ = perZ * 0.25 - Math.sign(p.position.z || 1) * 8;
    } else if (enemyHasBall) {
        // PRESS the ball carrier when they're not yet in our defending third.
        // When they ARE in our third (ready to shoot), drop back to a deep line
        // with a side-bias so we're never exactly on the shooting line.
        const distFromOwnGoal = Math.abs(perX - ownGoalX);
        const inOurDefendingThird = distFromOwnGoal < FIELD_W * 0.30;     // ~33 units

        if (inOurDefendingThird) {
            // shooting range — keep a goal-side line, off the trajectory
            const sideBias = -Math.sign(perZ || 1) * 5;
            targetX = ownGoalX + 8 * goalSign;
            targetZ = perZ * 0.12 + sideBias;
        } else {
            // PRESS — close on the user, staying goal-side and a body-length
            // back so we don't constantly overlap (which would feel like glue
            // sticking to the user). Cap how far we'll chase past midfield.
            targetX = perX - 8 * goalSign;
            targetZ = perZ;
            const maxAdvance = FIELD_W * 0.10;
            const enemySide = -Math.sign(ownGoalX);
            if (Math.sign(targetX) === enemySide && Math.abs(targetX) > maxAdvance) {
                targetX = enemySide * maxAdvance;
            }
        }
    } else {
        // ball is loose — chase the perceived ball position
        targetX = perX;
        targetZ = perZ;
    }

    const tdx = targetX - p.position.x;
    const tdz = targetZ - p.position.z;
    const tdist = Math.sqrt(tdx*tdx + tdz*tdz);
    // press a bit faster than idle so closing the gap actually feels like pressure
    const baseSpeed = 0.74;
    const speed = enemyHasBall ? 0.88 : baseSpeed;
    if (tdist > 0.5) {
        // slide-along collision (same projection trick as the human player)
        let mx = (tdx / tdist) * speed;
        let mz = (tdz / tdist) * speed;
        const all = [...team1Players, ...team2Players];
        const minDist = PLAYER_SIZE * 1.2;
        const minDist2 = minDist * minDist;
        for (let pass = 0; pass < 2; pass++) {
            for (const o of all) {
                if (o === p) continue;
                const ndx = (p.position.x + mx) - o.position.x;
                const ndz = (p.position.z + mz) - o.position.z;
                const nd2 = ndx*ndx + ndz*ndz;
                if (nd2 >= minDist2) continue;
                const nd = Math.sqrt(nd2) || 0.001;
                const nx = ndx / nd;
                const nz = ndz / nd;
                const dot = mx * nx + mz * nz;
                if (dot < 0) {
                    mx -= dot * nx;
                    mz -= dot * nz;
                }
            }
        }
        p.position.x += mx;
        p.position.z += mz;
    }

    // pitch bounds
    p.position.x = Math.max(-FIELD_W/2 + PLAYER_SIZE/2, Math.min(FIELD_W/2 - PLAYER_SIZE/2, p.position.x));
    p.position.z = Math.max(-FIELD_L/2 + PLAYER_SIZE/2, Math.min(FIELD_L/2 - PLAYER_SIZE/2, p.position.z));

    // sticky-ball follow when CPU has it
    if (haveBall) {
        const sx = ball.position.x - p.position.x;
        const sz = ball.position.z - p.position.z;
        const sdist = Math.sqrt(sx*sx + sz*sz);
        const stickRange = PLAYER_SIZE/2 + BALL_SIZE + 1.4;
        if (sdist > stickRange) {
            ball.position.x = p.position.x + (sx / sdist) * stickRange;
            ball.position.z = p.position.z + (sz / sdist) * stickRange;
        }
        ball.velocity.x *= 0.3;
        ball.velocity.z *= 0.3;
    }

    // decide to shoot when in shooting range
    const shootRange = (p.team === 1 ? FIELD_W/2 - p.position.x : p.position.x + FIELD_W/2);
    if (haveBall && shootRange < 34 && Math.random() < 0.032) {
        const goalX = enemyGoalX;
        const keeper = (p.team === 1 ? team2Players[0] : team1Players[0]);
        // aim toward the open side of the keeper, plus a chunky human-ish miss spread
        const sidePref = keeper ? Math.sign(-keeper.position.z || 1) * (GOAL_W * 0.32) : 0;
        const miss = (Math.random() - 0.5) * 7;        // ±3.5 units of error
        const aimZ = sidePref + miss;
        const tx = goalX - ball.position.x;
        const tz = aimZ - ball.position.z;
        const len = Math.sqrt(tx*tx + tz*tz);
        if (len > 0) {
            const power = 2.2;
            ball.velocity.x = (tx / len) * power;
            ball.velocity.z = (tz / len) * power;
            ball.velocity.y = 0.38;        // flatter — your body can now block
            ball.position.x = p.position.x + (tx / len) * (PLAYER_SIZE + BALL_SIZE);
            ball.position.z = p.position.z + (tz / len) * (PLAYER_SIZE + BALL_SIZE);
            ball.position.y = BALL_SIZE + 0.3;
        }
    }

    // tackle: if enemy has ball and we're close, sometimes punt it away
    if (enemyHasBall && ballDist < PLAYER_SIZE + BALL_SIZE + 2 && Math.random() < 0.15) {
        const dir = p.team === 1 ? 1 : -1;
        ball.velocity.x = dir * 1.0;
        ball.velocity.z = (Math.random() - 0.5) * 0.7;
        // small horizontal nudge — don't launch the ball into the sky
        ball.velocity.y = ball.position.y > BALL_SIZE + 0.6 ? -0.1 : 0.18;
    }
}

// ball owner: closest player within reach, otherwise null
function getBallOwner() {
    let owner = null;
    let bestD2 = Infinity;
    [...team1Players, ...team2Players].forEach(p => {
        const dx = p.position.x - ball.position.x;
        const dz = p.position.z - ball.position.z;
        const d2 = dx*dx + dz*dz;
        if (d2 < bestD2 && d2 < (PLAYER_SIZE + BALL_SIZE + 1) ** 2) {
            bestD2 = d2;
            owner = p;
        }
    });
    return owner;
}

// ----------- ball physics -----------
function updateBall() {
    // freeze the ball during goal celebrations
    if (STATE.scoring) return;
    // any keeper holding the ball? skip all physics — bal zit in z'n handen
    if (team1Players[0] && team1Players[0].userData.holdingBall) return;
    if (team2Players[0] && team2Players[0].userData.holdingBall) return;

    // gravity (skip if sticky)
    const sticky = isSticky();
    if (!sticky) {
        ball.velocity.y -= 0.022;
        // mild air drag so a hard shot doesn't fly forever and ricochet around
        if (ball.position.y > BALL_SIZE + 0.05) {
            ball.velocity.x *= 0.996;
            ball.velocity.z *= 0.996;
        }
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
        ball.position.z += ball.velocity.z;
    }

    // ceiling
    if (ball.position.y > 9) {
        ball.position.y = 9;
        ball.velocity.y = Math.min(ball.velocity.y, 0);
    }

    // ground
    if (ball.position.y <= BALL_SIZE) {
        ball.position.y = BALL_SIZE;
        const hardLanding = ball.velocity.y < -0.08;
        // less bouncy — ball settles into a roll instead of pogo-sticking
        if (hardLanding) ball.velocity.y = Math.abs(ball.velocity.y) * 0.22;
        else ball.velocity.y = 0;
        // heavy friction on real impact (kills bouncing skips), light friction
        // on rolling so a flat shot keeps travelling toward the goal
        const fric = hardLanding ? 0.85 : 0.985;
        ball.velocity.x *= fric;
        ball.velocity.z *= fric;
        if (Math.abs(ball.velocity.x) < 0.012) ball.velocity.x = 0;
        if (Math.abs(ball.velocity.z) < 0.012) ball.velocity.z = 0;
    }

    // walls (except goal zones)
    if (Math.abs(ball.position.x) > FIELD_W/2) {
        if (Math.abs(ball.position.z) < GOAL_W/2 && ball.position.y < GOAL_H) {
            scoreGoal(ball.position.x > 0 ? 1 : 2);
            return;
        }
        ball.velocity.x *= -0.45;
        ball.position.x = Math.sign(ball.position.x) * FIELD_W/2;
    }
    if (Math.abs(ball.position.z) > FIELD_L/2) {
        ball.velocity.z *= -0.45;
        ball.position.z = Math.sign(ball.position.z) * FIELD_L/2;
    }

    // player collisions — skip the ball owner; only bounce on approach.
    // Lobs above PLAYER_SIZE * 1.5 fly over a player's head (defense can be jumped).
    const owner = getBallOwner();
    const ballOverHead = ball.position.y > PLAYER_SIZE * 1.5;
    [...team1Players, ...team2Players].forEach(p => {
        if (p === owner) return;
        if (ballOverHead) return;

        const dx = ball.position.x - p.position.x;
        const dz = ball.position.z - p.position.z;
        const d2 = dx*dx + dz*dz;
        const r = PLAYER_SIZE/2 + BALL_SIZE;
        if (d2 >= r*r) return;

        const d = Math.sqrt(d2) || 0.001;
        const overlap = r - d + 0.02;
        ball.position.x += (dx / d) * overlap;
        ball.position.z += (dz / d) * overlap;

        const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
        const airborne = ball.position.y > BALL_SIZE + 0.6;

        // TACKLE: if the ball is currently sticking to an enemy (low speed),
        // a collision with this defender is a clean tackle — strong push away
        const tackling = owner && owner.team !== p.team && ballSpeed < 0.35;
        if (tackling) {
            ball.velocity.x = (dx / d) * 1.1;
            ball.velocity.z = (dz / d) * 1.1;
            // airborne tackle = bring ball down; ground tackle = small bump
            ball.velocity.y = airborne ? -0.12 : 0.18;
            return;
        }

        // BLOCK: bounce only when moving toward this player
        const approaching = (ball.velocity.x * dx + ball.velocity.z * dz) < 0;
        if (approaching) {
            const bounce = Math.max(0.18, Math.min(0.7, ballSpeed * 0.55));
            ball.velocity.x = (dx / d) * bounce;
            ball.velocity.z = (dz / d) * bounce;
            // only pull DOWN floaty/slow airborne balls — fast shots keep their arc
            if (airborne && ballSpeed < 1.2) {
                ball.velocity.y = Math.min(ball.velocity.y, -0.15);
            }
        }
    });

    // Anti-float safety: if the ball is hovering high without horizontal
    // momentum (stuck mid-air after a chain of collisions), pull it down hard.
    const horiz = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (ball.position.y > BALL_SIZE + 1.5 && horiz < 0.15 && ball.velocity.y > -0.05) {
        ball.velocity.y -= 0.08;
    }

    // visual rotation
    ball.rotation.x += ball.velocity.z * 0.12;
    ball.rotation.z -= ball.velocity.x * 0.12;
}

function isSticky() {
    if (controlledP1 && near(ball, controlledP1)) return true;
    if (controlledP2 && near(ball, controlledP2)) return true;
    // CPU bot: only stick when it's the actual ball owner (not just adjacent)
    const owner = getBallOwner && getBallOwner();
    if (owner && owner.userData && owner.userData.isBot) return true;
    return false;
}
function near(a, b) {
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;
    return (dx*dx + dz*dz) < (PLAYER_SIZE/2 + BALL_SIZE + 0.6) ** 2;
}

function scoreGoal(scoringTeam) {
    if (STATE.scoring) return;       // already counted, ignore re-entry
    STATE.scoring = true;
    STATE.inputLocked = true;

    if (scoringTeam === 1) STATE.score1++;
    else STATE.score2++;

    $('hud-s1').textContent = STATE.score1;
    $('hud-s2').textContent = STATE.score2;

    // freeze the ball IMMEDIATELY at center so further physics can't re-trigger
    ball.position.set(0, BALL_SIZE, 0);
    ball.velocity.x = 0;
    ball.velocity.y = 0;
    ball.velocity.z = 0;

    // who scored
    const scorer = STATE.p1.team === scoringTeam ? STATE.p1 : STATE.p2;
    $('goal-flash-sub').textContent = scorer.name;

    const flash = $('goal-flash');
    flash.hidden = false;
    flash.style.animation = 'none';
    void flash.offsetWidth;
    flash.style.animation = '';

    setTimeout(() => { flash.hidden = true; }, 1700);

    STATE.kickoffTeam = scoringTeam === 1 ? 2 : 1;
    setTimeout(() => {
        positionForKickoff();
        // also wipe stuck keys so a held shoot button doesn't fire on resume
        Object.keys(keys).forEach(k => keys[k] = false);
        STATE.scoring = false;
        STATE.inputLocked = false;
    }, 1400);
}

function updateTimer() {
    if (STATE.paused) return;
    if (!STATE.gameStartTime) {
        $('hud-timer').textContent = formatTime(STATE.gameDuration);
        return;
    }
    const elapsed = Math.floor((Date.now() - STATE.gameStartTime) / 1000);
    const remaining = Math.max(0, STATE.gameDuration - elapsed);
    $('hud-timer').textContent = formatTime(remaining);
    $('hud-timer').classList.toggle('warning', remaining <= 10 && remaining > 0);
    if (remaining === 0 && STATE.screen === 'playing') {
        endGame();
    }
}
function formatTime(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2,'0')}`;
}

function endGame() {
    STATE.inputLocked = true;

    // populate over screen
    const redPlayer  = STATE.p1.team === 1 ? STATE.p1 : STATE.p2;
    const bluePlayer = STATE.p1.team === 2 ? STATE.p1 : STATE.p2;
    $('over-p1-name').textContent = redPlayer.name;
    $('over-p2-name').textContent = bluePlayer.name;
    $('over-s1').textContent = STATE.score1;
    $('over-s2').textContent = STATE.score2;

    let winner;
    if (STATE.score1 > STATE.score2) winner = `${redPlayer.name} WINT`;
    else if (STATE.score2 > STATE.score1) winner = `${bluePlayer.name} WINT`;
    else winner = '— GELIJKSPEL —';
    $('over-winner').textContent = winner;

    gotoScreen('over');
}

function teardownGame() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    STATE.gameStartTime = null;
    STATE.inputLocked = true;
    STATE.paused = false;
    pauseFreezeStart = 0;
    const overlay = $('pause-overlay');
    if (overlay) overlay.hidden = true;
    $('hud-s1').textContent = '0';
    $('hud-s2').textContent = '0';
    $('hud-timer').textContent = formatTime(STATE.gameDuration);
    $('hud-timer').classList.remove('warning');
}
