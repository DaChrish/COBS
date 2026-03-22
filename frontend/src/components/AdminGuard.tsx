import { Navigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { useAuth } from "../hooks/useAuth";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center h="50vh"><Loader /></Center>;
  if (!user || !user.is_admin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
