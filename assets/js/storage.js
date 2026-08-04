/**
 * Storage Service — Supabase Settings & Local Cache Manager
 */
const StorageService = {
  KEYS: {
    SETTINGS: "directory_settings_v1"
  },

  DEFAULT_SETTINGS: {
    siteTitle: "Xnovaa.ai — Discover Every AI Tool in One Place",
    siteDescription: "Browse hundreds of curated AI tools across every category. Search, explore, and launch instantly.",
    githubUrl: "https://github.com"
  },

  cachedSettings: null,

  async fetchSettings() {
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Query failed: settings.select('*').limit(1).maybeSingle()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        } else if (data) {
          const settings = {
            siteTitle: data.site_title || this.DEFAULT_SETTINGS.siteTitle,
            siteDescription: data.site_description || this.DEFAULT_SETTINGS.siteDescription,
            githubUrl: data.github_url || this.DEFAULT_SETTINGS.githubUrl,
            updatedAt: data.updated_at
          };
          this.cachedSettings = settings;
          localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
          return settings;
        }
      } catch (e) {
        console.error("Supabase settings fetch exception:", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }
    return this.getSettings();
  },

  getSettings() {
    if (this.cachedSettings) return this.cachedSettings;
    const raw = localStorage.getItem(this.KEYS.SETTINGS);
    if (!raw) return this.DEFAULT_SETTINGS;
    try {
      const parsed = JSON.parse(raw);
      this.cachedSettings = { ...this.DEFAULT_SETTINGS, ...parsed };
      return this.cachedSettings;
    } catch (e) {
      return this.DEFAULT_SETTINGS;
    }
  },

  async saveSettings(newSettings) {
    const updated = {
      ...this.getSettings(),
      ...newSettings
    };
    this.cachedSettings = updated;
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(updated));

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const payload = {
          id: 1,
          site_title: updated.siteTitle,
          site_description: updated.siteDescription,
          github_url: updated.githubUrl,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
          .from("settings")
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          console.error("Query failed: settings.upsert()", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }
      } catch (e) {
        console.error("Supabase settings save exception:", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }
    return updated;
  },

  setSettings(settings) {
    return this.saveSettings(settings);
  }
};
