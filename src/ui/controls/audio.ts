/**
 * Audio toggle, microphone, file upload, play/pause/stop controls
 */

import type { UIControlsContext } from './types.ts';

export function initAudioControls(ctx: UIControlsContext): void {
  const { audioAnalyzer, i18n } = ctx;

  // Audio toggle
  const audioToggle = document.getElementById('audioToggle') as HTMLInputElement | null;
  if (audioToggle) {
    audioToggle.addEventListener('change', (e: Event) => {
      audioAnalyzer.setReactivityEnabled((e.target as HTMLInputElement).checked);
    });
  }

  // Microphone and file source buttons
  const useMicrophoneBtn: HTMLElement | null = document.getElementById('useMicrophoneBtn');
  const useAudioFileBtn: HTMLElement | null = document.getElementById('useAudioFileBtn');
  const audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement | null;
  const audioFileControls: HTMLElement | null = document.getElementById('audioFileControls');

  if (useMicrophoneBtn) {
    useMicrophoneBtn.addEventListener('click', async () => {
      try {
        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await audioAnalyzer.initAudio(stream);
        useMicrophoneBtn.classList.add('active');
        if (useAudioFileBtn) useAudioFileBtn.classList.remove('active');
        if (audioFileControls) audioFileControls.style.display = 'none';
      } catch (err: unknown) {
        console.error('Microphone access denied:', err);
        alert('Microphone access denied');
      }
    });
  }

  if (useAudioFileBtn && audioFileInput) {
    useAudioFileBtn.addEventListener('click', () => {
      audioFileInput.click();
    });

    audioFileInput.addEventListener('change', (e: Event) => {
      const file: File | undefined = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const audioElement = document.getElementById('audioElement') as HTMLAudioElement | null;
        const audioStatusLabel: HTMLElement | null = document.getElementById('audioStatusLabel');

        if (audioElement) {
          // Revoke previous blob URL to prevent memory leak
          if (audioElement.src && audioElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioElement.src);
          }
          const url: string = URL.createObjectURL(file);
          audioElement.src = url;
          audioAnalyzer.initAudioFromFile(audioElement);

          if (useMicrophoneBtn) useMicrophoneBtn.classList.remove('active');
          useAudioFileBtn.classList.add('active');
          if (audioFileControls) audioFileControls.style.display = 'block';
          if (audioStatusLabel) audioStatusLabel.textContent = file.name;
        }
      }
    });
  }

  // Play/pause and stop buttons
  const playPauseBtn: HTMLElement | null = document.getElementById('playPauseBtn');
  const stopAudioBtn: HTMLElement | null = document.getElementById('stopAudioBtn');
  const audioElement = document.getElementById('audioElement') as HTMLAudioElement | null;

  if (playPauseBtn && audioElement) {
    playPauseBtn.addEventListener('click', () => {
      if (audioElement.paused) {
        audioElement.play();
        const lang: string = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '⏸ Пауза' : '⏸ Pause';
      } else {
        audioElement.pause();
        const lang: string = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
      }
    });
  }

  if (stopAudioBtn && audioElement) {
    stopAudioBtn.addEventListener('click', () => {
      audioElement.pause();
      audioElement.currentTime = 0;
      const lang: string = i18n.getCurrentLang();
      if (playPauseBtn) playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
    });
  }
}
