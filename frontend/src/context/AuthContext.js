import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=unauth
  const [permissions, setPermissions] = useState([]);

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setPermissions(data.permissions || []);
    } catch {
      tokenStore.clear();
      setUser(null);
      setPermissions([]);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    tokenStore.set(data.access_token);
    setUser(data.user);
    setPermissions(data.permissions || []);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
    setPermissions([]);
  };

  const hasPermission = useCallback(
    (perm) => user?.role === "admin" || permissions.includes(perm),
    [user, permissions]
  );

  return (
    <AuthContext.Provider
      value={{ user, permissions, login, logout, hasPermission, refresh: loadMe, formatApiError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
