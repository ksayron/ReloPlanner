import { confirmCheckout } from '../api/billing';
import type { CheckoutResolveResponse } from '../types';

export function buildCheckoutReturnUrls(
  path: string,
  existingQuery: URLSearchParams,
) {
  const buildUrl = (params: URLSearchParams) => {
    const query = params.toString();
    return `${window.location.origin}${path}${query ? `?${query}` : ''}`;
  };

  const successParams = new URLSearchParams(existingQuery);
  successParams.set('checkout', 'success');
  successParams.delete('session_id');

  const cancelParams = new URLSearchParams(existingQuery);
  cancelParams.set('checkout', 'cancel');
  cancelParams.delete('session_id');

  return {
    successUrl: `${buildUrl(successParams)}${successParams.toString() ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${buildUrl(cancelParams)}${cancelParams.toString() ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
  };
}

export async function pollCheckoutStatus(
  checkoutSessionId: string,
  options?: { attempts?: number; delayMs?: number },
): Promise<CheckoutResolveResponse> {
  const attempts = options?.attempts ?? 8;
  const delayMs = options?.delayMs ?? 1500;

  let last = await confirmCheckout(checkoutSessionId);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (last.paymentStatus !== 'PENDING') {
      return last;
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    last = await confirmCheckout(checkoutSessionId);
  }

  return last;
}
