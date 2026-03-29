import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { apiFetch } from "../api/client";

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [loading, setLoading] = useState(true);

  const setToken = useCallback(async (t: string): Promise<void> => {
    localStorage.setItem("token", t);
    setTokenState(t);
    setLoading(true);
    // Fetch user immediately so AuthGuard works on redirect
    try {
      const me = await apiFetch<AuthUser>("/auth/me");
      // Use flushSync to ensure React commits state before caller navigates
      flushSync(() => {
        setUser(me);
        setLoading(false);
      });
    } catch {
      flushSync(() => setLoading(false));
    }
  }, []);

  const fetchMe = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      localStorage.removeItem("token");
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.removeItem("admin_token");
    localStorage.setItem("token", res.access_token);
    setTokenState(res.access_token);
    // Fetch user immediately so AuthGuard sees user on redirect
    const me = await apiFetch<AuthUser>("/auth/me");
    setUser(me);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("admin_token");
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
