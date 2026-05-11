import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BillingController } from './billing.controller.js';
import { BillingWebhookController } from './billing-webhook.controller.js';
import { BillingDevOutcomeService } from './billing-dev-outcome.service.js';
import { BillingService } from './billing.service.js';
import { EntitlementService } from './entitlement.service.js';
import {
  PAYMENT_PROVIDER_ADAPTERS,
  PaymentProviderRegistry,
} from './payment-provider.registry.js';
import { StripePaymentProvider } from './providers/stripe-payment.provider.js';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    EntitlementService,
    BillingDevOutcomeService,
    StripePaymentProvider,
    {
      provide: PAYMENT_PROVIDER_ADAPTERS,
      useFactory: (stripe: StripePaymentProvider) => [stripe],
      inject: [StripePaymentProvider],
    },
    PaymentProviderRegistry,
  ],
  exports: [BillingService, EntitlementService],
})
export class BillingModule {}
