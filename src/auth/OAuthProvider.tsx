import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { UserManager, WebStorageStateStore, User } from "oidc-client-ts";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  username: string;
}

interface OAuthContextType {
  token: string | null;
  user: UserProfile | null;
  roles: string[];
  teams: string[];
  isAdmin: boolean;
  loading: boolean;
  logout: () => void;
}

const OAuthContext = createContext<OAuthContextType | null>(null);

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED !== "false";
const OIDC_AUTHORITY = import.meta.env.VITE_OIDC_AUTHORITY || 
  (import.meta.env.VITE_KEYCLOAK_URL && `${import.meta.env.VITE_KEYCLOAK_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}`) || 
  "http://localhost:8180/realms/opl-crew";
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "opl-studio";

// Global reference for axios interceptors
export let activeToken: string | null = null;

function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const OAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);
  const [userManager, setUserManager] = useState<UserManager | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (!AUTH_ENABLED) {
      console.log("🔑 Authentication is disabled (VITE_AUTH_ENABLED=false). Using mock user.");
      const mockToken = "mock-jwt-token";
      activeToken = mockToken;
      setToken(mockToken);
      setUser({
        id: "mock-user-123",
        email: "alice@company.com",
        name: "Alice Developer (Mock)",
        username: "alice",
      });
      setRoles(["developer", "admin"]);
      setTeams(["Platform Team", "Migration Team"]);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    const um = new UserManager({
      authority: OIDC_AUTHORITY,
      client_id: OIDC_CLIENT_ID,
      redirect_uri: window.location.origin,
      response_type: "code",
      scope: "openid profile email",
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
      monitorSession: false
    });

    setUserManager(um);

    // Event listener for silent renew
    um.events.addUserLoaded((newUser) => {
      if (newUser.access_token) {
        activeToken = newUser.access_token;
        setToken(newUser.access_token);
        processUserToken(newUser.access_token, newUser);
      }
    });

    const processUserToken = (accessToken: string, oidcUser: User) => {
      const payload = parseJwt(accessToken);
      if (!payload) return;

      // Extract roles (Keycloak or general claims)
      const realmRoles = payload.realm_access?.roles || payload.roles || [];
      setRoles(realmRoles);
      setIsAdmin(realmRoles.includes("admin"));

      // Extract teams/groups (Keycloak groups claim or OIDC teams/groups claim)
      const rawGroups = payload.groups || payload.teams || [];
      const parsedTeams = rawGroups.map((g: string) => g.replace(/^\//, ""));
      setTeams(parsedTeams);

      const profile = oidcUser.profile;
      setUser({
        id: oidcUser.profile.sub || "",
        email: profile.email || payload.email || "",
        name: profile.name || payload.name || profile.preferred_username || payload.preferred_username || "",
        username: profile.preferred_username || payload.preferred_username || "",
      });
    };

    // Check if we are returning from redirect callback
    const urlParams = new URLSearchParams(window.location.search);
    const hasCode = urlParams.has("code") && urlParams.has("state");

    if (hasCode) {
      um.signinCallback()
        .then((newUser) => {
          // Clear query params from browser URL bar
          window.history.replaceState({}, document.title, window.location.pathname);
          if (newUser && newUser.access_token) {
            activeToken = newUser.access_token;
            setToken(newUser.access_token);
            processUserToken(newUser.access_token, newUser);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Sign-in callback processing failed:", err);
          um.signinRedirect();
        });
    } else {
      um.getUser()
        .then((loadedUser) => {
          if (loadedUser && !loadedUser.expired && loadedUser.access_token) {
            activeToken = loadedUser.access_token;
            setToken(loadedUser.access_token);
            processUserToken(loadedUser.access_token, loadedUser);
            setLoading(false);
          } else {
            // Not authenticated, redirect to OIDC provider
            um.signinRedirect();
          }
        })
        .catch((err) => {
          console.error("Failed to load user from store:", err);
          um.signinRedirect();
        });
    }
  }, []);

  const logout = () => {
    if (!AUTH_ENABLED) {
      console.log("Mock logout");
      return;
    }
    if (userManager) {
      userManager.signoutRedirect({
        post_logout_redirect_uri: window.location.origin,
      });
    }
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        flexDirection: "column",
        fontFamily: "var(--pf-v5-global--FontFamily--sans-serif, sans-serif)",
        background: "var(--pf-v5-global--BackgroundColor--200, #f0f2f5)",
        color: "var(--pf-v5-global--Color--100, #151515)"
      }}>
        <div className="pf-v5-c-spinner" role="progressbar" aria-valuetext="Loading authentication status" style={{ width: "40px", height: "40px" }} />
        <p style={{ marginTop: "16px", fontSize: "14px" }}>Securing your session...</p>
      </div>
    );
  }

  return (
    <OAuthContext.Provider value={{ token, user, roles, teams, isAdmin, loading, logout }}>
      {children}
    </OAuthContext.Provider>
  );
};

export const useOAuth = () => {
  const context = useContext(OAuthContext);
  if (!context) {
    throw new Error("useOAuth must be used within an OAuthProvider");
  }
  return context;
};

// Also export useAuth for backward/convenience compatibility
export const useAuth = useOAuth;
