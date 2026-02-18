/**
 * Audio analysis module
 */

export interface AudioSensitivity {
  bass: number;
  mid: number;
  treble: number;
}

export interface AudioAnalysisState {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  bassRaw: number;
  midRaw: number;
  trebleRaw: number;
  smoothBass: number;
  smoothMid: number;
  smoothTreble: number;
}

export interface AudioAnalyzer {
  initAudio: (stream: MediaStream) => Promise<void>;
  initAudioFromFile: (audioElement: HTMLAudioElement) => void;
  updateAudioAnalysis: () => AudioAnalysisState;
  getState: () => AudioAnalysisState;
  getSensitivity: () => AudioSensitivity;
  setReactivityEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

export function createAudioAnalyzer(): AudioAnalyzer {
  let audioContext: AudioContext | null = null;
  let audioAnalyser: AnalyserNode | null = null;
  let audioDataArray: Uint8Array<ArrayBuffer> | null = null;
  let audioSource: AudioNode | null = null;
  let audioEnabled: boolean = false;
  let audioReactivityEnabled: boolean = false;
  let mediaElementSource: MediaElementAudioSourceNode | null = null; // Cache to prevent InvalidStateError on re-connect
  let currentMediaStream: MediaStream | null = null; // Track for cleanup

  const audioSensitivity: AudioSensitivity = {
    bass: 1.0,
    mid: 1.0,
    treble: 1.0
  };

  const audioState: AudioAnalysisState = {
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    bassRaw: 0,
    midRaw: 0,
    trebleRaw: 0,
    smoothBass: 0,
    smoothMid: 0,
    smoothTreble: 0
  };

  const initAudio = async (stream: MediaStream): Promise<void> => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (audioSource) {
      audioSource.disconnect();
    }
    // Stop previous microphone tracks to release hardware
    if (currentMediaStream) {
      currentMediaStream.getTracks().forEach(t => t.stop());
    }
    currentMediaStream = stream;

    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    const bufferLength: number = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(audioAnalyser);

    audioEnabled = true;
    console.log('✓ Audio initialized with microphone');
  };

  const initAudioFromFile = (audioElement: HTMLAudioElement): void => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    if (audioSource) {
      audioSource.disconnect();
    }

    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    const bufferLength: number = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);

    // Reuse existing MediaElementSourceNode (can only be created once per element)
    if (!mediaElementSource) {
      mediaElementSource = audioContext.createMediaElementSource(audioElement);
    }
    audioSource = mediaElementSource;
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);

    audioEnabled = true;
    console.log('✓ Audio initialized from file');
  };

  const updateAudioAnalysis = (): AudioAnalysisState => {
    if (!audioEnabled || !audioAnalyser || !audioReactivityEnabled) {
      audioState.bass = audioState.mid = audioState.treble = audioState.energy = 0;
      return audioState;
    }

    audioAnalyser.getByteFrequencyData(audioDataArray!);
    const len: number = audioDataArray!.length;
    const bassEnd: number = Math.floor(len * 0.1);
    const midEnd: number = Math.floor(len * 0.4);

    let bassSum: number = 0, midSum: number = 0, trebleSum: number = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += audioDataArray![i];
    for (let i = bassEnd; i < midEnd; i++) midSum += audioDataArray![i];
    for (let i = midEnd; i < len; i++) trebleSum += audioDataArray![i];

    const bassAvg: number = bassSum / bassEnd / 255;
    const midAvg: number = midSum / (midEnd - bassEnd) / 255;
    const trebleAvg: number = trebleSum / (len - midEnd) / 255;

    const smoothFactor: number = 0.7;
    audioState.smoothBass = audioState.smoothBass * smoothFactor + bassAvg * (1 - smoothFactor);
    audioState.smoothMid = audioState.smoothMid * smoothFactor + midAvg * (1 - smoothFactor);
    audioState.smoothTreble = audioState.smoothTreble * smoothFactor + trebleAvg * (1 - smoothFactor);

    audioState.bassRaw = bassAvg;
    audioState.midRaw = midAvg;
    audioState.trebleRaw = trebleAvg;

    audioState.bass = Math.pow(audioState.smoothBass, 1.5) * audioSensitivity.bass;
    audioState.mid = Math.pow(audioState.smoothMid, 1.3) * audioSensitivity.mid;
    audioState.treble = Math.pow(audioState.smoothTreble, 1.2) * audioSensitivity.treble;
    audioState.energy = (audioState.bass + audioState.mid + audioState.treble) / 3;

    return audioState;
  };

  return {
    initAudio,
    initAudioFromFile,
    updateAudioAnalysis,
    getState: (): AudioAnalysisState => audioState,
    getSensitivity: (): AudioSensitivity => audioSensitivity,
    setReactivityEnabled: (enabled: boolean): void => { audioReactivityEnabled = enabled; },
    isEnabled: (): boolean => audioEnabled
  };
}
