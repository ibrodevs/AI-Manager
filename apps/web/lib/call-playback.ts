/** Native media is the only playback clock. No audio means no playback. */
export type PlaybackState = {
  pos: number; playing: boolean; rate: number; durationMs: number;
  status: "unavailable" | "loading" | "ready" | "error";
  error: "load" | "play" | null;
};

// Kept in the browser module, never used as server/request state.
let active: { audio: HTMLAudioElement; stop: () => void } | null = null;

export function createCallPlayback(audio: HTMLAudioElement | null) {
  let state: PlaybackState = { pos: 0, playing: false, rate: 1, durationMs: 0, status: audio ? "loading" : "unavailable", error: null };
  let disposed = false;
  let intent = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<PlaybackState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const metadata = () => {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    update({ durationMs: audio.duration * 1000, status: "ready", error: null });
  };
  const position = () => update({ pos: (audio?.currentTime ?? 0) * 1000 });
  const pause = () => {
    intent++;
    audio?.pause();
    if (active?.audio === audio) active = null;
    update({ playing: false });
  };
  const events: Record<string, () => void> = {
    loadedmetadata: metadata, durationchange: metadata, canplay: metadata,
    timeupdate: position, seeked: position,
    playing: () => {
      if (!audio) return;
      if (active?.audio !== audio) { audio.pause(); return; }
      update({ playing: true, error: null, status: "ready" });
    },
    pause: () => { if (active?.audio === audio) active = null; update({ playing: false }); },
    ended: () => { if (active?.audio === audio) active = null; update({ playing: false, pos: (audio?.duration ?? 0) * 1000 }); },
    error: () => { pause(); update({ status: "error", error: "load", pos: 0 }); },
  };
  if (audio) {
    audio.preload = "metadata";
    Object.entries(events).forEach(([name, handler]) => audio.addEventListener(name, handler));
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async setPlaying(value: boolean) {
      if (!value) { pause(); return; }
      if (!audio || disposed || state.error === "load") return;
      const request = ++intent;
      if (active && active.audio !== audio) active.stop();
      // Reserve the slot before awaiting play(), including pending play requests.
      active = { audio, stop: pause };
      if (audio.ended) audio.currentTime = 0;
      try {
        await audio.play();
        if (disposed || active?.audio !== audio) { audio.pause(); return; }
        if (request !== intent) return;
        metadata();
      } catch {
        if (disposed || request !== intent) return;
        if (active?.audio === audio) active = null;
        update({ playing: false, error: "play" });
      }
    },
    seek(ms: number) {
      if (!audio || !Number.isFinite(ms) || state.durationMs <= 0 || state.status === "error") return;
      audio.currentTime = Math.max(0, Math.min(state.durationMs, ms)) / 1000;
      position();
    },
    setRate(rate: number) {
      if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) return;
      if (audio) audio.playbackRate = rate;
      update({ rate });
    },
    dispose() {
      disposed = true;
      intent++;
      if (audio) {
        Object.entries(events).forEach(([name, handler]) => audio.removeEventListener(name, handler));
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (active?.audio === audio) active = null;
      listeners.clear();
    },
  };
}
