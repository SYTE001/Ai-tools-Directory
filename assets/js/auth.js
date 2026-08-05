const AuthService = {
  async getSession() {
    if (typeof supabaseClient === "undefined" || !supabaseClient || !supabaseClient.auth) {
      return null;
    }
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error("Auth action failed: supabase.auth.getSession()", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        return null;
      }
      return session;
    } catch (e) {
      console.error("Auth action exception: supabase.auth.getSession()", {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code
      });
      return null;
    }
  },

  async isAuthenticated() {
    const session = await this.getSession();
    return !!session;
  },

  async login(email, password) {
    if (!email || !password) {
      return { success: false, message: "Please enter email address and password." };
    }
    if (typeof supabaseClient === "undefined" || !supabaseClient || !supabaseClient.auth) {
      return { success: false, message: "Supabase auth client is not initialized." };
    }

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        console.error("Auth action failed: supabase.auth.signInWithPassword()", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        return { success: false, message: error.message || "Invalid login credentials." };
      }

      return { success: true, session: data.session, user: data.user };
    } catch (err) {
      console.error("Auth action exception: supabase.auth.signInWithPassword()", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return { success: false, message: err.message || "Authentication error." };
    }
  },

  async logout() {
    if (typeof supabaseClient !== "undefined" && supabaseClient && supabaseClient.auth) {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          console.error("Auth action failed: supabase.auth.signOut()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }
      } catch (e) {
        console.error("Auth action exception: supabase.auth.signOut()", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }
  },

  onAuthStateChange(callback) {
    if (typeof supabaseClient !== "undefined" && supabaseClient && supabaseClient.auth) {
      return supabaseClient.auth.onAuthStateChange((event, session) => {
        if (typeof callback === "function") {
          callback(event, session);
        }
      });
    }
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
};
