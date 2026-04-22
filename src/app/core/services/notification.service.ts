import { computed, Injectable, signal } from '@angular/core';

export type NotificationTone = 'success' | 'error' | 'info';

export interface AppNotification {
  id: number;
  tone: NotificationTone;
  title: string;
  message: string;
  createdAt: number;
  unread: boolean;
  toastVisible: boolean;
}

interface NotificationOptions {
  durationMs?: number;
  title?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly items = signal<AppNotification[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private sequence = 0;

  readonly notifications = this.items.asReadonly();
  readonly activeToasts = computed(() => this.items().filter((item) => item.toastVisible).slice(0, 4));
  readonly unreadCount = computed(() => this.items().filter((item) => item.unread).length);

  success(message: string, title = 'Saved', options?: Omit<NotificationOptions, 'title'>): void {
    this.push('success', title, message, options);
  }

  error(message: string, title = 'Something went wrong', options?: Omit<NotificationOptions, 'title'>): void {
    this.push('error', title, message, options);
  }

  info(message: string, title = 'Notice', options?: Omit<NotificationOptions, 'title'>): void {
    this.push('info', title, message, options);
  }

  dismissToast(id: number): void {
    this.clearTimer(id);
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, toastVisible: false } : item)),
    );
  }

  markAllAsRead(): void {
    this.items.update((items) => items.map((item) => (item.unread ? { ...item, unread: false } : item)));
  }

  remove(id: number): void {
    this.clearTimer(id);
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  clearAll(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }

    this.items.set([]);
  }

  private push(tone: NotificationTone, title: string, message: string, options?: Omit<NotificationOptions, 'title'>): void {
    const id = ++this.sequence;
    const durationMs = options?.durationMs ?? (tone === 'error' ? 6500 : 4200);
    const notification: AppNotification = {
      id,
      tone,
      title,
      message,
      createdAt: Date.now(),
      unread: true,
      toastVisible: true,
    };

    this.items.update((items) => {
      const nextItems = [notification, ...items].slice(0, 12);
      const removedItems = items.filter((item) => !nextItems.some((nextItem) => nextItem.id === item.id));
      removedItems.forEach((item) => this.clearTimer(item.id));
      return nextItems;
    });

    this.timers.set(
      id,
      setTimeout(() => {
        this.dismissToast(id);
      }, durationMs),
    );
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.timers.delete(id);
  }
}
