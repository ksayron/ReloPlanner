import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service.js';

@Controller('billing/webhooks')
@ApiTags('Billing')
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ) {
    if (!stripeSignature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    const payload = req.rawBody;
    if (!payload) {
      throw new BadRequestException(
        'Missing raw request body. Ensure Nest rawBody option is enabled.',
      );
    }
    return this.billingService.processStripeWebhook(payload, stripeSignature);
  }
}
