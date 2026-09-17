import type { Request } from 'express';
import { Router } from 'express';
import {
  countUserMessagesToday,
  createConversation,
  deleteAllConversations,
  getConversation,
  getUser,
  insertMessage,
  listConversations,
  listMessages,
  parsePersonaJson,
  updateConversationTitle,
} from '../lib/db';
import { CRISIS_PATTERN } from '../lib/crisis';
import { buildSystemPrompt } from '../lib/companion';
import { getMemorySnapshot, updateMemoryAsync } from '../lib/companionMemory';
import {
  getDailyMessageLimit,
  getEffectiveSubscriptionTier,
  getTierFeatures,
  isMessageLimitReached,
} from '../lib/subscription';
import { getChatModel, getOpenAI } from '../lib/openai';
import { attachUserId, requireAuth } from '../middleware/requireAuth';

export const chatRouter = Router();

chatRouter.use(requireAuth, attachUserId);

function getUserId(req: Request): string {
  return req.userId!;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildChatUsage(userId: string) {
  const user = getUser(userId);
  const tier = user ? getEffectiveSubscriptionTier(user) : 'free';
  const usedToday = countUserMessagesToday(userId);
  const dailyLimit = getDailyMessageLimit(tier);
  return {
    tier,
    dailyLimit,
    usedToday,
    remainingToday:
      dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday),
  };
}

chatRouter.get('/chat/usage', (req, res) => {
  res.json(buildChatUsage(getUserId(req)));
});

chatRouter.get('/openai/conversations', (req, res) => {
  const userId = getUserId(req);
  res.json(listConversations(userId));
});

chatRouter.delete('/openai/conversations', (req, res) => {
  const userId = getUserId(req);
  deleteAllConversations(userId);
  res.sendStatus(204);
});

chatRouter.post('/openai/conversations', (req, res) => {
  const userId = getUserId(req);
  const title =
    typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 80)
      : 'New conversation';
  const conversation = createConversation(userId, title);
  res.status(201).json(conversation);
});

chatRouter.get('/openai/conversations/:id/messages', (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid conversation id' });
    return;
  }
  const conversation = getConversation(userId, id);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json(listMessages(id));
});

chatRouter.post('/openai/conversations/:id/messages', async (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);
  const content =
    typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  if (!id) {
    res.status(400).json({ error: 'Invalid conversation id' });
    return;
  }
  if (!content) {
    res.status(400).json({ error: 'Message content is required' });
    return;
  }

  const userRow = getUser(userId);
  const tier = userRow ? getEffectiveSubscriptionTier(userRow) : 'free';
  const dailyLimit = getDailyMessageLimit(tier);
  const usedToday = countUserMessagesToday(userId);
  if (isMessageLimitReached(tier, usedToday)) {
    res.status(402).json({
      error: 'Free tier limit reached',
      message: `You've used your ${dailyLimit} free messages for today. Upgrade coming soon for unlimited chat.`,
      tier,
      dailyLimit,
      usedToday,
    });
    return;
  }

  const conversation = getConversation(userId, id);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const priorMessages = listMessages(id);
  insertMessage(id, 'user', content);

  const persona = parsePersonaJson(userRow?.personaJson ?? null);
  const firstName = userRow?.firstName ?? null;
  const features = getTierFeatures(tier);
  const memorySnapshot = features.deepMemory
    ? getMemorySnapshot(userId)
    : { memory: '', version: 0 };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (CRISIS_PATTERN.test(content)) {
    res.write(`data: ${JSON.stringify({ crisis: true })}\n\n`);
  }

  let fullResponse = '';
  const userMessageAt = new Date().toISOString();

  try {
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model: getChatModel(),
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(
            firstName,
            persona,
            features.deepMemory ? memorySnapshot.memory : undefined,
          ),
        },
        ...priorMessages.map((message) => ({
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
        })),
        { role: 'user', content },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    insertMessage(id, 'assistant', fullResponse || ' ');

    if (priorMessages.length === 0) {
      const title = content.slice(0, 48).trim();
      if (title) {
        updateConversationTitle(id, title);
        res.write(`data: ${JSON.stringify({ title })}\n\n`);
      }
    }

    res.write(
      `data: ${JSON.stringify({
        done: true,
        usage: buildChatUsage(userId),
      })}\n\n`,
    );
    res.end();

    if (features.deepMemory && fullResponse.trim()) {
      updateMemoryAsync(
        firstName,
        [
          ...priorMessages.slice(-6).map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
          { role: 'user', content, createdAt: userMessageAt },
          {
            role: 'assistant',
            content: fullResponse,
            createdAt: new Date().toISOString(),
          },
        ],
        memorySnapshot.memory,
        userId,
        memorySnapshot.version,
      );
    }
  } catch (error) {
    console.error('Chat stream failed', error);
    const fallback = "I'm having trouble responding right now. Please try again in a moment.";
    if (!fullResponse) {
      insertMessage(id, 'assistant', fallback);
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});
