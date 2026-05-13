import type {
  RealtimeEnvelope,
  RealtimeEventName,
  Role,
} from '@reloplanner/shared-contracts';

export type { RealtimeEnvelope, RealtimeEventName };

export interface RealtimeUserContext {
  id: string;
  role: Role;
  email: string;
}
