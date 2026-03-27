import type { SignalAlert } from '../domain/types.js';
import type { TelegramNotificationMessage } from './operationalReminderService.js';

export interface TelegramAlertConfig {
  enabled: boolean;
  botToken?: string;
  chatId?: string;
  apiBaseUrl: string;
  appUrl?: string;
  nativeOpenerUrl?: string;
}

export interface TelegramAlertStatus {
  enabled: boolean;
  ready: boolean;
  chatConfigured: boolean;
  lastError?: string;
}

const TELEGRAM_SEND_TIMEOUT_MS = 10_000;

export class TelegramAlertService {
  private lastError: string | undefined;

  constructor(private readonly config: TelegramAlertConfig) {}

  private buildNativeOpenUrl(alertId: string): string | undefined {
    if (!this.config.nativeOpenerUrl) {
      return undefined;
    }

    try {
      const url = new URL(this.config.nativeOpenerUrl);
      url.searchParams.set('target', 'signals');
      url.searchParams.set('alertId', alertId);
      return url.toString();
    } catch {
      const separator = this.config.nativeOpenerUrl.includes('?') ? '&' : '?';
      return `${this.config.nativeOpenerUrl}${separator}target=signals&alertId=${encodeURIComponent(alertId)}`;
    }
  }

  status(): TelegramAlertStatus {
    return {
      enabled: this.config.enabled,
      ready: this.config.enabled && Boolean(this.config.botToken) && Boolean(this.config.chatId),
      chatConfigured: Boolean(this.config.chatId),
      lastError: this.lastError
    };
  }

  async notifySignalAlert(
    alert: SignalAlert,
    delivery: { reason?: 'initial' | 'reminder'; reminderCount?: number } = {}
  ): Promise<{ sent: boolean }> {
    const status = this.status();
    if (!status.ready) {
      return { sent: false };
    }

    const reminderLabel =
      delivery.reason === 'reminder' && (delivery.reminderCount ?? 0) > 0
        ? `Reminder ${delivery.reminderCount}`
        : null;
    const nativeOpenUrl = this.buildNativeOpenUrl(alert.alertId);
    const webSignalUrl = this.config.appUrl
      ? `${this.config.appUrl}/mobile/?tab=signals&alertId=${encodeURIComponent(alert.alertId)}`
      : undefined;
    const text = [
      reminderLabel ? `${reminderLabel}: ${alert.title}` : `${alert.title}`,
      `${alert.symbol} ${alert.side} • ${alert.setupType}`,
      typeof alert.candidate.finalScore === 'number' ? `Score: ${alert.candidate.finalScore.toFixed(1)}` : 'Score: --',
      reminderLabel ? `${reminderLabel}: still unacknowledged` : undefined,
      alert.riskDecision.allowed
        ? `Risk cleared at ${alert.riskDecision.finalRiskPct.toFixed(2)}%`
        : `Blocked: ${alert.riskDecision.reasonCodes.join(', ') || 'guardrail'}`,
      nativeOpenUrl ? `Open App: ${nativeOpenUrl}` : undefined,
      webSignalUrl ? `Open: ${webSignalUrl}` : undefined
    ]
      .filter(Boolean)
      .join('\n');

    const inlineKeyboard = [
      nativeOpenUrl ? { text: 'Open iPhone App', url: nativeOpenUrl } : null,
      webSignalUrl ? { text: 'Open Signal', url: webSignalUrl } : null
    ].filter(Boolean);

    return this.sendMessage(text, inlineKeyboard as Array<{ text: string; url: string }>);
  }

  async notifyGeneric(message: TelegramNotificationMessage): Promise<{ sent: boolean }> {
    const status = this.status();
    if (!status.ready) {
      return { sent: false };
    }

    const text = [message.title, ...(message.lines ?? [])].filter(Boolean).join('\n');
    return this.sendMessage(text, message.buttons ?? []);
  }

  private async sendMessage(
    text: string,
    buttons: Array<{ text: string; url: string }>
  ): Promise<{ sent: boolean }> {
    const response = await fetch(`${this.config.apiBaseUrl}/bot${this.config.botToken}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text,
        disable_web_page_preview: false,
        ...(buttons.length > 0
          ? {
              reply_markup: {
                inline_keyboard: [buttons]
              }
            }
          : {})
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.lastError = `Telegram send failed (${response.status})${body ? `: ${body}` : ''}`;
      throw new Error(this.lastError);
    }

    this.lastError = undefined;
    return { sent: true };
  }
}
