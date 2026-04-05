import { Alert, Group, Text, Button } from "@mantine/core";
import { IconUserExclamation } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export function ImpersonationBanner() {
  const { user, setToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Check if there's a stored admin token (set during impersonation)
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken || !user) return null;

  const endImpersonation = async () => {
    localStorage.removeItem("admin_token");
    await setToken(adminToken);
    navigate("/admin");
  };

  return (
    <Alert color="orange" py={4} px="md" radius={0} icon={<IconUserExclamation size={16} />}>
      <Group justify="space-between">
        <Text size="sm" dangerouslySetInnerHTML={{ __html: t("impersonation.impersonating", { username: user.username }) }} />
        <Button size="compact-xs" variant="white" color="orange" onClick={endImpersonation}>
          {t("impersonation.end")}
        </Button>
      </Group>
    </Alert>
  );
}
