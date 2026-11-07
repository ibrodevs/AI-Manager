import type { CallTurn } from "@all/db";
import scenarios from "./demo-scenarios.json";
import assets from "./demo-audio.generated.json";

/** Measured audio and transcripts. User-supplied assets do not assert an account plan or generation model. */
export type DemoAudio = {
  audioUrl: string;
  sha256: string;
  durationMs: number;
  turns: CallTurn[];
  provider: "ElevenLabs";
  model?: string;
  assembledAt?: string;
  commercialLicense?: true;
  source?: "user-provided";
  transcriptionModel?: string;
};
export const DEMO_RECORDINGS = scenarios.map((scenario) => {
  const audio = (assets as Record<string, DemoAudio>)[scenario.id];
  return { ...scenario, audio };
});
export type DemoRecordingData = (typeof DEMO_RECORDINGS)[number];
