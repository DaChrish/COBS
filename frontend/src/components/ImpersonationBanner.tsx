import { Alert, Group, Text, Button } from "@mantine/core";
import { IconUserExclamation } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function ImpersonationBanner() {
  const { user, setToken } = useAuth();
  const navigate = useNavigate();

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
        <Text size="sm">Impersonating <b>{user.username}</b></Text>
        <Button size="compact-xs" variant="white" color="orange" onClick={endImpersonation}>
          End
        </Button>
      </Group>
    </Alert>
  );
}
