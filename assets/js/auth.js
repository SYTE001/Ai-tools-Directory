/**
 * Security & Auth Manager for Admin Dashboard using Supabase Auth
 */
const AuthService = {
  SESSION_KEY: "admin_authenticated_session",

  async getSession() {
    if (typeof supabaseClient !== "undefined" && supabaseClient && supabaseClient.auth) {
      try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {
          console.error("Auth action failed: auth.getSession()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }
        if (session) {
          return { authenticated: true, user: session.user };
        }
      } catch (e) {
        console.error("Auth action exception: auth.getSession()", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }

    try {
      const raw = sessionStorage.getItem(this.SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.authenticated) {
          return { authenticated: true, user: { email: data.user || "admin" } };
        }
      }
    } catch (e) {}

    return { authenticated: false, user: null };
  },

  async isAuthenticated() {
    const sessionInfo = await this.getSession();
    return sessionInfo.authenticated;
  },

  async login(emailOrUser, password) {
    if (!emailOrUser || !password) {
      return { success: false, message: "Please enter email and password." };
    }

    const cleanInput = emailOrUser.trim();

    if (typeof supabaseClient !== "undefined" && supabaseClient && supabaseClient.auth) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: cleanInput,
          password: password
        });

        if (error) {
          console.error("Auth action failed: auth.signInWithPassword()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }

        if (!error && data && data.session) {
          sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
            authenticated: true,
            user: cleanInput,
            timestamp: Date.now()
          }));
          return { success: true, user: data.user };
        } else if (error && cleanInput.includes("@")) {
          return { success: false, message: error.message || "Invalid credentials." };
        }
      } catch (err) {
        console.error("Auth action exception: auth.signInWithPassword()", {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        });
      }
    }

    const settings = typeof StorageService !== "undefined" ? StorageService.getSettings() : {};
    const storedHash = settings.authHash || "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
    
    if (this.hashPassword) {
      const inputHash = await this.hashPassword(password);
      if ((cleanInput.toLowerCase() === "admin" || cleanInput.toLowerCase() === "admin@directory.ai") && inputHash === storedHash) {
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
          authenticated: true,
          user: cleanInput,
          timestamp: Date.now()
        }));
        return { success: true };
      }
    }

    return { success: false, message: "Invalid email/username or password." };
  },

  async logout() {
    if (typeof supabaseClient !== "undefined" && supabaseClient && supabaseClient.auth) {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          console.error("Auth action failed: auth.signOut()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }
      } catch (e) {
        console.error("Auth action exception: auth.signOut()", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }
    sessionStorage.removeItem(this.SESSION_KEY);
    window.location.reload();
  },

  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
};
