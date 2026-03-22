import { useState } from "react";
import { Container, Title, Paper, PasswordInput, Button, Stack, Alert } from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { apiFetch } from "../api/client";

export function AccountPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwörter stimmen nicht überein"); return; }
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ username: "", password }),
      });
      setSuccess(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xs">
      <Title order={3} mb="md">Account</Title>
      <Paper withBorder p="xl" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            {success && <Alert color="green" icon={<IconCheck size={16} />}>Passwort geändert</Alert>}
            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
            <PasswordInput label="Neues Passwort" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordInput label="Bestätigen" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" loading={loading}>Passwort ändern</Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
