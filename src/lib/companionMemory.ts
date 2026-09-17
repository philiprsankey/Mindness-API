import {
  ensureCompanionMemory,
  getCompanionMemory,
  replaceCompanionMemory,
  updateCompanionMemoryIfVersion,
} from './db';
import { getChatModel, getOpenAI } from './openai';

export type MemorySnapshot = {
  memory: string;
  version: number;
};

export type MemoryMessage = {
  role: string;
  content: string;
  createdAt?: string | null;
};

export function getMemorySnapshot(userId: string): MemorySnapshot {
  const row = ensureCompanionMemory(userId);
  return { memory: row.memory, version: row.version };
}

export function replaceMemory(userId: string, memory: string): MemorySnapshot {
  const row = replaceCompanionMemory(userId, memory);
  return { memory: row.memory, version: row.version };
}

export function eraseMemory(userId: string): MemorySnapshot {
  return replaceMemory(userId, '');
}

function parseMemoryTimestamp(value: string): Date {
  if (value.includes('T')) {
    return new Date(value);
  }

  return new Date(`${value.replace(' ', 'T')}Z`);
}

/** Absolute date label for memory bullets, e.g. Sep 12, 2026 */
export function formatMemoryDateLabel(value: string): string {
  const date = parseMemoryTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatConversationLine(
  userName: string,
  message: MemoryMessage,
): string {
  const speaker = message.role === 'user' ? userName : 'Companion';
  const dateLabel = message.createdAt
    ? formatMemoryDateLabel(message.createdAt)
    : '';
  const prefix = dateLabel ? `[${dateLabel}] ${speaker}` : speaker;
  return `${prefix}: ${message.content}`;
}

export function updateMemoryAsync(
  userName: string | null | undefined,
  recentMessages: MemoryMessage[],
  currentMemory: string,
  userId: string,
  memoryVersion: number,
): void {
  void (async () => {
    try {
      const name = userName?.trim() || 'the user';
      const chat = recentMessages
        .map((message) => formatConversationLine(name, message))
        .join('\n');

      const openai = getOpenAI();
      const result = await openai.chat.completions.create({
        model: getChatModel(),
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content: `You are a memory manager for a wellness companion app. Maintain a concise profile of the user so the companion remembers them across sessions.

Current memory:
${currentMemory || '(none yet)'}

Recent conversation (each line may include the date it was shared):
${chat}

Merge new facts into the profile. Use only these sections when they have content. Write short third-person bullet points.

## Identity
## Mental health & wellbeing
## Relationships
## Work & life stressors
## Patterns & preferences

Rules:
- Add new facts, update changed ones, remove outdated ones
- Never include what the companion said — only facts about the user
- For time-sensitive facts (events, moods, stressors, plans, recent situations), append an absolute date in parentheses using the conversation date, e.g. \`- Feeling anxious about a job interview (Sep 12, 2026)\`
- Stable long-term facts (names, preferences, identity) do not need dates unless they changed recently
- When a situation updates, replace the old bullet and use the newest date
- Keep existing date labels on unchanged facts
- Keep under 400 words
- Return ONLY the updated memory with section headers. No preamble.`,
          },
        ],
      });

      const updatedMemory = result.choices[0]?.message?.content?.trim() ?? '';
      if (!updatedMemory) return;

      const applied = updateCompanionMemoryIfVersion(
        userId,
        updatedMemory,
        memoryVersion,
      );
      if (!applied) {
        console.info('[memory] Update skipped: memory changed while extracting', userId);
      }
    } catch (error) {
      console.error('[memory] Update failed (non-fatal)', error);
    }
  })();
}

export function readMemoryForUser(userId: string): {
  memory: string;
  updatedAt: string | null;
} {
  const row = getCompanionMemory(userId);
  return {
    memory: row?.memory ?? '',
    updatedAt: row?.updatedAt ?? null,
  };
}
