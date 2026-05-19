import { useEffect, useRef, useState } from 'react';
import { AuthContext } from './auth-context';
import { authApi, isTokenExpired, storeTokenExpiry, AUTH_SESSION_EXPIRED_EVENT } from '../lib/api';

// How many ms before the JWT actually expires we proactively log the user out.
// Prevents the "UI logged in, first API call 401s" window at end of token life.
const EXPIRY_BUFFER_MS = 60 * 1000; // 1 minute

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const expiryTimerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clearStoredAuth = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('token_exp');
  };

  const clearExpiryTimer = () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  const handleSessionExpired = () => {
    setUser(null);
    clearStoredAuth();
    clearExpiryTimer();
  };

  /**
   * Schedule a proactive logout slightly before the JWT expires so the UI
   * transitions cleanly instead of the user hitting a 401 mid-session.
   */
  const scheduleExpiryLogout = () => {
    clearExpiryTimer();
    const expIso = localStorage.getItem('token_exp');
    if (!expIso) return;

    const msUntilExpiry = new Date(expIso).getTime() - Date.now() - EXPIRY_BUFFER_MS;
    if (msUntilExpiry <= 0) {
      handleSessionExpired();
      return;
    }

    expiryTimerRef.current = setTimeout(handleSessionExpired, msUntilExpiry);
  };

  /**
   * Persist a successful auth result from login or register.
   * Stores the token + expiry, updates user state, and arms the expiry timer.
   */
  const persistAuth = (userData, authHeader) => {
    if (authHeader) {
      const raw = authHeader.split(' ')[1] || authHeader;
      localStorage.setItem('token', raw);
      storeTokenExpiry(raw);
    }
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    scheduleExpiryLogout();
  };

  // ---------------------------------------------------------------------------
  // Bootstrap — runs once on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const bootstrap = async () => {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      // No credentials at all — straight to unauthenticated
      if (!storedUser || !token) {
        setLoading(false);
        return;
      }

      // Fast client-side check — if the JWT is obviously expired, skip the
      // network call and clear immediately (covers the "returned after 24hrs" case)
      if (isTokenExpired()) {
        clearStoredAuth();
        setLoading(false);
        return;
      }

      // Server-side validation — always ask the backend to confirm the token is
      // still accepted (covers denylist hits, secret rotation, deleted users, etc.)
      try {
        const response = await authApi.me();
        const freshUser = response.data.user;
        // Overwrite stale cached snapshot with latest server data
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
        // /auth/me doesn't issue a new JWT, so token_exp won't be set by the
        // response interceptor. Derive it directly from the stored token so
        // scheduleExpiryLogout() can arm the proactive logout timer.
        storeTokenExpiry(token);
        scheduleExpiryLogout();
      } catch {
        // Server rejected the token — clear silently, user goes to login
        clearStoredAuth();
      } finally {
        setLoading(false);
      }
    };

    bootstrap();

    // -------------------------------------------------------------------------
    // Cross-tab sync via the native `storage` event.
    // window.dispatchEvent() is tab-local, but the `storage` event fires in
    // every tab *except* the one that modified localStorage — exactly what we
    // need for cross-tab logout.
    // -------------------------------------------------------------------------
    const handleStorageChange = (event) => {
      if (event.key === 'token' && !event.newValue) {
        // Another tab logged out or had its session expire
        setUser(null);
        clearExpiryTimer();
      }
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.removeEventListener('storage', handleStorageChange);
      clearExpiryTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------

  const login = async (email, password) => {
    try {
      const response = await authApi.login({ email, password });
      if (response.data.user) {
        persistAuth(response.data.user, response.headers?.authorization);
        return { success: true };
      }
      return { success: false, error: 'Login failed' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const register = async (name, email, password, phone) => {
    try {
      const response = await authApi.register({ name, email, password, phone });
      if (response.data.user) {
        // Registration now dispatches a JWT (fixed in devise.rb dispatch_requests)
        persistAuth(response.data.user, response.headers?.authorization);
        return { success: true };
      }
      return { success: false, error: 'Registration failed' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error', error);
    } finally {
      setUser(null);
      clearStoredAuth();
      clearExpiryTimer();
    }
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  };

  // ---------------------------------------------------------------------------

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
