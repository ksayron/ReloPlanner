import client from './client';
import type {
  CaseMessage,
  CaseReadState,
  RelocationCase,
} from '@reloplanner/shared-contracts';

export interface CreateCasePayload {
  title: string;
  description?: string;
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

export async function submitCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/submit`);
  return res.data;
}

export async function archiveCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/archive`);
  return res.data;
}

export async function cancelCase(caseId: string) {
  const res = await client.post<RelocationCase>(`/cases/${caseId}/cancel`);
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
