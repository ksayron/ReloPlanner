import client from './client';
import type { NotificationItem } from '@reloplanner/shared-contracts';

export async function listNotifications(limit = 50) {
  const res = await client.get<NotificationItem[]>('/notifications', {
    params: { limit },
  });
  return res.data;
}

export async function markNotificationRead(notificationId: string) {
  const res = await client.post<NotificationItem>(`/notifications/${notificationId}/read`);
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await client.post<{ ok: boolean }>('/notifications/read-all');
  return res.data;
}
