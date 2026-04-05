import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Center, Alert } from "@mantine/core";
import { IconCube, IconAlertCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function JoinPage() {
  const { t } = useTranslation();
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, setToken } = useAuth();
  const navigate = useNavigate();

  const handleJoinAuthenticated = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; tournament_id: string }>("/tournaments/join-by-code", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode }),
      });
      navigate(`/tournament/${res.tournament_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("join.joinFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAnonymous = async (e: React.FormEvent) => {
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
      setError(err instanceof Error ? err.message : t("join.joinFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Logged-in user: only join code needed
  if (user) {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <Container size={420} w="100%">
          <Stack align="center" mb="xl">
            <IconCube size={48} color="var(--mantine-color-blue-6)" />
            <Title order={1}>{t("join.title")}</Title>
            <Text size="sm" c="dimmed" dangerouslySetInnerHTML={{ __html: t("join.loggedInAs", { username: user.username }) }} />
          </Stack>
          <Paper withBorder shadow="md" p="xl" radius="md">
            <form onSubmit={handleJoinAuthenticated}>
              <Stack>
                {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
                <TextInput label={t("join.joinCode")} placeholder={t("join.joinCodePlaceholder")} required value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
                <Button type="submit" fullWidth loading={loading}>{t("join.joinButton")}</Button>
              </Stack>
            </form>
          </Paper>
        </Container>
      </Center>
    );
  }

  // Not logged in: full form
  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Container size={420} w="100%">
        <Stack align="center" mb="xl">
          <IconCube size={48} color="var(--mantine-color-blue-6)" />
          <Title order={1}>{t("join.title")}</Title>
        </Stack>
        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleJoinAnonymous}>
            <Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
              <TextInput label={t("join.joinCode")} placeholder={t("join.joinCodePlaceholder")} required value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
              <TextInput label={t("join.username")} required value={username} onChange={(e) => setUsername(e.target.value)} />
              <PasswordInput label={t("join.password")} description={t("join.passwordDescription")}
                required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" fullWidth loading={loading}>{t("join.joinButton")}</Button>
            </Stack>
          </form>
          <Text size="sm" c="dimmed" ta="center" mt="md">
            {t("join.alreadyHaveAccount")} <Text component="a" href="/login" c="blue" inherit>{t("join.loginLink")}</Text>
          </Text>
        </Paper>
      </Container>
    </Center>
  );
}
