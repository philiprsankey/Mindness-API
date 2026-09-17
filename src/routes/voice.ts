import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  createConversation,
  getConversation,
  getUser,
  insertMessage,
  listConversations,
  listMessages,
  parsePersonaJson,
  updateConversationTitle,
} from '../lib/db';
import { getMemorySnapshot, updateMemoryAsync } from '../lib/companionMemory';
import {
  resolveElevenLabsVoice,
  synthesizeElevenLabsSpeech,
} from '../lib/elevenLabsVoice';
import {
  buildRealtimeSessionConfig,
  connectRealtimeCall,
  hashSafetyIdentifier,
} from '../lib/realtimeSession';
import {
  createSimliSessionToken,
  getSimliIceServers,
  resolveSimliFaceId,
  resolveSimliFaceConfig,
  supportsSimliAvatar,
} from '../lib/simli';
import {
  getEffectiveSubscriptionTier,
  getTierFeatures,
} from '../lib/subscription';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const voiceRouter = Router();

voiceRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function voiceAccessDenied(res: Response, tier: string) {
  res.status(402).json({
    error: 'Voice mode requires a Companion plan',
    message: 'Upgrade to Companion for real-time voice chat with your companion.',
    tier,
  });
}

voiceRouter.post('/voice/realtime/connect', async (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.voice) {
    voiceAccessDenied(res, tier);
    return;
  }

  const sdpOffer =
    typeof req.body?.sdp === 'string' ? req.body.sdp.trim() : '';
  if (!sdpOffer.startsWith('v=')) {
    res.status(400).json({ error: 'Missing or invalid SDP offer' });
    return;
  }

  const persona = parsePersonaJson(user?.personaJson ?? null);
  const memorySnapshot = features.deepMemory
    ? getMemorySnapshot(userId)
    : { memory: '', version: 0 };

  const sessionConfig = buildRealtimeSessionConfig({
    firstName: user?.firstName ?? null,
    persona,
    memory: features.deepMemory ? memorySnapshot.memory : undefined,
    premiumVoice: features.premiumVoice,
  });

  try {
    const answerSdp = await connectRealtimeCall(
      sdpOffer,
      sessionConfig,
      hashSafetyIdentifier(userId),
    );
    if (!answerSdp.trim().startsWith('v=')) {
      console.error('[voice/realtime/connect] invalid answer SDP', answerSdp.slice(0, 120));
      res.status(502).json({ error: 'Voice session returned an invalid answer' });
      return;
    }
    const voiceMode = features.premiumVoice ? 'elevenlabs' : 'openai';
    const payload: Record<string, unknown> = {
      sdp: answerSdp,
      voiceMode,
    };

    if (features.premiumVoice) {
      if (!process.env.ELEVENLABS_API_KEY?.trim()) {
        res.status(503).json({
          error: 'Premium voice is not configured yet. Please try again later.',
        });
        return;
      }
      payload.elevenLabs = resolveElevenLabsVoice(persona);
    }

    if (features.animatedAvatar && persona && supportsSimliAvatar(persona.avatarId)) {
      if (!process.env.SIMLI_API_KEY?.trim()) {
        res.status(503).json({
          error: 'Animated avatar is not configured yet. Please try again later.',
        });
        return;
      }
      payload.simli = {
        avatarId: persona.avatarId,
        faceId: resolveSimliFaceId(persona.avatarId),
        isTrinity: resolveSimliFaceConfig(persona.avatarId)?.trinity ?? false,
      };
    }

    console.log(
      `[voice/realtime/connect] ok mode=${voiceMode} offer=${sdpOffer.length}b answer=${answerSdp.length}b`,
    );
    res.json(payload);
  } catch (error) {
    console.error('[voice/realtime/connect]', error);
    const message =
      error instanceof Error && error.message.includes('invalid')
        ? 'Could not start a realtime voice session. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Could not start a realtime voice session. Please try again.';
    res.status(502).json({ error: message });
  }
});

type FinalizeTurn = {
  role: 'user' | 'assistant';
  content: string;
};

voiceRouter.post('/voice/elevenlabs/speak', async (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.voice) {
    voiceAccessDenied(res, tier);
    return;
  }

  if (!features.premiumVoice) {
    res.status(402).json({
      error: 'Natural accents require Companion+',
      message: 'Upgrade to Companion+ for ElevenLabs voice accents.',
      tier,
    });
    return;
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Missing text' });
    return;
  }

  const format =
    req.body?.format === 'pcm_16000' || req.query.format === 'pcm_16000'
      ? 'pcm_16000'
      : 'mp3';

  const persona = parsePersonaJson(user?.personaJson ?? null);
  const voice = resolveElevenLabsVoice(persona);

  try {
    const audio = await synthesizeElevenLabsSpeech(text, voice, {
      format: format === 'pcm_16000' ? 'pcm_16000' : 'mp3',
    });
    res.setHeader(
      'Content-Type',
      format === 'pcm_16000' ? 'audio/pcm' : 'audio/mpeg',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (error) {
    console.error('[voice/elevenlabs/speak]', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not synthesize premium voice audio',
    });
  }
});

voiceRouter.post('/voice/simli/session', async (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.animatedAvatar) {
    res.status(402).json({
      error: 'Animated avatar requires Companion+',
      message: 'Upgrade to Companion+ for animated voice avatars.',
      tier,
    });
    return;
  }

  if (!process.env.SIMLI_API_KEY?.trim()) {
    res.status(503).json({ error: 'Animated avatar is not configured yet.' });
    return;
  }

  const persona = parsePersonaJson(user?.personaJson ?? null);
  const faceConfig = resolveSimliFaceConfig(persona?.avatarId);
  if (!faceConfig) {
    res.status(400).json({
      error: 'This companion avatar does not support animated voice yet.',
    });
    return;
  }

  try {
    const [sessionToken, iceServers] = await Promise.all([
      createSimliSessionToken(faceConfig),
      getSimliIceServers(),
    ]);
    res.json({
      sessionToken,
      iceServers,
      faceId: faceConfig.faceId,
      avatarId: persona?.avatarId ?? null,
      isTrinity: faceConfig.trinity,
    });
  } catch (error) {
    console.error('[voice/simli/session]', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'Could not start animated avatar session',
    });
  }
});

voiceRouter.post('/voice/realtime/finalize', (req, res) => {
  const userId = getUserId(req);
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const features = getTierFeatures(tier);

  if (!features.voice) {
    voiceAccessDenied(res, tier);
    return;
  }

  const rawTurns = Array.isArray(req.body?.turns) ? req.body.turns : [];
  const turns: FinalizeTurn[] = rawTurns
    .map((turn: unknown) => {
      if (!turn || typeof turn !== 'object') return null;
      const record = turn as Record<string, unknown>;
      const role = record.role;
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      if ((role !== 'user' && role !== 'assistant') || !content) return null;
      return { role, content };
    })
    .filter((turn: FinalizeTurn | null): turn is FinalizeTurn => turn !== null);

  if (turns.length === 0) {
    res.json({ ok: true, saved: 0 });
    return;
  }

  let conversationId =
    typeof req.body?.conversationId === 'number' ? req.body.conversationId : null;

  if (conversationId) {
    const existing = getConversation(userId, conversationId);
    if (!existing) {
      conversationId = null;
    }
  }

  if (!conversationId) {
    const existing = listConversations(userId)[0];
    if (existing) {
      conversationId = existing.id;
    } else {
      const firstUserTurn = turns.find((turn) => turn.role === 'user');
      const title = firstUserTurn?.content.slice(0, 48).trim() || 'Voice conversation';
      conversationId = createConversation(userId, title).id;
    }
  }

  const hadMessages = listMessages(conversationId!).length > 0;

  for (const turn of turns) {
    insertMessage(conversationId!, turn.role, turn.content);
  }

  if (!hadMessages) {
    const firstUserTurn = turns.find((turn) => turn.role === 'user');
    const title = firstUserTurn?.content.slice(0, 48).trim();
    if (title) {
      updateConversationTitle(conversationId!, title);
    }
  }

  if (features.deepMemory && turns.length > 0) {
    const memorySnapshot = getMemorySnapshot(userId);
    const sessionAt = new Date().toISOString();

    updateMemoryAsync(
      user?.firstName ?? null,
      turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        createdAt: sessionAt,
      })),
      memorySnapshot.memory,
      userId,
      memorySnapshot.version,
    );
  }

  res.json({ ok: true, saved: turns.length, conversationId });
});
