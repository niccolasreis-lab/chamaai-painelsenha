import type { VignetteOccurrence } from '../shared/types';
import type { PlaybackResult } from './audioCallFlow';

export type VignetteAudioState = 'idle' | 'vignette_playing' | 'call_playing';

type VignetteAudioCoordinatorOptions = {
  playVignette: (occurrence: VignetteOccurrence) => Promise<PlaybackResult>;
  interruptAudio: () => void;
  onStateChange?: (state: VignetteAudioState) => void;
};

export class VignetteAudioCoordinator {
  private state: VignetteAudioState = 'idle';
  private pending: VignetteOccurrence[] = [];
  private activeVignette: VignetteOccurrence | null = null;
  private callGeneration = 0;
  private vignetteGeneration = 0;
  private destroyed = false;
  private readonly options: VignetteAudioCoordinatorOptions;

  constructor(options: VignetteAudioCoordinatorOptions) {
    this.options = options;
  }

  getState(): VignetteAudioState {
    return this.state;
  }

  getPending(): readonly VignetteOccurrence[] {
    return this.pending;
  }

  enqueue(occurrence: VignetteOccurrence): boolean {
    if (this.destroyed) return false;
    if (this.activeVignette?.schedule_id === occurrence.schedule_id) return false;
    const pendingIndex = this.pending.findIndex((item) => item.schedule_id === occurrence.schedule_id);
    if (pendingIndex >= 0) {
      if (occurrence.scheduled_for >= this.pending[pendingIndex].scheduled_for) return false;
      this.pending[pendingIndex] = occurrence;
      this.pending.sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for));
      return true;
    }
    this.pending.push(occurrence);
    this.pending.sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for));
    void this.drain();
    return true;
  }

  async startCall<T>(runCall: () => Promise<T>): Promise<T> {
    if (this.destroyed) throw new Error('Coordenador de áudio encerrado.');
    const generation = ++this.callGeneration;
    if (this.activeVignette) {
      const interrupted = this.activeVignette;
      this.pending = [
        interrupted,
        ...this.pending.filter((item) => item.schedule_id !== interrupted.schedule_id),
      ];
      this.activeVignette = null;
    }
    this.vignetteGeneration += 1;
    this.options.interruptAudio();
    this.setState('call_playing');
    try {
      return await runCall();
    } finally {
      if (!this.destroyed && generation === this.callGeneration) {
        this.setState('idle');
        void this.drain();
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.callGeneration += 1;
    this.vignetteGeneration += 1;
    this.pending = [];
    this.activeVignette = null;
    this.options.interruptAudio();
    this.setState('idle');
  }

  private async drain(): Promise<void> {
    if (this.destroyed || this.state !== 'idle' || this.pending.length === 0) return;
    const occurrence = this.pending.shift();
    if (!occurrence) return;
    const generation = ++this.vignetteGeneration;
    this.activeVignette = occurrence;
    this.setState('vignette_playing');
    try {
      await this.options.playVignette(occurrence);
    } finally {
      if (!this.destroyed && generation === this.vignetteGeneration) {
        this.activeVignette = null;
        this.setState('idle');
        void this.drain();
      }
    }
  }

  private setState(next: VignetteAudioState): void {
    if (this.state === next) return;
    this.state = next;
    this.options.onStateChange?.(next);
  }
}
