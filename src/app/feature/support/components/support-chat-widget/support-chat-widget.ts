import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../shared/icons/app-icons';
import { SupportChatWidgetService } from '../../services/support-chat-widget.service';

@Component({
  selector: 'app-support-chat-widget',
  imports: [DatePipe, FontAwesomeModule],
  templateUrl: './support-chat-widget.html',
  styleUrl: './support-chat-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportChatWidgetComponent {
  private readonly supportChat = inject(SupportChatWidgetService);

  @ViewChild('messageList')
  private set messageList(element: ElementRef<HTMLDivElement> | undefined) {
    this.messageListRef = element;
    this.scheduleScrollToBottom('auto');
  }

  @ViewChild('composer')
  private set composer(element: ElementRef<HTMLTextAreaElement> | undefined) {
    this.composerRef = element;
    this.syncComposerHeight();
  }

  private messageListRef?: ElementRef<HTMLDivElement>;
  private composerRef?: ElementRef<HTMLTextAreaElement>;
  private scrollTimeoutId?: number;

  protected readonly icons = appIcons;
  protected readonly draft = signal('');
  protected readonly typingPhase = signal(0);
  protected readonly isOpen = this.supportChat.isOpen;
  protected readonly isSending = this.supportChat.isSending;
  protected readonly assistantName = this.supportChat.assistantName;
  protected readonly errorMessage = this.supportChat.errorMessage;
  protected readonly messages = this.supportChat.messages;
  protected readonly launcherLabel = this.supportChat.launcherLabel;

  constructor() {
    effect(() => {
      const isOpen = this.isOpen();
      const messageCount = this.messages().length;
      const isSending = this.isSending();

      if (!isOpen || (messageCount === 0 && !isSending)) {
        return;
      }

      this.scheduleScrollToBottom('smooth');
    });

    effect((onCleanup) => {
      if (!this.isSending()) {
        this.typingPhase.set(0);
        return;
      }

      this.typingPhase.set(0);

      const intervalId = window.setInterval(() => {
        this.typingPhase.update((phase) => (phase + 1) % 3);
      }, 260);

      onCleanup(() => window.clearInterval(intervalId));
    });
  }

  protected toggle(): void {
    this.supportChat.toggle();

    if (this.isOpen()) {
      queueMicrotask(() => {
        this.syncComposerHeight();
        this.focusComposer();
        this.scheduleScrollToBottom('auto');
      });
    }
  }

  protected close(): void {
    this.supportChat.close();
  }

  protected updateDraft(value: string): void {
    this.draft.set(value);
    this.syncComposerHeight();
  }

  protected submit(): void {
    const message = this.draft();
    if (!message.trim() || this.isSending()) {
      return;
    }

    this.supportChat.sendMessage(message);
    this.draft.set('');
    queueMicrotask(() => {
      this.syncComposerHeight();
      this.focusComposer();
    });
  }

  protected sendSuggestion(suggestion: string): void {
    if (this.isSending()) {
      return;
    }

    this.supportChat.sendMessage(suggestion);
    this.draft.set('');
    queueMicrotask(() => {
      this.syncComposerHeight();
      this.focusComposer();
    });
  }

  protected handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  private focusComposer(): void {
    this.composerRef?.nativeElement.focus();
  }

  private syncComposerHeight(): void {
    const composer = this.composerRef?.nativeElement;
    if (!composer) {
      return;
    }

    composer.style.height = 'auto';

    const computedStyle = window.getComputedStyle(composer);
    const maxHeight = Number.parseFloat(computedStyle.maxHeight);
    const borderHeight = Number.parseFloat(computedStyle.borderTopWidth) + Number.parseFloat(computedStyle.borderBottomWidth);
    const nextHeight = Number.isFinite(maxHeight)
      ? Math.min(composer.scrollHeight + borderHeight, maxHeight)
      : composer.scrollHeight + borderHeight;

    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }

  private scheduleScrollToBottom(behavior: ScrollBehavior): void {
    if (this.scrollTimeoutId !== undefined) {
      window.clearTimeout(this.scrollTimeoutId);
    }

    this.scrollTimeoutId = window.setTimeout(() => {
      this.scrollTimeoutId = undefined;
      this.scrollToBottom(behavior);
    }, 0);
  }

  private scrollToBottom(behavior: ScrollBehavior): void {
    const messageList = this.messageListRef?.nativeElement;
    if (!messageList) {
      return;
    }

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior,
    });
  }
}
