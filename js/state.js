export const MIN_BPM = 30;
export const MAX_BPM = 260;

export const state = {
    isPlaying: false,
    bpm: 120,
    mode: 'preset', // 'preset' | 'custom'
    presetBeats: 4,
    customBeatsCount: 6,
    customPattern: ['accent', 'normal', 'normal', 'accent', 'normal', 'normal'], // 'accent' | 'normal' | 'mute'
    subdivision: 4, // 1 = Noires, 2 = Croches, 4 = Doubles
    bipOn: true,
    crocheOn: true,
    haloOn: true,

    // Compteurs temps réel & horodatage pour continuité lors de rotation
    measureNumber: 0,
    currentBeatIndex: 0, // 0-indexed
    currentSubIndex: 0,
    lastTickTimestamp: 0
};