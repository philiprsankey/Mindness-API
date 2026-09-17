import https from 'https';

/** Mindness preset avatar IDs mapped to Simli stock face IDs. */
const SIMLI_FACE_IDS: Record<
  string,
  {
    faceId: string;
    trinity: boolean;
  }
> = {
  f1: {
    faceId: 'cace3ef7-a4c4-425d-a8cf-a5358eb0c427',
    trinity: true,
  },
  m1: {
    faceId: 'dd10cb5a-d31d-4f12-b69f-6db3383c006e',
    trinity: true,
  },
};

export type SimliFaceConfig = {
  faceId: string;
  trinity: boolean;
};

export type SimliIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export function resolveSimliFaceConfig(
  avatarId: string | null | undefined,
): SimliFaceConfig | null {
  if (!avatarId) return null;
  return SIMLI_FACE_IDS[avatarId] ?? null;
}

export function resolveSimliFaceId(avatarId: string | null | undefined): string | null {
  return resolveSimliFaceConfig(avatarId)?.faceId ?? null;
}

export function supportsSimliAvatar(avatarId: string | null | undefined): boolean {
  return resolveSimliFaceConfig(avatarId) != null;
}

function httpsJsonRequest(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.simli.ai',
        path,
        method,
        headers: body
          ? { ...headers, 'Content-Length': body.length }
          : headers,
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
    if (body) req.write(body);
    req.end();
  });
}

export async function createSimliSessionToken(faceConfig: SimliFaceConfig): Promise<string> {
  const apiKey = process.env.SIMLI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('SIMLI_API_KEY is not configured');
  }

  const payload = Buffer.from(
    JSON.stringify({
      faceId: faceConfig.faceId,
      apiVersion: 'v2',
      handleSilence: false,
      maxSessionLength: 600,
      maxIdleTime: 180,
      audioInputFormat: 'pcm16',
    }),
    'utf8',
  );

  const response = await httpsJsonRequest(
    'POST',
    '/compose/token',
    {
      'x-simli-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    payload,
  );

  if (response.status !== 200) {
    let detail = response.body.slice(0, 240);
    try {
      const parsed = JSON.parse(response.body) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      // keep raw body
    }
    throw new Error(detail || `Simli session token failed (${response.status})`);
  }

  const parsed = JSON.parse(response.body) as { session_token?: string };
  if (!parsed.session_token?.trim()) {
    throw new Error('Simli session token response missing session_token');
  }

  return parsed.session_token.trim();
}

export async function getSimliIceServers(): Promise<SimliIceServer[]> {
  const apiKey = process.env.SIMLI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('SIMLI_API_KEY is not configured');
  }

  const response = await httpsJsonRequest('GET', '/compose/ice', {
    'x-simli-api-key': apiKey,
  });

  if (response.status !== 200) {
    throw new Error(`Simli ICE servers failed (${response.status})`);
  }

  const parsed = JSON.parse(response.body) as SimliIceServer[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  return parsed;
}
