import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user } = useAuth();
  return (
    <Screen>
      <Text variant="title">Home</Text>
      <Text tone="muted">Signed in as {user?.email}</Text>
      <Card>
        <Text variant="caption" tone="muted">
          NEXT
        </Text>
        <Text variant="heading">Card Manager arrives next</Text>
        <Text tone="muted">Track what each card earns you, from your real spends.</Text>
      </Card>
    </Screen>
  );
}
