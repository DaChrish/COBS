import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Center, Alert } from "@mantine/core";
import { IconCube, IconAlertCircle } from "@tabler/icons-react";
import { apiFetch } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function JoinPage() {
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string }>("/tournaments/join", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode, username, password }),
      });
      await setToken(res.access_token);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Container size={420} w="100%">
        <Stack align="center" mb="xl">
          <IconCube size={48} color="var(--mantine-color-blue-6)" />
          <Title order={1}>Turnier beitreten</Title>
        </Stack>
        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
              <TextInput label="Join-Code" placeholder="z.B. A1B2C3D4" required value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
              <TextInput label="Username" required value={username} onChange={(e) => setUsername(e.target.value)} />
              <PasswordInput label="Password" description="Neuer Account wird erstellt falls nötig"
                required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" fullWidth loading={loading}>Beitreten</Button>
            </Stack>
          </form>
          <Text size="sm" c="dimmed" ta="center" mt="md">
            Schon einen Account? <Text component="a" href="/login" c="blue" inherit>Login</Text>
          </Text>
        </Paper>
      </Container>
    </Center>
  );
}
