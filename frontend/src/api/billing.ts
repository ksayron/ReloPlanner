import client from './client';
import type {
  BillingPlanSummaryResponse,
  BillingStatusResponse,
  CheckoutResolveResponse,
  CheckoutStartResponse,
} from '../types';

export async function getBillingStatus() {
  const response = await client.get<BillingStatusResponse>('/billing/status');
  return response.data;
}

export async function getPlanSummary() {
  const response = await client.get<BillingPlanSummaryResponse>('/billing/plan-summary');
  return response.data;
}

export async function startPremiumCheckout(input?: {
  successUrl?: string;
  cancelUrl?: string;
}) {
  const response = await client.post<CheckoutStartResponse>('/billing/checkout', {
    planCode: 'PREMIUM',
    successUrl: input?.successUrl,
    cancelUrl: input?.cancelUrl,
  });
  return response.data;
}

export async function confirmCheckout(
  checkoutSessionId: string,
): Promise<CheckoutResolveResponse> {
  const response = await client.post<CheckoutResolveResponse>(
    `/billing/checkout/${checkoutSessionId}/confirm`,
    {},
  );
  return response.data;
}
