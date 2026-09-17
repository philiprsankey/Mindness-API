import https from 'https';
import type { Persona } from './db';

export type ElevenLabsVoiceConfig = {
  voiceId: string;
  modelId: string;
};

type PersonaGender = Persona['gender'];
type PersonaOrigin = Persona['origin'];

/**
 * Curated ElevenLabs premade voices — verified against GET /v1/voices.
 * Legacy IDs (Rachel, James, Nicole, etc.) were removed from the default library.
 * Override any slot via env vars, e.g. ELEVENLABS_VOICE_AUSTRALIAN_MALE.
 */
const VOICE_MATRIX: Record<
  PersonaOrigin,
  Record<PersonaGender, string>
> = {
  british: {
    female: 'pFZP5JQG7iQjIQuC4Bku', // Lily
    male: 'onwK4e9ZLuTAKqWW03F9', // Daniel
    neutral: 'pFZP5JQG7iQjIQuC4Bku',
  },
  american: {
    female: 'cgSgspJ2msm6clMCkdW9', // Jessica
    male: 'pNInz6obpgDQGcFmaJgB', // Adam
    neutral: 'SAz9YHcvj6GT2YYXdXww', // River
  },
  australian: {
    female: 'XrExE9yKIg1WjnnlVkGX', // Matilda (no premade AU female; closest warm female)
    male: 'IKne3meq5aSn9XLyUdCD', // Charlie
    neutral: 'IKne3meq5aSn9XLyUdCD',
  },
  irish: {
    female: 'Xb7hH8MSUJpSbSDYk0k2', // Alice (British, closest match)
    male: 'JBFqnCBsd6RMkjVDRZzb', // George
    neutral: 'Xb7hH8MSUJpSbSDYk0k2',
  },
  scottish: {
    female: 'Xb7hH8MSUJpSbSDYk0k2', // Alice
    male: 'JBFqnCBsd6RMkjVDRZzb', // George
    neutral: 'Xb7hH8MSUJpSbSDYk0k2',
  },
  canadian: {
    female: 'EXAVITQu4vr4xnSDxMaL', // Sarah
    male: 'iP95p4xoKVk53GoZ742B', // Chris
    neutral: 'EXAVITQu4vr4xnSDxMaL',
  },
};

const FALLBACK_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam

const ENV_KEY: Record<PersonaOrigin, Record<PersonaGender, string>> = {
  british: {
    female: 'ELEVENLABS_VOICE_BRITISH_FEMALE',
    male: 'ELEVENLABS_VOICE_BRITISH_MALE',
    neutral: 'ELEVENLABS_VOICE_BRITISH_NEUTRAL',
  },
  american: {
    female: 'ELEVENLABS_VOICE_AMERICAN_FEMALE',
    male: 'ELEVENLABS_VOICE_AMERICAN_MALE',
    neutral: 'ELEVENLABS_VOICE_AMERICAN_NEUTRAL',
  },
  australian: {
    female: 'ELEVENLABS_VOICE_AUSTRALIAN_FEMALE',
    male: 'ELEVENLABS_VOICE_AUSTRALIAN_MALE',
    neutral: 'ELEVENLABS_VOICE_AUSTRALIAN_NEUTRAL',
  },
  irish: {
    female: 'ELEVENLABS_VOICE_IRISH_FEMALE',
    male: 'ELEVENLABS_VOICE_IRISH_MALE',
    neutral: 'ELEVENLABS_VOICE_IRISH_NEUTRAL',
  },
  scottish: {
    female: 'ELEVENLABS_VOICE_SCOTTISH_FEMALE',
    male: 'ELEVENLABS_VOICE_SCOTTISH_MALE',
    neutral: 'ELEVENLABS_VOICE_SCOTTISH_NEUTRAL',
  },
  canadian: {
    female: 'ELEVENLABS_VOICE_CANADIAN_FEMALE',
    male: 'ELEVENLABS_VOICE_CANADIAN_MALE',
    neutral: 'ELEVENLABS_VOICE_CANADIAN_NEUTRAL',
  },
};

function normalizeOrigin(origin: string | undefined): PersonaOrigin {
  const value = origin?.trim().toLowerCase();
  if (value && value in VOICE_MATRIX) {
    return value as PersonaOrigin;
  }
  return 'british';
}

function normalizeGender(gender: string | undefined): PersonaGender {
  if (gender === 'male' || gender === 'female' || gender === 'neutral') {
    return gender;
  }
  return 'neutral';
}

export function resolveElevenLabsVoice(persona: Persona | null): ElevenLabsVoiceConfig {
  const origin = normalizeOrigin(persona?.origin);
  const gender = normalizeGender(persona?.gender);
  const envVar = ENV_KEY[origin][gender];
  const voiceId =
    process.env[envVar]?.trim() || VOICE_MATRIX[origin][gender];

  return {
    voiceId,
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2',
  };
}

function httpsPostBinary(
  path: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function synthesizeElevenLabsSpeech(
  text: string,
  voice: ElevenLabsVoiceConfig,
  options?: { format?: 'mp3' | 'pcm_16000' },
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Text is required for speech synthesis');
  }

  const format = options?.format ?? 'mp3';
  const outputFormat = format === 'pcm_16000' ? 'pcm_16000' : 'mp3_44100_128';
  const accept = format === 'pcm_16000' ? 'audio/pcm' : 'audio/mpeg';

  const payload = Buffer.from(
    JSON.stringify({
      text: trimmed,
      model_id: voice.modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
    'utf8',
  );

  const response = await httpsPostBinary(
    `/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=${outputFormat}`,
    {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: accept,
    },
    payload,
  );

  if (response.status === 404 && voice.voiceId !== FALLBACK_VOICE_ID) {
    const bodyText = response.body.toString('utf8');
    if (bodyText.includes('voice_not_found')) {
      console.warn(
        `[elevenlabs] voice ${voice.voiceId} not found, falling back to ${FALLBACK_VOICE_ID}`,
      );
      return synthesizeElevenLabsSpeech(text, {
        ...voice,
        voiceId:
          process.env.ELEVENLABS_FALLBACK_VOICE_ID?.trim() || FALLBACK_VOICE_ID,
      }, options);
    }
  }

  if (response.status !== 200) {
    const message = response.body.toString('utf8').slice(0, 240);
    throw new Error(message || `ElevenLabs TTS failed (${response.status})`);
  }

  return response.body;
}
