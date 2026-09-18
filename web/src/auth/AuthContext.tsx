import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "../api/client.js";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  registerFirstAdmin: (data: { email: string; name: string; password: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { needsSetup: setup } = await api.bootstrapCheck();
      setNeedsSetup(setup);
      if (!setup) {
        const me = await api.me().catch(() => null);
        setUser(me);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(email: string, password: string) {
    const me = await api.login({ email, password });
    setUser(me);
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  async function registerFirstAdmin(data: { email: string; name: string; password: string }) {
    const me = await api.register(data);
    setUser(me);
    setNeedsSetup(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, refresh, login, logout, registerFirstAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
