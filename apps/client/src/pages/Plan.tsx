import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { getPlanSummary, startPremiumCheckout } from '../api/billing';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type { BillingPlanSummaryResponse } from '../types';
import { useSearchParams } from 'react-router-dom';

function formatDate(value: string | null | undefined) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

export default function Plan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<BillingPlanSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');
  const isPremium = summary?.plan.code === 'PREMIUM';

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlanSummary();
      setSummary(data);
    } catch (err: any) {
      setError(String(err?.response?.data?.message ?? 'Failed to load plan summary.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!checkoutAction || !checkoutSessionId) return;
    let canceled = false;
    setCheckoutProcessing(true);
    setError('');
    setInfo('');

    void (async () => {
      try {
        const resolved = await pollCheckoutStatus(checkoutSessionId);
        if (canceled) return;

        if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
          setInfo('Premium activated successfully.');
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setError('Checkout was canceled before completion.');
        } else if (resolved.paymentStatus === 'PENDING') {
          setError(
            'Checkout is still pending webhook confirmation. Refresh shortly if status does not update.',
          );
        } else {
          setError(
            resolved.errorMessage ?? 'Checkout failed. Please retry with Stripe test card details.',
          );
        }
        await loadSummary();
      } catch (err: any) {
        if (canceled) return;
        setError(String(err?.response?.data?.message ?? 'Failed to resolve checkout status.'));
      } finally {
        if (canceled) return;
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, loadSummary]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError('');
    setInfo('');
    try {
      const urls = buildCheckoutReturnUrls('/plan', searchParams);
      const checkout = await startPremiumCheckout(urls);
      if (!checkout.checkoutUrl) {
        throw new Error('Checkout URL was not returned by billing provider.');
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (err: any) {
      setError(String(err?.response?.data?.message ?? err?.message ?? 'Upgrade failed.'));
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader color="brand.7" />
      </Group>
    );
  }

  return (
    <Stack gap="lg" maw={960}>
      <Title order={2}>Plan and Billing</Title>
      {checkoutProcessing ? <Alert color="blue">Processing Stripe checkout status...</Alert> : null}
      {info ? <Alert color="teal">{info}</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Text fw={700}>Current Plan</Text>
            <Badge color={isPremium ? 'teal' : 'gray'} variant="light">
              {summary?.plan.name ?? 'Unknown'}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Subscription status: {summary?.subscription.status ?? 'UNKNOWN'}
          </Text>
          <Text size="sm" c="dimmed">
            Started: {formatDate(summary?.subscription.startedAt)}
          </Text>
          <Text size="sm" c="dimmed">
            Expires / period end: {formatDate(summary?.subscription.expiresAt)}
          </Text>
          {summary?.stripe.subscription ? (
            <>
              <Text size="sm" c="dimmed">
                Stripe subscription: {summary.stripe.subscription.id}
              </Text>
              <Text size="sm" c="dimmed">
                Stripe status: {summary.stripe.subscription.status}
              </Text>
              <Text size="sm" c="dimmed">
                Cancel at period end: {summary.stripe.subscription.cancelAtPeriodEnd ? 'yes' : 'no'}
              </Text>
            </>
          ) : null}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Text fw={700}>Premium Plan</Text>
          <Text size="sm">
            Price in Stripe: {summary?.premiumPricing.basePriceUsd.toFixed(2)} USD / month
          </Text>
          <Text size="sm" c="dimmed">
            Converted price: {summary?.premiumPricing.convertedPrice.toFixed(2)}{' '}
            {summary?.premiumPricing.convertedCurrency} (using app fixed rates)
          </Text>
          {!isPremium ? (
            <Button color="brand.7" onClick={handleUpgrade} loading={upgrading || checkoutProcessing}>
              Upgrade to Premium
            </Button>
          ) : (
            <Button variant="light" color="teal" disabled>
              Premium Active
            </Button>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Text fw={700}>Payment History</Text>
          {summary?.payments?.length ? (
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summary.payments.slice(0, 20).map((payment) => (
                  <Table.Tr key={payment.id}>
                    <Table.Td>{new Date(payment.createdAt).toLocaleString()}</Table.Td>
                    <Table.Td>{payment.status}</Table.Td>
                    <Table.Td>
                      {payment.amount.toFixed(2)} {payment.currency}
                    </Table.Td>
                    <Table.Td>{payment.planCode}</Table.Td>
                    <Table.Td>{payment.errorMessage ?? '-'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No payments yet.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
