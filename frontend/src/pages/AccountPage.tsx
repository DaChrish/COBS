import { useState } from "react";
import { Container, Title, Paper, PasswordInput, Button, Stack, Alert } from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";

export function AccountPage() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t("account.passwordMismatch")); return; }
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
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xs">
      <Title order={3} mb="md">{t("account.title")}</Title>
      <Paper withBorder p="xl" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            {success && <Alert color="green" icon={<IconCheck size={16} />}>{t("account.passwordChanged")}</Alert>}
            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
            <PasswordInput label={t("account.newPassword")} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordInput label={t("account.confirm")} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" loading={loading}>{t("account.changePassword")}</Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
