import { Alert, Button, Group, List, Modal, Stack, Text, Title } from '@mantine/core';

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
  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title="Upgrade to Premium">
      <Stack gap="md">
        <Title order={4}>Unlock Premium Features</Title>
        <Text size="sm" c="dimmed">
          {featureName
            ? `${featureName} is available on Premium.`
            : 'This feature is available on Premium.'}
        </Text>
        <List spacing="xs">
          <List.Item>Top 20 job matches instead of 3.</List.Item>
          <List.Item>AI-detailed analysis report generation.</List.Item>
          <List.Item>PDF report export for defense/demo scenarios.</List.Item>
        </List>
        {errorMessage ? <Alert color="red">{errorMessage}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="brand.7" onClick={onUpgrade} loading={loading}>
            Upgrade Now
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
