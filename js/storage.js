 /* ------------------------------------------------------------------------
	3. ÉTAT GLOBAL DE L'APPLICATION & PERSISTANCE ROTATION / RECHARGEMENT
	------------------------------------------------------------------------ */

	const STORAGE_KEY = 'flashbeat_state_v1';

	export function saveAppState(state) {
        try {
          const snapshot = {
            bpm: state.bpm,
            signature: state.mode === 'custom' ? 'perso' : `${state.presetBeats}/4`,
            mode: state.mode,
            presetBeats: state.presetBeats,
            customBeats: state.customBeatsCount,
            customAccents: state.customPattern.slice(0, 16),
            subdivision: state.subdivision,
            bipOn: state.bipOn,
            crocheOn: state.crocheOn,
            haloOn: state.haloOn,
            isPlaying: state.isPlaying,
            currentMeasure: state.measureNumber,
            currentBeat: state.currentBeatIndex,
            lastTickTimestamp: state.lastTickTimestamp || Date.now()
          };
          const serialized = JSON.stringify(snapshot);
          sessionStorage.setItem(STORAGE_KEY, serialized);
          localStorage.setItem(STORAGE_KEY, serialized);
        } catch (err) {
          // Ignorer si le stockage est restreint
        }
      }

      export function loadAppState(state) {
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
          if (!raw) return false;
          const saved = JSON.parse(raw);
          if (!saved || typeof saved !== 'object') return false;

          if (typeof saved.bpm === 'number') {
            state.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(saved.bpm)));
          }
          if (saved.mode === 'custom' || saved.mode === 'preset') {
            state.mode = saved.mode;
          }
          if (typeof saved.presetBeats === 'number' && [2, 3, 4, 5].includes(saved.presetBeats)) {
            state.presetBeats = saved.presetBeats;
          }
          if (typeof saved.customBeats === 'number') {
            state.customBeatsCount = Math.min(16, Math.max(1, Math.round(saved.customBeats)));
          }
          if (Array.isArray(saved.customAccents) && saved.customAccents.length > 0) {
            state.customPattern = saved.customAccents.slice(0, 16).map((item) =>
              ['accent', 'normal', 'mute'].includes(item) ? item : 'normal'
            );
          }
          if ([1, 2, 4].includes(saved.subdivision)) {
            state.subdivision = saved.subdivision;
          }
          if (typeof saved.bipOn === 'boolean') state.bipOn = saved.bipOn;
          if (typeof saved.crocheOn === 'boolean') state.crocheOn = saved.crocheOn;
          if (typeof saved.haloOn === 'boolean') state.haloOn = saved.haloOn;
          if (typeof saved.isPlaying === 'boolean') state.isPlaying = saved.isPlaying;

          const totalBeats = state.mode === 'custom' ? state.customBeatsCount : state.presetBeats;
          let restoredMeasure = typeof saved.currentMeasure === 'number' ? Math.max(0, saved.currentMeasure) : 0;
          let restoredBeat = typeof saved.currentBeat === 'number' ? Math.max(0, saved.currentBeat % totalBeats) : 0;

          // Si la WebView a rechargé la page pendant la lecture lors d'une rotation,
          // recalcule la mesure et le temps exacts écoulés depuis le dernier tick
          if (state.isPlaying && typeof saved.lastTickTimestamp === 'number' && saved.lastTickTimestamp > 0) {
            const elapsedMs = Math.max(0, Date.now() - saved.lastTickTimestamp);
            const beatDurationMs = 60000 / state.bpm;
            const elapsedBeats = Math.floor(elapsedMs / beatDurationMs);
            if (elapsedBeats > 0) {
              const absoluteBeat = restoredMeasure * totalBeats + restoredBeat + elapsedBeats;
              restoredMeasure = Math.floor(absoluteBeat / totalBeats);
              restoredBeat = absoluteBeat % totalBeats;
            }
          }

          state.measureNumber = restoredMeasure;
          state.currentBeatIndex = restoredBeat;
          state.lastTickTimestamp = typeof saved.lastTickTimestamp === 'number' ? saved.lastTickTimestamp : 0;
          return true;
        } catch (err) {
          return false;
        }
      }