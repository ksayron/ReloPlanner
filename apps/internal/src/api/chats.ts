import client from './client';
import type {
  DirectChatMessage,
  DirectChatParticipant,
  DirectChatThread,
} from '@reloplanner/shared-contracts';

export async function listDirectChatClients() {
  const res = await client.get<DirectChatParticipant[]>('/internal/chats/clients');
  return res.data;
}

export async function listDirectChatThreads() {
  const res = await client.get<DirectChatThread[]>('/internal/chats');
  return res.data;
}

export async function startDirectChat(clientUserId: string, specialistUserId?: string) {
  const res = await client.post<DirectChatThread>('/internal/chats/start', {
    clientUserId,
    specialistUserId,
  });
  return res.data;
}

export async function listDirectChatMessages(threadId: string) {
  const res = await client.get<DirectChatMessage[]>(`/internal/chats/${threadId}/messages`);
  return res.data;
}

export async function postDirectChatMessage(threadId: string, content: string) {
  const res = await client.post<DirectChatMessage>(`/internal/chats/${threadId}/messages`, {
    content,
  });
  return res.data;
}
