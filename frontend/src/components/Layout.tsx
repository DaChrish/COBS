import { AppShell, Group, Text, ActionIcon, Menu, Button } from "@mantine/core";
import { useMantineColorScheme } from "@mantine/core";
import { IconSun, IconMoon, IconCube, IconUser, IconLogout, IconSettings } from "@tabler/icons-react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function Layout() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <ImpersonationBanner />
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            <IconCube size={24} color="var(--mantine-color-blue-6)" />
            <Text fw={700} size="lg">COBS</Text>
          </Group>
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={toggleColorScheme} size="lg">
              {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
            {user && (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Button variant="subtle" size="compact-sm" leftSection={<IconUser size={16} />}>
                    {user.username}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate("/account")}>
                    Account
                  </Menu.Item>
                  {user.is_admin && (
                    <Menu.Item onClick={() => navigate("/admin")}>Admin</Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={() => { logout(); navigate("/login"); }}>
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
