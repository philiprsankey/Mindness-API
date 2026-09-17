import crypto from 'crypto';
import https from 'https';
import { buildSystemPrompt } from './companion';
import type { Persona } from './db';

export function getRealtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1';
}

export function hashSafetyIdentifier(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex');
}

export function resolveRealtimeVoice(
  persona: Persona | null,
  premiumVoice: boolean,
): string {
  if (premiumVoice) {
    return process.env.OPENAI_REALTIME_VOICE_PREMIUM ?? 'marin';
  }

  if (!persona) {
    return process.env.OPENAI_REALTIME_VOICE ?? 'marin';
  }

  switch (persona.gender) {
    case 'male':
      return process.env.OPENAI_REALTIME_VOICE_MALE ?? 'echo';
    case 'female':
      return process.env.OPENAI_REALTIME_VOICE_FEMALE ?? 'marin';
    default:
      return process.env.OPENAI_REALTIME_VOICE ?? 'marin';
  }
}

export function buildRealtimeSessionConfig(options: {
  firstName: string | null;
  persona: Persona | null;
  memory?: string;
  premiumVoice: boolean;
}): Record<string, unknown> {
  const instructions = buildSystemPrompt(
    options.firstName,
    options.persona,
    options.memory,
  );

  const turnDetection = {
    type: 'server_vad',
    threshold: 0.7,
    prefix_padding_ms: 300,
    silence_duration_ms: 600,
    create_response: true,
    interrupt_response: true,
  };

  if (options.premiumVoice) {
    return {
      type: 'realtime',
      model: getRealtimeModel(),
      instructions,
      output_modalities: ['text'],
      audio: {
        input: {
          turn_detection: turnDetection,
        },
      },
    };
  }

  return {
    type: 'realtime',
    model: getRealtimeModel(),
    instructions,
    audio: {
      input: {
        turn_detection: turnDetection,
      },
      output: {
        voice: resolveRealtimeVoice(options.persona, false),
      },
    },
  };
}

export type EphemeralRealtimeToken = {
  value: string;
  expiresAt: string | null;
};

function httpsJsonPost(
  path: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
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
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function createEphemeralRealtimeToken(
  sessionConfig: Record<string, unknown>,
  safetyIdentifier: string,
): Promise<EphemeralRealtimeToken> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const body = Buffer.from(JSON.stringify({ session: sessionConfig }), 'utf8');
  const response = await httpsJsonPost(
    '/v1/realtime/client_secrets',
    {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyIdentifier,
    },
    body,
  );

  if (response.status !== 200) {
    throw new Error(response.body || `OpenAI Realtime token failed (${response.status})`);
  }

  const payload = JSON.parse(response.body) as {
    value?: string;
    expires_at?: string | number | null;
    client_secret?: {
      value?: string;
      expires_at?: string | number | null;
    };
  };

  const secretValue = payload.value ?? payload.client_secret?.value;
  if (!secretValue) {
    throw new Error('OpenAI Realtime token response missing value');
  }

  const expiresRaw = payload.expires_at ?? payload.client_secret?.expires_at ?? null;
  const expiresAt =
    expiresRaw == null
      ? null
      : typeof expiresRaw === 'number'
        ? new Date(expiresRaw * 1000).toISOString()
        : String(expiresRaw);

  return { value: secretValue, expiresAt };
}

function httpsRawSdpPost(ephemeralKey: string, sdpOffer: string): Promise<string> {
  const body = Buffer.from(sdpOffer, 'utf8');

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/realtime/calls',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          Accept: 'application/sdp',
          'Content-Type': 'application/sdp',
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text);
            return;
          }
          reject(new Error(text || `OpenAI Realtime call failed (${res.statusCode})`));
        });
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function connectRealtimeCall(
  sdpOffer: string,
  sessionConfig: Record<string, unknown>,
  safetyIdentifier: string,
): Promise<string> {
  const normalizedSdp = sdpOffer.endsWith('\n') ? sdpOffer : `${sdpOffer}\n`;

  const { value: ephemeralKey } = await createEphemeralRealtimeToken(
    sessionConfig,
    safetyIdentifier,
  );

  const answer = await httpsRawSdpPost(ephemeralKey, normalizedSdp);
  if (!answer.trim()) {
    throw new Error('OpenAI Realtime returned an empty SDP answer');
  }

  return answer;
}
