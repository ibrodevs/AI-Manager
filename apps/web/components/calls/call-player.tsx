"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, RotateCcw, RotateCw, Search } from "lucide-react";
import type { CallTurn } from "@all/db";
import { cn } from "@all/ui";
import { formatMs } from "@/lib/format";
import { isTyping } from "@/lib/use-hotkeys";

import { createCallPlayback, type PlaybackState } from "@/lib/call-playback";

/** Audio resources and every event listener are owned by this effect. */
export function useCallPlayback(_durationMs: number, audioUrl?: string) {
  const [state, setState] = React.useState<PlaybackState>({ pos: 0, playing: false, rate: 1, durationMs: 0, status: audioUrl ? "loading" : "unavailable", error: null });
  const controller = React.useRef<ReturnType<typeof createCallPlayback> | null>(null);
  React.useEffect(() => {
    const playback = createCallPlayback(audioUrl ? new Audio(audioUrl) : null);
    controller.current = playback;
    const sync = () => setState(playback.snapshot());
    const unsubscribe = playback.subscribe(sync);
    sync();
    return () => { unsubscribe(); playback.dispose(); controller.current = null; };
  }, [audioUrl]);
  const setPlaying = React.useCallback((playing: boolean) => { void controller.current?.setPlaying(playing); }, []);
  const seek = React.useCallback((ms: number) => controller.current?.seek(ms), []);
  const setRate = React.useCallback((rate: number) => controller.current?.setRate(rate), []);
  return { ...state, setPlaying, seek, setRate };
}

export type Playback = ReturnType<typeof useCallPlayback>;

export function CallPlayer({ turns, pb, compact }: { turns: CallTurn[]; durationMs: number; pb: Playback; compact?: boolean }) {
  const t = useTranslations("calls");
  const durationMs = pb.durationMs;
  // Space — пауза, ←/→ — 10 секунд
  React.useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || (e.target instanceof Element && e.target.closest("button, input, [role=slider]"))) return;
      if (e.code === "Space") { e.preventDefault(); pb.setPlaying(!pb.playing); }
      if (e.key === "ArrowLeft") { e.preventDefault(); pb.seek(pb.pos - 10_000); }
      if (e.key === "ArrowRight") { e.preventDefault(); pb.seek(pb.pos + 10_000); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pb, compact]);

  const bars = React.useMemo(() => waveform(turns, durationMs, compact ? 60 : 120), [turns, durationMs, compact]);
  const progress = durationMs ? pb.pos / durationMs : 0;

  return (
    <div className="flex flex-col gap-2" data-playback-status={pb.status}>
      <div className="flex items-center gap-2">
      {!compact && (
        <button type="button" onClick={() => pb.seek(pb.pos - 10_000)} aria-label={t("back10")} className="inline-flex size-7 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg"><RotateCcw className="size-3.5" /></button>
      )}
      <button type="button" disabled={pb.status === "unavailable" || pb.status === "error"} onClick={() => pb.setPlaying(!pb.playing)} aria-label={pb.playing ? t("pause") : t("play")}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4">
        {pb.playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
      </button>
      {!compact && (
        <button type="button" onClick={() => pb.seek(pb.pos + 10_000)} aria-label={t("fwd10")} className="inline-flex size-7 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg"><RotateCw className="size-3.5" /></button>
      )}
      <div className="relative h-8 min-w-0 flex-1 cursor-pointer" role="slider" aria-label="Позиция" aria-valuemin={0} aria-valuemax={durationMs} aria-valuenow={Math.round(pb.pos)} aria-valuetext={`${formatMs(pb.pos)} / ${formatMs(durationMs)}`} aria-disabled={pb.status !== "ready"} tabIndex={0}
        onKeyDown={(e) => {
          const target = e.key === "Home" ? 0 : e.key === "End" ? durationMs : e.key === "ArrowLeft" ? pb.pos - 5000 : e.key === "ArrowRight" ? pb.pos + 5000 : null;
          if (target !== null) { e.preventDefault(); e.stopPropagation(); pb.seek(target); }
        }}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); pb.seek(((e.clientX - r.left) / r.width) * durationMs); }}>
        <div className="absolute inset-0 flex items-center gap-px">
          {bars.map((b, i) => (
            <span key={i} className={cn("flex-1 rounded-full", b.speaker === "ai" ? "bg-violet-400" : b.speaker === "operator" ? "bg-warning" : b.speaker === "caller" ? "bg-teal-400" : "bg-line-strong",
              i / bars.length > progress && "opacity-35")} style={{ height: `${Math.round(Math.max(8, b.h * 100))}%` }} />
          ))}
        </div>
      </div>
      <span className="w-[76px] shrink-0 text-right text-xs tabular-nums text-fg-muted">{formatMs(pb.pos)} / {formatMs(durationMs)}</span>
      {(
        <button type="button" onClick={() => pb.setRate(pb.rate >= 2 ? 1 : pb.rate + 0.25)} aria-label={t("speed")}
          className="h-6 w-11 rounded-full border border-line text-xs tabular-nums text-fg-muted hover:text-fg">{pb.rate}×</button>
      )}
      </div>
      {(pb.status === "unavailable" || pb.status === "error" || pb.error) && <p role="status" className="text-xs text-fg-muted">{pb.status === "unavailable" ? t("audioUnavailable") : pb.error === "load" ? t("audioLoadError") : t("audioPlayError")}</p>}
    </div>
  );
}

function waveform(turns: CallTurn[], durationMs: number, n: number) {
  const out: { speaker?: CallTurn["speaker"]; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const at = (i / n) * durationMs;
    const turn = turns.find((t) => at >= t.startMs && at <= t.endMs);
    const seed = Math.sin(i * 12.9898 + (turn?.seq ?? 0) * 78.233) * 43758.5453;
    const h = turn ? 0.35 + (seed - Math.floor(seed)) * 0.65 : 0.08;
    out.push({ speaker: turn?.speaker, h });
  }
  return out;
}

/** Расшифровка: реплики с ролями и таймкодами, клик — перемотка, текущая подсвечена, поиск по тексту */
export function Transcript({ turns, pb, className }: { turns: CallTurn[]; pb: Playback; className?: string }) {
  const t = useTranslations("calls");
  const te = useTranslations("enums.speaker");
  const [q, setQ] = React.useState("");
  const listRef = React.useRef<HTMLOListElement>(null);
  const current = turns.findIndex((x) => pb.pos >= x.startMs && pb.pos < x.endMs);

  React.useEffect(() => {
    if (current < 0 || !pb.playing) return;
    listRef.current?.querySelector<HTMLElement>(`[data-seq="${turns[current]?.seq}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, pb.playing, turns]);

  const hl = (text: string) => {
    if (!q.trim()) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="rounded bg-[rgba(107,98,242,0.35)] text-fg">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };
  const visible = q.trim() ? turns.filter((x) => x.text.toLowerCase().includes(q.toLowerCase())) : turns;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <label className="relative mb-2 flex h-7 items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-fg-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchTranscript")}
          className="h-7 w-full rounded-full border border-line bg-transparent pl-7 pr-2 text-xs placeholder:text-fg-faint focus:border-fg-muted focus:outline-none" />
      </label>
      <ol ref={listRef} className="flex flex-col gap-0.5">
        {visible.map((x) => (
          <li key={x.seq} data-seq={x.seq}>
            <button type="button" onClick={() => { pb.seek(x.startMs); }} aria-current={x.seq === turns[current]?.seq ? "true" : undefined}
              className={cn("grid w-full grid-cols-[44px_64px_1fr] gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 hover:bg-hover",
                x.seq === turns[current]?.seq && "bg-selected")}>
              <span className="text-xs tabular-nums text-fg-faint">{formatMs(x.startMs)}</span>
              <span className={cn("text-xs", x.speaker === "ai" ? "text-violet-300 font-medium" : x.speaker === "operator" ? "text-warning" : "text-teal-300")}>{te(x.speaker)}</span>
              <span className="min-w-0">
                {hl(x.text)}
                {x.interrupted && <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 text-[10px] text-warning">{t("interrupted")}</span>}
                {x.latencyMs != null && <span className={cn("ml-1.5 text-[10px] tabular-nums", x.latencyMs > 1200 ? "text-danger" : x.latencyMs > 700 ? "text-warning" : "text-fg-faint")}>{x.latencyMs} мс</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
