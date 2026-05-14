import client from './client';
import type {
  CaseChatSummary,
  CaseChatUnreadCount,
  CaseMessage,
  CaseReadState,
  RelocationCase,
  SpecialistCaseNote,
} from '@reloplanner/shared-contracts';

export interface CreateCasePayload {
  title: string;
  profileId: string;
  additionalNotes?: string;
}

export async function listCases() {
  const res = await client.get<RelocationCase[]>('/cases');
  return res.data;
}

export async function getCase(caseId: string) {
  const res = await client.get<RelocationCase>(`/cases/${caseId}`);
  return res.data;
}

export async function createCase(payload: CreateCasePayload) {
  const res = await client.post<RelocationCase>('/cases', payload);
  return res.data;
}

export async function assignCaseToSelf(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/assign-self`);
  return res.data;
}

export async function submitCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/submit`);
  return res.data;
}

export async function archiveCase(caseId: string) {
  const res = await client.post<{ ok: boolean }>(`/cases/${caseId}/archive`);
  return res.data;
}

export async function unarchiveCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/unarchive`);
  return res.data;
}

export async function cancelCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/cancel`);
  return res.data;
}

export async function completeCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/complete`);
  return res.data;
}

export async function deleteCaseForCurrentUser(caseId: string) {
  const res = await client.delete<{ ok: boolean }>(`/cases/${caseId}`);
  return res.data;
}

export async function listCaseChats() {
  const res = await client.get<CaseChatSummary[]>('/cases/chats');
  return res.data;
}

export async function getCaseChatsUnreadCount() {
  const res = await client.get<CaseChatUnreadCount>('/cases/chats/unread-count');
  return res.data;
}

export async function assignSpecialist(caseId: string, specialistUserId: string) {
  const res = await client.post<RelocationCase>(`/admin/cases/${caseId}/assign`, {
    specialistUserId,
  });
  return res.data;
}

export async function reassignSpecialist(caseId: string, specialistUserId: string) {
  const res = await client.post<RelocationCase>(`/admin/cases/${caseId}/reassign`, {
    specialistUserId,
  });
  return res.data;
}

export async function listCaseMessages(caseId: string) {
  const res = await client.get<CaseMessage[]>(`/cases/${caseId}/messages`);
  return res.data;
}

export async function postCaseMessage(caseId: string, content: string) {
  const res = await client.post<CaseMessage>(`/cases/${caseId}/messages`, { content });
  return res.data;
}

export async function getCaseReadState(caseId: string) {
  const res = await client.get<CaseReadState[]>(`/cases/${caseId}/read-state`);
  return res.data;
}

export async function markCaseRead(caseId: string, lastReadMessageId?: string) {
  const res = await client.post(`/cases/${caseId}/read-state`, {
    lastReadMessageId,
  });
  return res.data as {
    caseId: string;
    userId: string;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
    unreadCount: number;
  };
}

export async function getSpecialistCaseNote(caseId: string) {
  const res = await client.get<SpecialistCaseNote>(`/internal/cases/${caseId}/specialist-note`);
  return res.data;
}

export async function updateSpecialistCaseNote(caseId: string, body: string) {
  const res = await client.put<SpecialistCaseNote>(`/internal/cases/${caseId}/specialist-note`, {
    body,
  });
  return res.data;
}
