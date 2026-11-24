import {
    state,
    MIN_BPM,
    MAX_BPM
} from './state.js';

import {
    saveAppState,
    loadAppState
} from './storage.js';

	/**
     * ==========================================================================
     * FLASHBEAT — MOTEUR AUDIO WEB AUDIO API & SYNCHRONISATION SCÉNIQUE
     * ==========================================================================
     */
    (() => {
      'use strict';


      /* ------------------------------------------------------------------------
         1. MANIFESTE PWA DYNAMIQUE (DATA URI)
         ------------------------------------------------------------------------ */
      function initDynamicPWAManifest() {
        try {
          const manifestEl = document.getElementById('pwa-manifest');
          if (!manifestEl) return;
          const manifest = {
            name: 'FlashBeat — Métronome Visuel',
            short_name: 'FlashBeat',
            start_url: '.',
            display: 'standalone',
            background_color: '#0B0E14',
            theme_color: '#0B0E14',
            orientation: 'any',
            icons: [
              {
                src: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#0B0E14"/><circle cx="96" cy="96" r="64" fill="#00E676"/><text x="96" y="118" font-family="sans-serif" font-weight="900" font-size="76" text-anchor="middle" fill="#0B0E14">1</text></svg>'),
                sizes: '192x192',
                type: 'image/svg+xml'
              }
            ]
          };
          manifestEl.setAttribute('href', 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(manifest)));
        } catch (err) {
          // Ignorer si l'environnement restreint le manifeste
        }
      }

      /* ------------------------------------------------------------------------
         2. VERROUILLAGE D'ÉCRAN PERMANENT ANDROID (SCREEN WAKE LOCK API)
         ------------------------------------------------------------------------ */
      let wakeLockSentinel = null;

      async function requestScreenWakeLock() {
        try {
          if (!('wakeLock' in navigator)) return;
          if (wakeLockSentinel !== null && !wakeLockSentinel.released) return;
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        } catch (err) {
          // Autorisation refusée ou non supportée dans cet environnement
        }
      }

      async function releaseScreenWakeLock() {
        try {
          if (wakeLockSentinel !== null) {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
          }
        } catch (err) {
          wakeLockSentinel = null;
        }
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          requestScreenWakeLock();
          if (state.isPlaying) {
            ensureAudioContext();
          }
        }
      });


      /* ------------------------------------------------------------------------
         4. RÉFÉRENCES DOM
         ------------------------------------------------------------------------ */
      const dom = {
        screenHalo: document.getElementById('screen-halo'),
        measureIndicator: document.getElementById('measure-indicator'),
        beatDotsContainer: document.getElementById('beat-dots-container'),
        centralPad: document.getElementById('central-pad'),
        centralPadNumber: document.getElementById('central-pad-number'),
        subdivisionPill: document.getElementById('subdivision-pill'),

        btnMinus5: document.getElementById('btn-minus-5'),
        btnMinus1: document.getElementById('btn-minus-1'),
        bpmInput: document.getElementById('bpm-input'),
        btnPlus1: document.getElementById('btn-plus-1'),
        btnPlus5: document.getElementById('btn-plus-5'),
        btnTap: document.getElementById('btn-tap'),
        bpmSlider: document.getElementById('bpm-slider'),
        btnTogglePlay: document.getElementById('btn-toggle-play'),

        sigButtons: document.querySelectorAll('.sig-btn'),
        btnPerso: document.getElementById('btn-perso'),
        persoDrawer: document.getElementById('perso-drawer'),
        persoMinus: document.getElementById('perso-minus'),
        persoPlus: document.getElementById('perso-plus'),
        persoCountLabel: document.getElementById('perso-count-label'),
        persoBeatsGrid: document.getElementById('perso-beats-grid'),

        subButtons: document.querySelectorAll('.sub-btn'),
        toggleBip: document.getElementById('toggle-bip'),
        toggleCroche: document.getElementById('toggle-croche'),
        toggleHalo: document.getElementById('toggle-halo')
      };

      /* ------------------------------------------------------------------------
         5. UTILITAIRES DE SIGNATURE RYTHMIQUE
         ------------------------------------------------------------------------ */
      function getActivePattern() {
        if (state.mode === 'custom') {
          return state.customPattern.slice(0, state.customBeatsCount);
        }
        const arr = [];
        for (let i = 0; i < state.presetBeats; i++) {
          arr.push(i === 0 ? 'accent' : 'normal');
        }
        return arr;
      }

      function renderBeatDots() {
        const pattern = getActivePattern();
        dom.beatDotsContainer.innerHTML = '';
        dom.beatDotsContainer.classList.toggle('compact', pattern.length > 8);

        pattern.forEach((type, idx) => {
          const dot = document.createElement('div');
          dot.className = `beat-dot type-${type}`;
          const numSpan = document.createElement('span');
          numSpan.textContent = String(idx + 1);
          dot.appendChild(numSpan);
          dot.dataset.index = String(idx);
          dom.beatDotsContainer.appendChild(dot);
        });
      }

      function renderSubdivisionDots() {
        if (state.subdivision === 1) {
          dom.subdivisionPill.classList.add('hidden');
          dom.subdivisionPill.innerHTML = '';
          return;
        }
        dom.subdivisionPill.classList.remove('hidden');
        dom.subdivisionPill.innerHTML = '';
        for (let i = 0; i < state.subdivision; i++) {
          const subDot = document.createElement('div');
          subDot.className = 'sub-dot';
          subDot.dataset.subIndex = String(i);
          dom.subdivisionPill.appendChild(subDot);
        }
      }

      function renderPersoDrawer() {
        dom.persoCountLabel.textContent = `${state.customBeatsCount} temps`;
        dom.persoBeatsGrid.innerHTML = '';

        // Assurer que customPattern a toujours 16 entrées valides
        while (state.customPattern.length < 16) {
          state.customPattern.push('normal');
        }

        for (let i = 0; i < state.customBeatsCount; i++) {
          const beatState = state.customPattern[i];
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'perso-beat-pill';
          pill.dataset.state = beatState;
          const pillSpan = document.createElement('span');
          pillSpan.textContent = String(i + 1);
          pill.appendChild(pillSpan);
          pill.title = `Temps ${i + 1} : cliquer pour changer l'accent`;

          pill.addEventListener('click', () => {
            const order = ['accent', 'normal', 'mute'];
            const next = order[(order.indexOf(state.customPattern[i]) + 1) % order.length];
            state.customPattern[i] = next;
            renderPersoDrawer();
            renderBeatDots();
            saveAppState(state);
          });

          dom.persoBeatsGrid.appendChild(pill);
        }
      }

      function syncControlsWithState() {
        dom.bpmInput.value = String(state.bpm);
        dom.bpmSlider.value = String(state.bpm);

        dom.sigButtons.forEach((btn) => {
          const isMatch = state.mode === 'preset' && Number(btn.dataset.beats) === state.presetBeats;
          btn.classList.toggle('active', isMatch);
        });
        dom.btnPerso.classList.toggle('active', state.mode === 'custom');

        dom.subButtons.forEach((btn) => {
          btn.classList.toggle('active', Number(btn.dataset.sub) === state.subdivision);
        });

        dom.toggleBip.classList.toggle('active', state.bipOn);
        dom.toggleBip.setAttribute('aria-pressed', String(state.bipOn));
        dom.toggleBip.textContent = state.bipOn ? 'Bip ON' : 'Bip OFF';

        dom.toggleCroche.classList.toggle('active', state.crocheOn);
        dom.toggleCroche.setAttribute('aria-pressed', String(state.crocheOn));
        dom.toggleCroche.textContent = state.crocheOn ? 'Croche ON' : 'Croche OFF';

        dom.toggleHalo.classList.toggle('active', state.haloOn);
        dom.toggleHalo.setAttribute('aria-pressed', String(state.haloOn));
        dom.toggleHalo.textContent = state.haloOn ? 'Halo ON' : 'Halo OFF';

        dom.measureIndicator.textContent = `MESURE #${state.measureNumber}`;
        dom.centralPadNumber.textContent = String(state.currentBeatIndex + 1);
      }

      /* ------------------------------------------------------------------------
         6. MOTEUR AUDIO HAUTE PRÉCISION (WEB AUDIO API + LOOKAHEAD SCHEDULER)
         ------------------------------------------------------------------------ */
      let audioCtx = null;
      let schedulerTimerId = null;
      let nextNoteTime = 0.0;
      let scheduleBeatIndex = 0;
      let scheduleSubIndex = 0;
      let scheduleMeasure = 0;

      // File d'événements visuels synchronisés sur audioCtx.currentTime
      const visualQueue = [];
      let flashTimeoutId = null;
      let rafId = null;

      const LOOKAHEAD_MS = 20.0;       // Intervalle de vérification (20 ms)
      const SCHEDULE_AHEAD_SEC = 0.1;  // Fenêtre d'anticipation audio (100 ms)

      function ensureAudioContext() {
        if (!audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }

      /**
       * Synthétise une impulsion percussive ultra-nette sans latence ni fichier externe
       */
      function scheduleAudioClick(time, isMainBeat, beatType, subIndex) {
        if (!audioCtx) return;

        // Temps principal (subIndex === 0)
        if (isMainBeat) {
          if (!state.bipOn || beatType === 'mute') return;

          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();

          // Fréquence : 1320 Hz (accentué rouge) vs 880 Hz (normal vert)
          const freq = beatType === 'accent' ? 1320 : 880;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, time);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.55, time + 0.045);

          gain.gain.setValueAtTime(0.001, time);
          gain.gain.linearRampToValueAtTime(beatType === 'accent' ? 0.9 : 0.65, time + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(time);
          osc.stop(time + 0.06);
        } else {
          // Subdivision (croche / double-croche)
          if (!state.crocheOn) return;

          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();

          // Légère différence de timbre sur le contretemps ("et") vs doubles intermédiaires
          const isAndBeat = (state.subdivision === 4 && subIndex === 2) || state.subdivision === 2;
          const freq = isAndBeat ? 660 : 560;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, time);

          gain.gain.setValueAtTime(0.001, time);
          gain.gain.linearRampToValueAtTime(0.38, time + 0.002);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(time);
          osc.stop(time + 0.04);
        }
      }

      /**
       * Planifie le pas courant et avance les compteurs rythmiques
       */
      function scheduleNote(time) {
        const pattern = getActivePattern();
        const totalBeats = pattern.length;

        // Sécurité si la signature rythmique a été réduite en cours de lecture
        if (scheduleBeatIndex >= totalBeats) {
          scheduleBeatIndex = 0;
        }
        if (scheduleSubIndex >= state.subdivision) {
          scheduleSubIndex = 0;
        }

        const beatType = pattern[scheduleBeatIndex];
        const isMainBeat = scheduleSubIndex === 0;

        // 1. Planification Audio exacte
        scheduleAudioClick(time, isMainBeat, beatType, scheduleSubIndex);

        // 2. Empilement dans la file visuelle avec horodatage audio exact
        visualQueue.push({
          time,
          measure: scheduleMeasure,
          beatIndex: scheduleBeatIndex,
          beatType,
          subIndex: scheduleSubIndex,
          subdivisionCount: state.subdivision
        });

        // 3. Avancement temporel précis
        const secondsPerBeat = 60.0 / state.bpm;
        const secondsPerSub = secondsPerBeat / state.subdivision;
        nextNoteTime += secondsPerSub;

        scheduleSubIndex++;
        if (scheduleSubIndex >= state.subdivision) {
          scheduleSubIndex = 0;
          scheduleBeatIndex++;
          if (scheduleBeatIndex >= totalBeats) {
            scheduleBeatIndex = 0;
            scheduleMeasure++;
          }
        }
      }

      function schedulerLoop() {
        if (!state.isPlaying || !audioCtx) return;
        while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
          scheduleNote(nextNoteTime);
        }
      }

      /* ------------------------------------------------------------------------
         7. BOUCLE DE RENDU VISUEL SYNCHRONISÉE (REQUESTANIMATIONFRAME)
         ------------------------------------------------------------------------ */
      function triggerVisualStep(event) {
        const { measure, beatIndex, beatType, subIndex, subdivisionCount } = event;

        // Mise à jour de l'état courant et sauvegarde continue à chaque temps
        state.measureNumber = measure;
        state.currentBeatIndex = beatIndex;
        state.currentSubIndex = subIndex;
        if (subIndex === 0) {
          state.lastTickTimestamp = Date.now();
          saveAppState(state);
        }

        // Mise à jour du compteur de mesure
        dom.measureIndicator.textContent = `MESURE #${measure}`;

        // Mise à jour des pastilles de temps
        const dots = dom.beatDotsContainer.children;
        for (let i = 0; i < dots.length; i++) {
          dots[i].classList.remove('active-red', 'active-green', 'active-mute');
          if (i === beatIndex) {
            if (beatType === 'accent') dots[i].classList.add('active-red');
            else if (beatType === 'normal') dots[i].classList.add('active-green');
            else dots[i].classList.add('active-mute');
          }
        }

        // Mise à jour des pastilles de subdivisions
        if (subdivisionCount > 1 && !dom.subdivisionPill.classList.contains('hidden')) {
          const subDots = dom.subdivisionPill.children;
          for (let i = 0; i < subDots.length; i++) {
            subDots[i].classList.toggle('active', i === subIndex);
          }
        }

        // Si temps principal (subIndex === 0), déclenchement du flash Pad Central + Halo
        if (subIndex === 0) {
          dom.centralPadNumber.textContent = String(beatIndex + 1);

          // Nettoyage classes précédentes
          dom.centralPad.classList.remove('flash-red', 'flash-green', 'flash-mute');
          dom.screenHalo.classList.remove('flash-red', 'flash-green');

          // Force reflow pour redéclencher l'animation même à 260 BPM
          void dom.centralPad.offsetWidth;

          if (beatType === 'accent') {
            dom.centralPad.classList.add('flash-red');
            if (state.haloOn) dom.screenHalo.classList.add('flash-red');
          } else if (beatType === 'normal') {
            dom.centralPad.classList.add('flash-green');
            if (state.haloOn) dom.screenHalo.classList.add('flash-green');
          } else {
            dom.centralPad.classList.add('flash-mute');
          }

          // Durée proportionnelle au tempo (entre 75ms et 160ms) pour un clignotement net à 260 BPM
          const beatDurationMs = (60 / state.bpm) * 1000;
          const flashDuration = Math.min(160, Math.max(65, beatDurationMs * 0.45));

          if (flashTimeoutId) clearTimeout(flashTimeoutId);
          flashTimeoutId = setTimeout(() => {
            dom.centralPad.classList.remove('flash-red', 'flash-green', 'flash-mute');
            dom.screenHalo.classList.remove('flash-red', 'flash-green');
          }, flashDuration);
        }
      }

      function visualRenderLoop() {
        if (state.isPlaying && audioCtx) {
          const currentTime = audioCtx.currentTime;
          while (visualQueue.length > 0 && visualQueue[0].time <= currentTime) {
            const event = visualQueue.shift();
            triggerVisualStep(event);
          }
        }
        rafId = requestAnimationFrame(visualRenderLoop);
      }

      /* ------------------------------------------------------------------------
         8. DÉMARRAGE / ARRÊT DU MÉTRONOME
         ------------------------------------------------------------------------ */
      function resetVisualState() {
        if (flashTimeoutId) clearTimeout(flashTimeoutId);
        visualQueue.length = 0;

        state.measureNumber = 0;
        state.currentBeatIndex = 0;
        state.currentSubIndex = 0;
        state.lastTickTimestamp = 0;

        dom.measureIndicator.textContent = 'MESURE #0';
        dom.centralPadNumber.textContent = '1';
        dom.centralPad.classList.remove('flash-red', 'flash-green', 'flash-mute');
        dom.screenHalo.classList.remove('flash-red', 'flash-green');

        const dots = dom.beatDotsContainer.children;
        for (let i = 0; i < dots.length; i++) {
          dots[i].classList.remove('active-red', 'active-green', 'active-mute');
        }

        const subDots = dom.subdivisionPill.children;
        for (let i = 0; i < subDots.length; i++) {
          subDots[i].classList.remove('active');
        }
      }

      function startMetronome(resumeFromSaved = false) {
        ensureAudioContext();
        requestScreenWakeLock();

        if (schedulerTimerId) {
          clearInterval(schedulerTimerId);
          schedulerTimerId = null;
        }

        state.isPlaying = true;
        if (resumeFromSaved) {
          scheduleMeasure = state.measureNumber;
          scheduleBeatIndex = state.currentBeatIndex;
          scheduleSubIndex = 0;
        } else {
          scheduleMeasure = 0;
          scheduleBeatIndex = 0;
          scheduleSubIndex = 0;
          state.measureNumber = 0;
          state.currentBeatIndex = 0;
          state.currentSubIndex = 0;
        }
        state.lastTickTimestamp = Date.now();
        visualQueue.length = 0;

        nextNoteTime = audioCtx.currentTime + 0.03;

        dom.btnTogglePlay.textContent = 'ARRÊTER';
        dom.btnTogglePlay.classList.add('playing');

        saveAppState(state);
        schedulerLoop();
        schedulerTimerId = setInterval(schedulerLoop, LOOKAHEAD_MS);
      }

      function stopMetronome() {
        state.isPlaying = false;
        if (schedulerTimerId) {
          clearInterval(schedulerTimerId);
          schedulerTimerId = null;
        }
        releaseScreenWakeLock();
        dom.btnTogglePlay.textContent = 'DÉMARRER';
        dom.btnTogglePlay.classList.remove('playing');
        resetVisualState();
        saveAppState(state);
      }

      /* ------------------------------------------------------------------------
         9. GESTION DES CONTRÔLES UTILISATEUR
         ------------------------------------------------------------------------ */
      function setBpm(newBpm) {
        const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(newBpm) || MIN_BPM)));
        state.bpm = clamped;
        dom.bpmInput.value = String(clamped);
        dom.bpmSlider.value = String(clamped);
        saveAppState(state);
      }

      // Boutons -5, -1, +1, +5
      dom.btnMinus5.addEventListener('click', () => setBpm(state.bpm - 5));
      dom.btnMinus1.addEventListener('click', () => setBpm(state.bpm - 1));
      dom.btnPlus1.addEventListener('click', () => setBpm(state.bpm + 1));
      dom.btnPlus5.addEventListener('click', () => setBpm(state.bpm + 5));

      // Saisie directe BPM
      dom.bpmInput.addEventListener('change', () => setBpm(dom.bpmInput.value));
      dom.bpmInput.addEventListener('blur', () => setBpm(dom.bpmInput.value));
      dom.bpmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          setBpm(dom.bpmInput.value);
          dom.bpmInput.blur();
        }
      });

      // Slider BPM
      dom.bpmSlider.addEventListener('input', (e) => setBpm(e.target.value));

      // Tap Tempo (moyenne glissante des 4 derniers intervalles)
      let tapTimestamps = [];
      dom.btnTap.addEventListener('click', () => {
        const now = performance.now();
        if (tapTimestamps.length > 0 && now - tapTimestamps[tapTimestamps.length - 1] > 2200) {
          tapTimestamps = [];
        }
        tapTimestamps.push(now);
        if (tapTimestamps.length > 5) {
          tapTimestamps.shift();
        }

        dom.btnTap.classList.add('tapped');
        setTimeout(() => dom.btnTap.classList.remove('tapped'), 120);

        if (tapTimestamps.length >= 2) {
          let totalInterval = 0;
          for (let i = 1; i < tapTimestamps.length; i++) {
            totalInterval += tapTimestamps[i] - tapTimestamps[i - 1];
          }
          const avgIntervalMs = totalInterval / (tapTimestamps.length - 1);
          const calculatedBpm = Math.round(60000 / avgIntervalMs);
          setBpm(calculatedBpm);
        }
      });

      // Bouton Démarrer / Arrêter
      dom.btnTogglePlay.addEventListener('click', () => {
        if (state.isPlaying) {
          stopMetronome();
        } else {
          startMetronome();
        }
      });

      // Barre espace pour démarrer/arrêter facilement
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement !== dom.bpmInput) {
          e.preventDefault();
          dom.btnTogglePlay.click();
        }
      });

      // Signatures Rythmiques (2/4, 3/4, 4/4, 5/4)
      dom.sigButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          state.mode = 'preset';
          state.presetBeats = Number(btn.dataset.beats);

          dom.sigButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          dom.btnPerso.classList.remove('active');
          dom.persoDrawer.classList.remove('open');

          if (scheduleBeatIndex >= state.presetBeats) {
            scheduleBeatIndex = 0;
          }
          renderBeatDots();
          saveAppState(state);
        });
      });

      // Bouton Perso & Tiroir personnalisé (1 à 16 temps)
      dom.btnPerso.addEventListener('click', () => {
        const wasCustom = state.mode === 'custom';
        state.mode = 'custom';

        dom.sigButtons.forEach((b) => b.classList.remove('active'));
        dom.btnPerso.classList.add('active');

        if (wasCustom) {
          dom.persoDrawer.classList.toggle('open');
        } else {
          dom.persoDrawer.classList.add('open');
        }

        renderPersoDrawer();
        renderBeatDots();
        saveAppState(state);
      });

      dom.persoMinus.addEventListener('click', () => {
        if (state.customBeatsCount > 1) {
          state.customBeatsCount--;
          if (scheduleBeatIndex >= state.customBeatsCount) {
            scheduleBeatIndex = 0;
          }
          renderPersoDrawer();
          renderBeatDots();
          saveAppState(state);
        }
      });

      dom.persoPlus.addEventListener('click', () => {
        if (state.customBeatsCount < 16) {
          state.customBeatsCount++;
          renderPersoDrawer();
          renderBeatDots();
          saveAppState(state);
        }
      });

      // Subdivisions (Noires = 1, Croches = 2, Doubles = 4)
      dom.subButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          state.subdivision = Number(btn.dataset.sub);
          scheduleSubIndex = 0;

          dom.subButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          renderSubdivisionDots();
          saveAppState(state);
        });
      });

      // Bascules Audio & Visuelles (Bip ON, Croche ON, Halo ON)
      dom.toggleBip.addEventListener('click', () => {
        state.bipOn = !state.bipOn;
        dom.toggleBip.classList.toggle('active', state.bipOn);
        dom.toggleBip.setAttribute('aria-pressed', String(state.bipOn));
        dom.toggleBip.textContent = state.bipOn ? 'Bip ON' : 'Bip OFF';
        saveAppState(state);
      });

      dom.toggleCroche.addEventListener('click', () => {
        state.crocheOn = !state.crocheOn;
        dom.toggleCroche.classList.toggle('active', state.crocheOn);
        dom.toggleCroche.setAttribute('aria-pressed', String(state.crocheOn));
        dom.toggleCroche.textContent = state.crocheOn ? 'Croche ON' : 'Croche OFF';
        saveAppState(state);
      });

      dom.toggleHalo.addEventListener('click', () => {
        state.haloOn = !state.haloOn;
        dom.toggleHalo.classList.toggle('active', state.haloOn);
        dom.toggleHalo.setAttribute('aria-pressed', String(state.haloOn));
        dom.toggleHalo.textContent = state.haloOn ? 'Halo ON' : 'Halo OFF';
        if (!state.haloOn) {
          dom.screenHalo.classList.remove('flash-red', 'flash-green');
        }
        saveAppState(state);
      });

      /* ------------------------------------------------------------------------
         10. CONTINUITÉ LORS DES ROTATIONS & INITIALISATION AU CHARGEMENT
         ------------------------------------------------------------------------ */
      function handleViewportOrOrientationChange() {
        saveAppState(state);
        requestScreenWakeLock();
        if (state.isPlaying) {
          ensureAudioContext();
        }
      }

      window.addEventListener('orientationchange', handleViewportOrOrientationChange, { passive: true });
      window.addEventListener('resize', handleViewportOrOrientationChange, { passive: true });
      window.addEventListener('beforeunload', saveAppState);
      window.addEventListener('pagehide', saveAppState);

      if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener('change', handleViewportOrOrientationChange);
      }

      window.addEventListener('pageshow', (event) => {
        if (event.persisted && state.isPlaying) {
          ensureAudioContext();
          requestScreenWakeLock();
        }
      });

      // Débloque immédiatement l'AudioContext au premier toucher si le navigateur l'a suspendu après un rechargement en rotation
      window.addEventListener('pointerdown', () => {
        if (state.isPlaying && audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }, { passive: true });

      function initApp() {
        initDynamicPWAManifest();
        requestScreenWakeLock();
        const hadSavedState = loadAppState(state);

        renderBeatDots();
        renderSubdivisionDots();
        renderPersoDrawer();
        syncControlsWithState();

        rafId = requestAnimationFrame(visualRenderLoop);

        if (hadSavedState && state.isPlaying) {
          startMetronome(true);
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
      } else {
        initApp();
      }
    })();
