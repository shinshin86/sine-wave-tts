import {
  emotionPresets,
  supportedEmotions,
  type EmotionName,
} from "../presets/emotions.js";
import {
  speakerPresets,
  supportedSpeakers,
  type SpeakerName,
} from "../presets/speakers.js";

export interface VoiceStyle {
  id: number;
  speaker: SpeakerName;
  emotion: EmotionName;
}

export interface VoicevoxStyle {
  name: string;
  id: number;
  type: "talk";
}

export interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
  version: string;
  supported_features: {
    permitted_synthesis_morphing: "NOTHING";
  };
}

export const SERVER_VERSION = "0.1.0";

export const voiceStyles = Object.freeze(
  supportedSpeakers.flatMap((speaker, speakerIndex) =>
    supportedEmotions.map((emotion, emotionIndex) => ({
      id: speakerIndex * supportedEmotions.length + emotionIndex,
      speaker,
      emotion,
    })),
  ),
);

export function findVoiceStyle(id: number): VoiceStyle | undefined {
  return voiceStyles.find((style) => style.id === id);
}

export function nativeSpeakerList(): object[] {
  return supportedSpeakers.map((name) => {
    const preset = speakerPresets[name];
    return {
      name,
      baseTempo: preset.baseTempo,
      scale: {
        notes: preset.scale.length,
        minFrequencyHz: preset.scale[0],
        maxFrequencyHz: preset.scale.at(-1),
      },
      timbre: {
        harmonics: preset.timbre.harmonics,
        vibrato: preset.timbre.vibrato,
        adsr: preset.timbre.adsr,
        portamentoMs: preset.timbre.portamentoMs,
      },
    };
  });
}

export function nativeEmotionList(): object[] {
  return supportedEmotions.map((name) => ({
    ...emotionPresets[name],
    name,
  }));
}

export function voicevoxSpeakerList(): VoicevoxSpeaker[] {
  return supportedSpeakers.map((speaker, speakerIndex) => ({
    name: speaker,
    speaker_uuid: `c4e2d250-0000-4000-8000-${speakerIndex
      .toString(16)
      .padStart(12, "0")}`,
    styles: supportedEmotions.map((emotion, emotionIndex) => ({
      name: emotion,
      id: speakerIndex * supportedEmotions.length + emotionIndex,
      type: "talk",
    })),
    version: SERVER_VERSION,
    supported_features: {
      permitted_synthesis_morphing: "NOTHING",
    },
  }));
}
