import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { MockCheckoutDto } from './dto/mock-checkout.dto.js';
import { ResolveCheckoutDto } from './dto/resolve-checkout.dto.js';
import { EntitlementService } from './entitlement.service.js';

@Controller('billing')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Billing')
@ApiBearerAuth()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Get('status')
  async getStatus(@Req() req: any) {
    const [status, entitlements] = await Promise.all([
      this.billingService.getBillingStatus(req.user.id),
      this.entitlementService.getEntitlementsSnapshot(req.user.id),
    ]);
    return {
      ...status,
      entitlements,
    };
  }

  @Get('entitlements')
  async getEntitlements(@Req() req: any) {
    return this.entitlementService.getEntitlementsSnapshot(req.user.id);
  }

  @Post('checkout')
  async startCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    return this.billingService.startCheckout(req.user.id, dto);
  }

  @Post('checkout/:checkoutSessionId/confirm')
  async confirmCheckout(
    @Req() req: any,
    @Param('checkoutSessionId') checkoutSessionId: string,
    @Body() dto: ResolveCheckoutDto,
  ) {
    return this.billingService.resolveCheckoutSession(
      req.user.id,
      checkoutSessionId,
      dto?.forcedOutcome,
    );
  }

  @Post('mock/success')
  async mockSuccess(@Req() req: any, @Body() dto: MockCheckoutDto) {
    return this.billingService.resolveCheckoutSession(
      req.user.id,
      dto.checkoutSessionId,
      'SUCCESS',
    );
  }

  @Post('mock/fail')
  async mockFail(@Req() req: any, @Body() dto: MockCheckoutDto) {
    return this.billingService.resolveCheckoutSession(
      req.user.id,
      dto.checkoutSessionId,
      'FAIL_CARD_DECLINED',
    );
  }
}

