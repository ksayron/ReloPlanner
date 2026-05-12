import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@prisma/client';
import { PaymentProviderAdapter } from './payment-provider.interface.js';

export const PAYMENT_PROVIDER_ADAPTERS = Symbol('PAYMENT_PROVIDER_ADAPTERS');

@Injectable()
export class PaymentProviderRegistry {
  private readonly providersByName: Map<PaymentProvider, PaymentProviderAdapter>;

  constructor(
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER_ADAPTERS)
    providers: PaymentProviderAdapter[],
  ) {
    this.providersByName = new Map(
      providers.map((provider) => [provider.provider, provider]),
    );
  }

  resolveActiveProvider(): PaymentProviderAdapter {
    const raw = String(
      this.config.get<string>('PAYMENT_PROVIDER') ?? 'stripe',
    ).trim();
    const normalized = raw.toUpperCase();
    const providerName: PaymentProvider =
      normalized === 'STRIPE' ? 'STRIPE' : 'STRIPE';
    const provider = this.providersByName.get(providerName);
    if (!provider) {
      throw new Error(`Payment provider "${providerName}" is not registered.`);
    }
    return provider;
  }
}
