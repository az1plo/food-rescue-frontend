import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BackendNotificationModel, BackendNotificationType, toBackendNotificationTone } from '../models/notification-inbox.model';
import { UserService } from './user.service';

interface BackendNotificationResponse {
  id: number;
  userId: number;
  type: BackendNotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationInboxService {
  private readonly http = inject(HttpClient);
  private readonly userService = inject(UserService);
  private readonly currentUser = this.userService.getUser();
  private readonly baseUrl = `${environment.beUrl}/notifications`;
  private readonly itemsState = signal<BackendNotificationModel[]>([]);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly errorMessageState = signal<string | null>(null);

  readonly notifications = this.itemsState.asReadonly();
  readonly recentNotifications = computed(() => this.itemsState().slice(0, 6));
  readonly unreadCount = computed(() => this.itemsState().filter((item) => !item.readAt).length);
  readonly loading = this.loadingState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly errorMessage = this.errorMessageState.asReadonly();

  constructor() {
    effect(
      () => {
        const user = this.currentUser();
        if (!user) {
          this.itemsState.set([]);
          this.loadingState.set(false);
          this.loadedState.set(false);
          this.errorMessageState.set(null);
          return;
        }

        this.refresh();
      },
      { allowSignalWrites: true },
    );
  }

  ensureLoaded(): void {
    if (!this.currentUser() || this.loadingState() || this.loadedState()) {
      return;
    }

    this.refresh();
  }

  refresh(): void {
    if (!this.currentUser()) {
      return;
    }

    this.loadingState.set(true);
    this.errorMessageState.set(null);

    this.http.get<BackendNotificationResponse[]>(this.baseUrl).subscribe({
      next: (notifications) => {
        if (!this.currentUser()) {
          return;
        }

        this.itemsState.set(this.normalizeNotifications(notifications));
        this.loadingState.set(false);
        this.loadedState.set(true);
      },
      error: () => {
        if (!this.currentUser()) {
          return;
        }

        this.loadingState.set(false);
        this.loadedState.set(true);
        this.errorMessageState.set('We could not load notifications right now.');
      },
    });
  }

  markAsRead(id: number): void {
    const notification = this.itemsState().find((item) => item.id === id);
    if (!notification || notification.readAt) {
      return;
    }

    this.setReadLocally([id], new Date().toISOString());

    this.http.post<BackendNotificationResponse>(`${this.baseUrl}/${id}/read`, null).subscribe({
      next: (updatedNotification) => {
        if (!this.currentUser()) {
          return;
        }

        this.upsertNotification(this.mapNotification(updatedNotification));
      },
      error: () => {
        this.refresh();
      },
    });
  }

  markAllAsRead(): void {
    const unreadNotifications = this.itemsState().filter((item) => !item.readAt);
    if (!unreadNotifications.length) {
      return;
    }

    this.setReadLocally(
      unreadNotifications.map((item) => item.id),
      new Date().toISOString(),
    );

    forkJoin(
      unreadNotifications.map((item) =>
        this.http.post<BackendNotificationResponse>(`${this.baseUrl}/${item.id}/read`, null).pipe(
          catchError(() => of<BackendNotificationResponse | null>(null)),
        ),
      ),
    ).subscribe({
      next: (updatedNotifications) => {
        if (!this.currentUser()) {
          return;
        }

        const failedUpdates = updatedNotifications.some((item) => item === null);
        if (failedUpdates) {
          this.refresh();
          return;
        }

        const normalizedUpdates = updatedNotifications
          .filter((item): item is BackendNotificationResponse => item !== null)
          .map((item) => this.mapNotification(item));

        this.itemsState.update((items) =>
          this.normalizeNotifications(
            items.map((item) => normalizedUpdates.find((updated) => updated.id === item.id) ?? item),
          ),
        );
      },
      error: () => {
        this.refresh();
      },
    });
  }

  private normalizeNotifications(notifications: BackendNotificationModel[] | BackendNotificationResponse[]): BackendNotificationModel[] {
    return notifications
      .map((notification) =>
        'tone' in notification
          ? notification
          : this.mapNotification(notification),
      )
      .sort((first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt));
  }

  private mapNotification(notification: BackendNotificationResponse): BackendNotificationModel {
    return {
      ...notification,
      readAt: notification.readAt ?? null,
      tone: toBackendNotificationTone(notification.type),
    };
  }

  private upsertNotification(notification: BackendNotificationModel): void {
    const existingIndex = this.itemsState().findIndex((item) => item.id === notification.id);
    if (existingIndex === -1) {
      this.itemsState.set(this.normalizeNotifications([notification, ...this.itemsState()]));
      return;
    }

    this.itemsState.update((items) =>
      this.normalizeNotifications(items.map((item) => (item.id === notification.id ? notification : item))),
    );
  }

  private setReadLocally(ids: number[], readAt: string): void {
    const unreadIds = new Set(ids);
    this.itemsState.update((items) =>
      items.map((item) =>
        unreadIds.has(item.id) && !item.readAt
          ? { ...item, readAt }
          : item,
      ),
    );
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
