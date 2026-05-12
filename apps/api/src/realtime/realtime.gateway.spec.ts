import { RealtimeGateway } from './realtime.gateway.js';

function createGateway() {
  const config = { getOrThrow: jest.fn() };
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const realtimeService = {
    attachServer: jest.fn(),
    buildEnvelope: jest.fn(),
  };

  return new RealtimeGateway(
    config as never,
    jwt as never,
    prisma as never,
    realtimeService as never,
  );
}

describe('RealtimeGateway', () => {
  it('joins case room when subscription is allowed', async () => {
    const gateway = createGateway();
    jest.spyOn(gateway as never, 'canAccessCase').mockResolvedValue(true);
    const client = {
      data: { user: { id: 'user-1', role: 'USER', email: 'u@x.dev' } },
      join: jest.fn(),
    } as never;

    const result = await gateway.subscribeCase(client, { caseId: 'case-1' });

    expect(result).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('case:case-1');
  });

  it('rejects case room subscription when permission check fails', async () => {
    const gateway = createGateway();
    jest.spyOn(gateway as never, 'canAccessCase').mockResolvedValue(false);
    const client = {
      data: { user: { id: 'user-1', role: 'USER', email: 'u@x.dev' } },
      join: jest.fn(),
    } as never;

    const result = await gateway.subscribeCase(client, { caseId: 'case-2' });

    expect(result).toEqual({ ok: false, error: 'No access to case' });
    expect(client.join).not.toHaveBeenCalled();
  });
});
