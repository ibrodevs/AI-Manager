import type { CallTurn } from "@all/db";
import scenarios from "./demo-scenarios.json";
import assets from "./demo-audio.generated.json";

/** Only measured, reviewed, licensed audio can appear in this manifest. */
export type DemoAudio = {
  audioUrl: string;
  durationMs: number;
  turns: CallTurn[];
  provider: "ElevenLabs";
  model: string;
  assembledAt: string;
  commercialLicense: true;
};
export const DEMO_RECORDINGS = scenarios.map((scenario) => {
  const audio = (assets as Record<string, DemoAudio>)[scenario.id];
  return { ...scenario, audio };
});
export type DemoRecordingData = (typeof DEMO_RECORDINGS)[number];
