import { DestroyRef, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  SupportChatHistoryMessagePayload,
  SupportChatMessageModel,
  SupportChatRequestPayload,
} from '../models/support-chat.model';
import { SupportChatApiService } from './support-chat-api.service';

const INITIAL_SUGGESTIONS = [
  'How do I pay for an offer?',
  'What does pickup time mean?',
  'How can a business publish offers?',
] as const;

@Injectable({
  providedIn: 'root',
})
export class SupportChatWidgetService {
  private readonly supportChatApi = inject(SupportChatApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isOpen = signal(false);
  readonly isSending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly assistantName = signal('Mika');
  readonly conversationId = signal<string | null>(null);
  readonly messages = signal<SupportChatMessageModel[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        "Hi, I'm Mika. I can help with orders, pickup timing, marketplace browsing, and business onboarding.",
      createdAt: new Date().toISOString(),
      suggestions: [...INITIAL_SUGGESTIONS],
    },
  ]);

  readonly hasMessages = computed(() => this.messages().length > 0);
  readonly launcherLabel = computed(() => (this.isOpen() ? 'Close support' : 'Support'));

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }

  sendMessage(rawContent: string): void {
    const content = rawContent.trim();
    if (!content || this.isSending()) {
      return;
    }

    this.errorMessage.set(null);
    this.open();

    const userMessage: SupportChatMessageModel = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    this.messages.update((messages) => [...messages, userMessage]);
    this.isSending.set(true);

    const payload: SupportChatRequestPayload = {
      conversationId: this.conversationId(),
      message: content,
      sourcePage: this.router.url,
      locale: document?.documentElement?.lang || 'sk',
      history: this.buildHistory(),
    };

    this.supportChatApi
      .sendMessage(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.conversationId.set(response.conversationId);
          this.assistantName.set(response.assistantName || 'Mika');
          this.messages.update((messages) => [
            ...messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: response.message,
              createdAt: response.generatedAt,
              suggestions: response.suggestions,
            },
          ]);
          this.isSending.set(false);
        },
        error: () => {
          this.errorMessage.set('Support is having trouble responding right now. Please try again in a moment.');
          this.messages.update((messages) => [
            ...messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content:
                'I could not reach the live support brain just now, but you can try again or ask about orders, pickup times, or business publishing.',
              createdAt: new Date().toISOString(),
              suggestions: [...INITIAL_SUGGESTIONS],
            },
          ]);
          this.isSending.set(false);
        },
      });
  }

  private buildHistory(): SupportChatHistoryMessagePayload[] {
    return this.messages()
      .slice(-8)
      .map((message) => ({
        role: message.role === 'assistant' ? 'ASSISTANT' : 'USER',
        content: message.content,
      }));
  }
}
