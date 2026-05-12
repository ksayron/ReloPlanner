import { AiRoutingService } from '../ai-routing.service';

describe('AiRoutingService', () => {
  const makeService = (env: Record<string, string> = {}) =>
    new AiRoutingService({
      get: (key: string) => env[key],
    } as any);

  it('uses default routing policy when env values are not set', () => {
    const service = makeService();
    const policy = service.getPolicy();
    expect(policy.defaults.EASY).toBe('OPENROUTER');
    expect(policy.defaults.REASONING).toBe('OPENAI');
    expect(policy.orders.EASY).toEqual(['OPENROUTER', 'OPENAI', 'MOCK']);
    expect(policy.orders.REASONING).toEqual(['OPENAI', 'OPENROUTER', 'MOCK']);
  });

  it('supports runtime provider changes by task grade', () => {
    const service = makeService();
    const updated = service.setDefaultProvider('REASONING', 'OPENROUTER');
    expect(updated.defaults.REASONING).toBe('OPENROUTER');
    expect(updated.orders.REASONING).toEqual(['OPENROUTER', 'OPENAI', 'MOCK']);
  });

  it('routes directly to mock when mock is selected as default', () => {
    const service = makeService();
    service.setDefaultProvider('EASY', 'MOCK');
    expect(service.resolveProviderOrder('EASY')).toEqual(['MOCK']);
  });
});
