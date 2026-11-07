import { describe, it, expect, vi } from "vitest";
import { createCallPlayback } from "../lib/call-playback";

class Media extends EventTarget {
  currentTime = 0;
  duration = 42;
  ended = false;
  preload = "";
  playbackRate = 1;
  play = vi.fn(async () => { this.dispatchEvent(new Event("playing")); });
  pause = vi.fn(() => this.dispatchEvent(new Event("pause")));
  load = vi.fn();
  removeAttribute = vi.fn();
  event(name: string) { this.dispatchEvent(new Event(name)); }
}
const setup = () => {
  const media = new Media();
  const pb = createCallPlayback(media as unknown as HTMLAudioElement);
  return { media, pb };
};

describe("native call playback", () => {
  it("never advances or starts without a recording", async () => {
    const pb = createCallPlayback(null);
    await pb.setPlaying(true); pb.seek(10000);
    expect(pb.snapshot()).toMatchObject({ pos: 0, playing: false, status: "unavailable", durationMs: 0 });
    pb.dispose();
  });
  it("uses media metadata, position, pause, speed and ended events", async () => {
    const { media, pb } = setup();
    expect(pb.snapshot().playing).toBe(false);
    media.event("loadedmetadata");
    expect(pb.snapshot().durationMs).toBe(42000);
    await pb.setPlaying(true);
    media.currentTime = 3.25; media.event("timeupdate");
    expect(pb.snapshot()).toMatchObject({ playing: true, pos: 3250 });
    pb.setRate(1.75); expect(media.playbackRate).toBe(1.75);
    pb.seek(90000); expect(media.currentTime).toBe(42);
    pb.seek(-1000); expect(media.currentTime).toBe(0);
    await pb.setPlaying(false); expect(pb.snapshot().playing).toBe(false);
    await pb.setPlaying(true); expect(media.play).toHaveBeenCalledTimes(2);
    media.ended = true; media.event("ended");
    expect(pb.snapshot()).toMatchObject({ playing: false, pos: 42000 });
    await pb.setPlaying(true); expect(media.currentTime).toBe(0);
    pb.dispose();
  });
  it("pauses the previous recording when a second starts", async () => {
    const a = setup(), b = setup();
    await a.pb.setPlaying(true); await b.pb.setPlaying(true);
    expect(a.pb.snapshot().playing).toBe(false);
    expect(b.pb.snapshot().playing).toBe(true);
    a.pb.dispose(); b.pb.dispose();
  });
  it("exposes blocked playback and permits a deliberate retry", async () => {
    const { media, pb } = setup();
    media.play.mockRejectedValueOnce(new Error("NotAllowedError"));
    await pb.setPlaying(true);
    expect(pb.snapshot()).toMatchObject({ playing: false, pos: 0, error: "play" });
    await pb.setPlaying(true);
    expect(pb.snapshot()).toMatchObject({ playing: true, error: null });
    pb.dispose();
  });
  it("does not fake progress on a missing/undecodable file", async () => {
    const { media, pb } = setup(); media.event("error");
    await pb.setPlaying(true); pb.seek(5000);
    expect(media.play).not.toHaveBeenCalled();
    expect(pb.snapshot()).toMatchObject({ status: "error", error: "load", pos: 0, playing: false });
    pb.dispose();
  });
  it("removes listeners and releases media on unmount", () => {
    const { media, pb } = setup(), listener = vi.fn(); pb.subscribe(listener);
    pb.dispose(); media.currentTime = 8; media.event("timeupdate");
    expect(listener).not.toHaveBeenCalled(); expect(media.removeAttribute).toHaveBeenCalledWith("src"); expect(media.load).toHaveBeenCalledOnce();
  });
  it("ignores a rejected pending play after disposal", async () => {
    const { media, pb } = setup();
    let reject!: (e: Error) => void;
    media.play.mockImplementationOnce(() => new Promise<void>((_, r) => { reject = r; }));
    const play = pb.setPlaying(true); pb.dispose(); reject(new Error("aborted")); await play;
    expect(pb.snapshot().error).toBeNull();
  });
});
