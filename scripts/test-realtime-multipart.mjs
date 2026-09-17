import 'dotenv/config';
import crypto from 'crypto';
import https from 'https';
import FormData from 'form-data';

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

// Minimal but structurally valid SDP (audio + datachannel like react-native-webrtc)
const SAMPLE_SDP = `v=0\r\no=- 7676478592587874368 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=audio 59331 UDP/TLS/RTP/SAVPF 111\r\nc=IN IP4 188.43.215.53\r\na=rtpmap:111 opus/48000/2\r\na=sendrecv\r\nm=application 55889 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 188.43.215.53\r\na=sctp-port:5000\r\n`;

const SESSION = JSON.stringify({
  type: 'realtime',
  model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1',
  audio: { output: { voice: 'marin' } },
});

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function manualMultipart(boundary, sdp, sessionJson) {
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="sdp"; filename="offer.sdp"\r\nContent-Type: application/sdp\r\n\r\n`,
    sdp,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="session"\r\nContent-Type: application/json\r\n\r\n`,
    sessionJson,
    `\r\n--${boundary}--\r\n`,
  ];
  return Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
}

async function testManualMultipart() {
  const boundary = `test${crypto.randomBytes(8).toString('hex')}`;
  const body = manualMultipart(boundary, SAMPLE_SDP, SESSION);
  return request(
    {
      hostname: 'api.openai.com',
      path: '/v1/realtime/calls',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/sdp',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    },
    body,
  );
}

async function testFormDataSubmit() {
  const form = new FormData();
  form.append('sdp', Buffer.from(SAMPLE_SDP, 'utf8'), {
    contentType: 'application/sdp',
    filename: 'offer.sdp',
  });
  form.append('session', Buffer.from(SESSION, 'utf8'), {
    contentType: 'application/json',
  });

  return new Promise((resolve, reject) => {
    form.submit(
      {
        protocol: 'https:',
        host: 'api.openai.com',
        path: '/v1/realtime/calls',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/sdp',
        },
      },
      (err, res) => {
        if (err) return reject(err);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
  });
}

async function testRawSdpWithEphemeral() {
  const tokenRes = await request(
    {
      hostname: 'api.openai.com',
      path: '/v1/realtime/client_secrets',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify({ session: JSON.parse(SESSION) })),
      },
    },
    Buffer.from(JSON.stringify({ session: JSON.parse(SESSION) })),
  );

  console.log('client_secrets status:', tokenRes.status);
  if (tokenRes.status !== 200) {
    console.log('client_secrets body:', tokenRes.body.slice(0, 500));
    return { status: 'skipped', body: 'no token' };
  }

  const parsed = JSON.parse(tokenRes.body);
  const ek = parsed.value ?? parsed.client_secret?.value;
  const sdpBody = Buffer.from(SAMPLE_SDP, 'utf8');

  return request(
    {
      hostname: 'api.openai.com',
      path: '/v1/realtime/calls',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ek}`,
        Accept: 'application/sdp',
        'Content-Type': 'application/sdp',
        'Content-Length': sdpBody.length,
      },
    },
    sdpBody,
  );
}

async function testNativeFetchMultipart() {
  const form = new FormData();
  form.append('sdp', Buffer.from(SAMPLE_SDP, 'utf8'), {
    contentType: 'application/sdp',
    filename: 'offer.sdp',
  });
  form.append('session', Buffer.from(SESSION, 'utf8'), {
    contentType: 'application/json',
  });

  const res = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/sdp',
      ...form.getHeaders(),
    },
    body: form,
  });

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: await res.text(),
  };
}

async function main() {
  const tests = [
    ['manual-multipart', testManualMultipart],
    ['form-data-submit', testFormDataSubmit],
    ['native-fetch-multipart', testNativeFetchMultipart],
    ['raw-sdp-ephemeral', testRawSdpWithEphemeral],
  ];

  for (const [name, fn] of tests) {
    console.log('\n===', name, '===');
    try {
      const result = await fn();
      console.log('status:', result.status);
      console.log('location:', result.headers?.location ?? result.headers?.Location ?? 'n/a');
      console.log('body preview:', result.body.slice(0, 400));
    } catch (error) {
      console.error('error:', error.message);
    }
  }
}

main();
