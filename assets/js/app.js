/**
 * Public Website Application Controller — directory.ai
 */
(async function PublicApp() {
  let tools = [];
  let categories = [];
  let activeCategory = "All";
  let searchQuery = "";
  let siteSettings = {};

  const segmentedEl = document.getElementById("segmented");
  const gridEl = document.getElementById("grid");
  const emptyStateEl = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearch");
  const resetBtn = document.getElementById("resetBtn");
  const collectionsWrap = document.getElementById("collectionsWrap");
  const dbErrorBanner = document.getElementById("dbErrorBanner");
  const dbRetryBtn = document.getElementById("dbRetryBtn");
  const githubLink = document.getElementById("githubLink");

  async function loadSettings() {
    if (typeof StorageService !== "undefined") {
      siteSettings = await StorageService.fetchSettings();
      if (githubLink && siteSettings.githubUrl) {
        githubLink.href = siteSettings.githubUrl;
        githubLink.title = `View Project Source (${siteSettings.githubUrl})`;
      }
      if (siteSettings.siteTitle) {
        const siteTitleEl = document.getElementById("siteTitle");
        if (siteTitleEl) siteTitleEl.textContent = siteSettings.siteTitle;
      }
    }
  }

  function renderSkeletons() {
    if (!gridEl) return;
    gridEl.style.display = "grid";
    if (emptyStateEl) emptyStateEl.style.display = "none";
    gridEl.innerHTML = Array(6).fill(0).map(() => `
      <div class="skeleton-card">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="skeleton-box" style="width:44px; height:44px; border-radius:12px;"></div>
          <div class="skeleton-box" style="width:120px; height:20px;"></div>
        </div>
        <div class="skeleton-box" style="width:100%; height:14px;"></div>
        <div class="skeleton-box" style="width:70%; height:14px;"></div>
        <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center;">
          <div class="skeleton-box" style="width:60px; height:22px; border-radius:6px;"></div>
          <div class="skeleton-box" style="width:40px; height:18px;"></div>
        </div>
      </div>
    `).join("");
  }

  function updateLiveStats() {
    const toolCountEl = document.getElementById("toolCount");
    const categoryCountEl = document.getElementById("categoryCount");
    const featuredCountEl = document.getElementById("featuredCount");
    const lastUpdatedCountEl = document.getElementById("lastUpdatedCount");

    const totalTools = tools.length;
    const totalCategories = categories.filter(c => c.name !== "All").length;
    const featuredTools = tools.filter(t => t.featured || t.sponsored).length;

    if (toolCountEl) toolCountEl.textContent = totalTools > 0 ? `${totalTools}+` : '0';
    if (categoryCountEl) categoryCountEl.textContent = totalCategories > 0 ? `${totalCategories}+` : '0';
    if (featuredCountEl) featuredCountEl.textContent = featuredTools > 0 ? `${featuredTools}` : '0';
    if (lastUpdatedCountEl) lastUpdatedCountEl.textContent = totalTools > 0 ? "Live" : "Active";
  }

  async function fetchCategories() {
    const defaultCats = [
      { id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" }
    ];

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("categories")
          .select("*")
          .order("name");

        if (error) {
          console.error("Query failed: categories.select('*').order('name')", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
        }

        if (!error && data && data.length > 0) {
          categories = [
            { id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" },
            ...data
          ];
          return;
        }
      } catch (e) {
        console.error("Query exception: categories.select('*').order('name')", {
          message: e?.message,
          details: e?.details,
          hint: e?.hint,
          code: e?.code
        });
      }
    }

    try {
      const res = await fetch("data/categories.json");
      if (res.ok) {
        const localCats = await res.json();
        categories = [{ id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" }, ...localCats.filter(c => c.name !== "All")];
      } else {
        categories = defaultCats;
      }
    } catch (e) {
      categories = defaultCats;
    }
  }

  async function fetchTools() {
    renderSkeletons();

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("tools")
          .select("*, categories:category_id(*)");

        if (error) {
          console.error("Query failed: tools.select('*, categories:category_id(*)')", {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
          if (dbErrorBanner) dbErrorBanner.style.display = "flex";
          if (window.showToast) window.showToast("Failed to load tools from database.", "error");
          tools = [];
          return false;
        }

        if (dbErrorBanner) dbErrorBanner.style.display = "none";
        
        tools = (data || []).map(t => {
          let categoryName = t.category;
          if (t.categories && t.categories.name) {
            categoryName = t.categories.name;
          } else if (t.category_id && categories.length > 0) {
            const matchedCat = categories.find(c => String(c.id) === String(t.category_id));
            if (matchedCat) categoryName = matchedCat.name;
          }
          return {
            ...t,
            category: categoryName || "Uncategorized"
          };
        });

        return true;
      } catch (err) {
        console.error("Query exception: tools.select('*, categories:category_id(*)')", {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        });
        if (dbErrorBanner) dbErrorBanner.style.display = "flex";
        tools = [];
        return false;
      }
    } else {
      if (dbErrorBanner) dbErrorBanner.style.display = "flex";
      tools = [];
      return false;
    }
  }

  function initials(name) {
    return name ? name.slice(0, 2).toUpperCase() : "AI";
  }

  function renderSegmented() {
    if (!segmentedEl) return;
    segmentedEl.innerHTML = categories.map(cat => {
      const isActive = cat.name === activeCategory;
      return `<button class="${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" data-cat="${cat.name}">${cat.icon ? cat.icon + ' ' : ''}${cat.name}</button>`;
    }).join("");

    segmentedEl.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        renderSegmented();
        renderGrid();
      });
    });
  }

  function renderCollections() {
    if (!collectionsWrap) return;
    const catList = categories.filter(c => c.name !== "All");
    collectionsWrap.innerHTML = catList.map(cat => `
      <div class="collection-card" tabindex="0" role="button" aria-label="Browse ${cat.name} tools" data-cat="${cat.name}">
        <span class="collection-icon">${cat.icon || '✨'}</span>
        <span class="collection-name">${cat.name} Tools</span>
      </div>
    `).join("");

    collectionsWrap.querySelectorAll(".collection-card").forEach(card => {
      const handleSelect = () => {
        const cat = card.dataset.cat;
        if (cat) {
          activeCategory = cat;
          renderSegmented();
          renderGrid();
          if (segmentedEl) {
            segmentedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      };

      card.addEventListener("click", handleSelect);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      });
    });
  }

  function renderGrid() {
    const filtered = tools.filter(t => {
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      const matchesSearch = !searchQuery || 
                            (t.name && t.name.toLowerCase().includes(searchQuery)) ||
                            (t.description && t.description.toLowerCase().includes(searchQuery)) ||
                            (t.category && t.category.toLowerCase().includes(searchQuery));
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      const aFeatured = a.featured || a.sponsored ? 1 : 0;
      const bFeatured = b.featured || b.sponsored ? 1 : 0;
      if (bFeatured !== aFeatured) return bFeatured - aFeatured;

      if (aFeatured && bFeatured) {
        return (a.order_index ?? 0) - (b.order_index ?? 0);
      }
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    if (filtered.length === 0) {
      gridEl.style.display = "none";
      if (emptyStateEl) emptyStateEl.style.display = "flex";
      return;
    }

    gridEl.style.display = "grid";
    if (emptyStateEl) emptyStateEl.style.display = "none";

    gridEl.innerHTML = filtered.map(t => {
      const descText = t.description || "";
      const isSupabaseLogo = t.logo && t.logo.startsWith("http");
      const isLocalLogo = t.logo && !isSupabaseLogo && (t.logo.endsWith(".png") || t.logo.endsWith(".svg") || t.logo.endsWith(".webp"));
      const bgCol = t.accent_color || t.color || '#4F8CFF';
      
      let logoStyle;
      if (isSupabaseLogo) {
          logoStyle = `background-image:url('${t.logo}'); background-size:cover; background-position:center; background-color:${bgCol};`;
      } else if (isLocalLogo) {
          logoStyle = `background-image:url('assets/logos/${t.logo}'); background-size:cover; background-position:center; background-color:${bgCol};`;
      } else {
          logoStyle = `background:${bgCol};`;
      }

      const logoContent = (isSupabaseLogo || isLocalLogo) ? '' : initials(t.name);
      const targetUrl = t.website || t.url || '#';
      const isFeatured = t.sponsored || t.featured;

      return `
        <a href="${targetUrl}" target="_blank" rel="noopener" aria-label="${t.name} — ${descText}">
          <div class="card ${isFeatured ? 'sponsored' : ''}">
            <div class="card-top">
              <div class="logo" style="${logoStyle}">${logoContent}</div>
              ${isFeatured ? '<span class="sponsor-tag">Featured</span>' : ''}
            </div>
            <div class="card-content">
              <h3 class="card-name">${t.name}</h3>
              <p class="card-tagline">${descText}</p>
            </div>
            <div class="card-bottom">
              <span class="category-badge">${t.category}</span>
              <span class="open-link">Open
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </span>
            </div>
          </div>
        </a>
      `;
    }).join("");
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchQuery.length > 0 ? "flex" : "none";
      }
      renderGrid();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      clearSearchBtn.style.display = "none";
      if (searchInput) searchInput.focus();
      renderGrid();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      activeCategory = "All";
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      renderSegmented();
      renderGrid();
    });
  }

  function setButtonLoading(btn, isLoading, loadingText = "Processing...") {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${loadingText}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
    }
  }

  if (dbRetryBtn) {
    dbRetryBtn.addEventListener("click", async () => {
      setButtonLoading(dbRetryBtn, true, "Retrying...");
      try {
        const ok = await fetchTools();
        if (ok) {
          updateLiveStats();
          renderGrid();
          if (window.showToast) window.showToast("Connected to database successfully!", "success");
        }
      } finally {
        setButtonLoading(dbRetryBtn, false);
      }
    });
  }

  await loadSettings();
  await fetchCategories();
  renderSegmented();
  renderCollections();
  const ok = await fetchTools();
  if (ok) {
    updateLiveStats();
    renderGrid();
  }
})();
