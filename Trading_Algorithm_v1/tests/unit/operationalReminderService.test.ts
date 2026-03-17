import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OperationalReminderService } from '../../src/services/operationalReminderService.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true }))
  );
});

describe('OperationalReminderService', () => {
  it('sends the Sunday reminder only once per local Sunday', async () => {
    const appCalls: Array<{ title: string; body: string; url?: string }> = [];
    const tgCalls: Array<{ title: string; lines?: string[]; buttons?: Array<{ text: string; url: string }> }> = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'operational-reminder-'));
    tempDirs.push(tempDir);

    const service = new OperationalReminderService(
      {
        enabled: true,
        timezone: 'America/Chicago',
        sundayHour: 16,
        sundayMinute: 30,
        checkIntervalMs: 60_000,
        statePath: path.join(tempDir, 'state.json'),
        appUrl: 'https://example.test',
        ibkrTargetUrl: 'https://example.test/console',
        ibkrMobileUrl: 'https://ndcdyn.interactivebrokers.com/sso/Login'
      },
      {
        notifyGeneric: async (message) => {
          appCalls.push({ title: message.title, body: message.body, url: message.url });
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      },
      {
        notifyGeneric: async (message) => {
          tgCalls.push({ title: message.title, lines: message.lines, buttons: message.buttons });
          return { sent: true };
        }
      }
    );

    const firstSend = await service.checkNow(new Date('2026-03-15T21:31:00.000Z'));
    const secondSend = await service.checkNow(new Date('2026-03-15T21:45:00.000Z'));

    expect(firstSend).toBe(true);
    expect(secondSend).toBe(false);
    expect(appCalls).toHaveLength(1);
    expect(appCalls[0].url).toBe('https://example.test/mobile/?tab=status&focus=ibkr-login');
    expect(tgCalls).toHaveLength(1);
    expect(tgCalls[0].buttons).toEqual([
      { text: 'Open Status', url: 'https://example.test/mobile/?tab=status&focus=ibkr-login' },
      { text: 'Last-Resort Website', url: 'https://ndcdyn.interactivebrokers.com/sso/Login' }
    ]);
    expect(service.status().lastSentAt).toBeTruthy();
  });

  it('sends a manual test reminder without waiting for Sunday', async () => {
    const appCalls: Array<{ title: string; url?: string }> = [];
    const tgCalls: Array<{ title: string; buttons?: Array<{ text: string; url: string }> }> = [];
    const reminderHooks: string[] = [];

    const service = new OperationalReminderService(
      {
        enabled: true,
        timezone: 'America/Chicago',
        sundayHour: 16,
        sundayMinute: 30,
        checkIntervalMs: 60_000,
        appUrl: 'https://example.test',
        ibkrTargetUrl: 'https://example.test/console',
        ibkrMobileUrl: 'https://ndcdyn.interactivebrokers.com/sso/Login'
      },
      {
        notifyGeneric: async (message) => {
          appCalls.push({ title: message.title, url: message.url });
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      },
      {
        notifyGeneric: async (message) => {
          tgCalls.push({ title: message.title, buttons: message.buttons });
          return { sent: true };
        }
      },
      async (kind) => {
        reminderHooks.push(kind);
      }
    );

    await service.sendTestReminder();

    expect(appCalls).toEqual([{ title: 'IBKR login reminder test', url: 'https://example.test/mobile/?tab=status&focus=ibkr-login' }]);
    expect(tgCalls).toEqual([
      {
        title: 'IBKR login reminder test',
        buttons: [
          { text: 'Open Status', url: 'https://example.test/mobile/?tab=status&focus=ibkr-login' },
          { text: 'Last-Resort Website', url: 'https://ndcdyn.interactivebrokers.com/sso/Login' }
        ]
      }
    ]);
    expect(reminderHooks).toEqual(['test']);
  });
});
