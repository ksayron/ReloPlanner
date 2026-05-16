import { Alert, Button, Group, List, Modal, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

type PremiumUpgradeModalProps = {
  opened: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  loading?: boolean;
  featureName?: string;
  errorMessage?: string | null;
};

export default function PremiumUpgradeModal({
  opened,
  onClose,
  onUpgrade,
  loading = false,
  featureName,
  errorMessage,
}: PremiumUpgradeModalProps) {
  const { t } = useTranslation(['components', 'common']);

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title={t('upgradeToPremium', { ns: 'components' })}>
      <Stack gap="md">
        <Title order={4}>{t('unlockPremiumFeatures', { ns: 'components' })}</Title>
        <Text size="sm" c="dimmed">
          {featureName
            ? t('premiumFeatureAvailable', { ns: 'components', feature: featureName })
            : t('premiumFeatureAvailableGeneric', { ns: 'components' })}
        </Text>
        <List spacing="xs">
          <List.Item>{t('premiumBenefitMatches', { ns: 'components' })}</List.Item>
          <List.Item>{t('premiumBenefitAiReport', { ns: 'components' })}</List.Item>
          <List.Item>{t('premiumBenefitPdf', { ns: 'components' })}</List.Item>
        </List>
        {errorMessage ? <Alert color="red">{errorMessage}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button color="brand.7" onClick={onUpgrade} loading={loading}>
            {t('upgradeNow', { ns: 'components' })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
