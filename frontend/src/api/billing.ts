import client from './client';
import type {
  BillingStatusResponse,
  CheckoutResolveResponse,
  CheckoutStartResponse,
} from '../types';

export async function getBillingStatus() {
  const response = await client.get<BillingStatusResponse>('/billing/status');
  return response.data;
}

export async function startPremiumCheckout() {
  const response = await client.post<CheckoutStartResponse>('/billing/checkout', {
    planCode: 'PREMIUM',
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

