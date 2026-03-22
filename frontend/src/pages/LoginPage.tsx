import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Group, Stack, Center, Alert } from "@mantine/core";
import { IconCube, IconAlertCircle } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Container size={420} w="100%">
        <Stack align="center" mb="xl">
          <IconCube size={48} color="var(--mantine-color-blue-6)" />
          <Title order={1}>COBS</Title>
          <Text c="dimmed" size="sm">Cube Draft Tournament Manager</Text>
        </Stack>
        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
              <TextInput label="Username" required value={username} onChange={(e) => setUsername(e.target.value)} />
              <PasswordInput label="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" fullWidth loading={loading}>Login</Button>
            </Stack>
          </form>
          <Group justify="center" mt="md">
            <Text size="sm" c="dimmed">
              Turnier beitreten? <Text component="a" href="/join" c="blue" inherit>Join</Text>
            </Text>
          </Group>
        </Paper>
      </Container>
    </Center>
  );
}
