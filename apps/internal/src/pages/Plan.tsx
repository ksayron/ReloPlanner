import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { getPlanSummary, startPremiumCheckout } from '../api/billing';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type { BillingPlanSummaryResponse } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

function formatDate(value: string | null | undefined, language: string, fallback: string) {
  if (!value) return fallback;
  return new Date(value).toLocaleString(language);
}

export default function Plan() {
  const { t } = useTranslation('plan');
  const { language } = useAppLanguage();
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
      setError(String(err?.response?.data?.message ?? t('failedLoadSummary')));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
          setInfo(t('premiumActivated'));
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setError(t('checkoutCanceled'));
        } else if (resolved.paymentStatus === 'PENDING') {
          setError(t('checkoutPending'));
        } else {
          setError(resolved.errorMessage ?? t('checkoutFailed'));
        }
        await loadSummary();
      } catch (err: any) {
        if (canceled) return;
        setError(String(err?.response?.data?.message ?? t('failedResolveCheckout')));
      } finally {
        if (canceled) return;
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, loadSummary, t]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError('');
    setInfo('');
    try {
      const urls = buildCheckoutReturnUrls('/plan', searchParams);
      const checkout = await startPremiumCheckout(urls);
      if (!checkout.checkoutUrl) {
        throw new Error(t('checkoutMissingUrl'));
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (err: any) {
      setError(String(err?.response?.data?.message ?? err?.message ?? t('upgradeFailed')));
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
      <Title order={2}>{t('title')}</Title>
      {checkoutProcessing ? <Alert color="blue">{t('processingCheckout')}</Alert> : null}
      {info ? <Alert color="teal">{info}</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Text fw={700}>{t('currentPlan')}</Text>
            <Badge color={isPremium ? 'teal' : 'gray'} variant="light">
              {summary?.plan.name ?? t('unknown')}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {t('subscriptionStatus')}: {summary?.subscription.status ?? 'UNKNOWN'}
          </Text>
          <Text size="sm" c="dimmed">
            {t('started')}:{' '}
            {formatDate(summary?.subscription.startedAt, language, t('na'))}
          </Text>
          <Text size="sm" c="dimmed">
            {t('expires')}:{' '}
            {formatDate(summary?.subscription.expiresAt, language, t('na'))}
          </Text>
          {summary?.stripe.subscription ? (
            <>
              <Text size="sm" c="dimmed">
                {t('stripeSubscription')}: {summary.stripe.subscription.id}
              </Text>
              <Text size="sm" c="dimmed">
                {t('stripeStatus')}: {summary.stripe.subscription.status}
              </Text>
              <Text size="sm" c="dimmed">
                {t('cancelAtPeriodEnd')}:{' '}
                {summary.stripe.subscription.cancelAtPeriodEnd ? t('yes', { ns: 'common' }) : t('no', { ns: 'common' })}
              </Text>
            </>
          ) : null}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Text fw={700}>{t('premiumPlan')}</Text>
          <Text size="sm">
            {t('priceInStripe')}: {summary?.premiumPricing.basePriceUsd.toFixed(2)} USD {t('perMonth')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('convertedPrice')}: {summary?.premiumPricing.convertedPrice.toFixed(2)}{' '}
            {summary?.premiumPricing.convertedCurrency} {t('fixedRatesHint')}
          </Text>
          {!isPremium ? (
            <Button color="brand.7" onClick={handleUpgrade} loading={upgrading || checkoutProcessing}>
              {t('upgradeToPremium')}
            </Button>
          ) : (
            <Button variant="light" color="teal" disabled>
              {t('premiumActive')}
            </Button>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Text fw={700}>{t('paymentHistory')}</Text>
          {summary?.payments?.length ? (
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('date')}</Table.Th>
                  <Table.Th>{t('status')}</Table.Th>
                  <Table.Th>{t('amount')}</Table.Th>
                  <Table.Th>{t('plan')}</Table.Th>
                  <Table.Th>{t('error')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summary.payments.slice(0, 20).map((payment) => (
                  <Table.Tr key={payment.id}>
                    <Table.Td>{new Date(payment.createdAt).toLocaleString(language)}</Table.Td>
                    <Table.Td>{payment.status}</Table.Td>
                    <Table.Td>
                      {payment.amount.toFixed(2)} {payment.currency}
                    </Table.Td>
                    <Table.Td>{payment.planCode}</Table.Td>
                    <Table.Td>{payment.errorMessage ?? t('dash')}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              {t('noPayments')}
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
