import { Navigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { useAuth } from "../hooks/useAuth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center h="50vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
