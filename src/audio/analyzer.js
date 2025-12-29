/**
 * Audio analysis module
 */

export function createAudioAnalyzer() {
  let audioContext = null;
  let audioAnalyser = null;
  let audioDataArray = null;
  let audioSource = null;
  let audioEnabled = false;
  let audioReactivityEnabled = false;

  const audioSensitivity = {
    bass: 1.0,
    mid: 1.0,
    treble: 1.0
  };

  const audioState = {
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

  const initAudio = async (stream) => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (audioSource) {
      audioSource.disconnect();
    }

    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    const bufferLength = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(audioAnalyser);

    audioEnabled = true;
    console.log('✓ Audio initialized with microphone');
  };

  const initAudioFromFile = (audioElement) => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioSource) {
      audioSource.disconnect();
    }

    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    const bufferLength = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaElementSource(audioElement);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);

    audioEnabled = true;
    console.log('✓ Audio initialized from file');
  };

  const updateAudioAnalysis = () => {
    if (!audioEnabled || !audioAnalyser || !audioReactivityEnabled) {
      audioState.bass = audioState.mid = audioState.treble = audioState.energy = 0;
      return audioState;
    }

    audioAnalyser.getByteFrequencyData(audioDataArray);
    const len = audioDataArray.length;
    const bassEnd = Math.floor(len * 0.1);
    const midEnd = Math.floor(len * 0.4);

    let bassSum = 0, midSum = 0, trebleSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += audioDataArray[i];
    for (let i = bassEnd; i < midEnd; i++) midSum += audioDataArray[i];
    for (let i = midEnd; i < len; i++) trebleSum += audioDataArray[i];

    const bassAvg = bassSum / bassEnd / 255;
    const midAvg = midSum / (midEnd - bassEnd) / 255;
    const trebleAvg = trebleSum / (len - midEnd) / 255;

    const smoothFactor = 0.7;
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
    getState: () => audioState,
    getSensitivity: () => audioSensitivity,
    setReactivityEnabled: (enabled) => { audioReactivityEnabled = enabled; },
    isEnabled: () => audioEnabled
  };
}
