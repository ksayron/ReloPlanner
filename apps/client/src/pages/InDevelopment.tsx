import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';

export default function InDevelopment() {
  return (
    <Group justify="center" py="xl">
      <Card withBorder radius="lg" p="xl" maw={720} className="bg-white">
        <Stack align="center" gap="md">
          <Title order={2}>IN DEVELOPMENT</Title>
          <Text c="dimmed" ta="center">
            This premium feature flow is currently under implementation.
            Core gating and billing integration are already in place.
          </Text>
          <Button component={RouterLink} to="/profiles" color="brand.7">
            Back to Profiles
          </Button>
        </Stack>
      </Card>
    </Group>
  );
}

