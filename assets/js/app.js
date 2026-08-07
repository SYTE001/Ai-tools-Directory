(async function PublicApp() {
  let tools = [];
  let categories = [];
  let activeCategory = "All";
  let searchQuery = "";
  let siteSettings = {};

  let visibleCount = 24;

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

  function getPublishedTools(toolList = tools) {
    return (toolList || []).filter(t => !t.status || t.status === 'published');
  }

  function getFeaturedTools(toolList = tools) {
    const published = getPublishedTools(toolList);
    return published.filter(t => t.homepage_position === 'featured');
  }

  function getHeroTool(toolList = tools) {
    const published = getPublishedTools(toolList);
    return published.find(t => t.homepage_position === 'hero') || null;
  }

  function getSponsorTool(toolList = tools) {
    const published = getPublishedTools(toolList);
    return published.find(t => t.homepage_position === 'sponsor') || null;
  }

  function getNewlyAddedTools(toolList = tools) {
    const published = getPublishedTools(toolList);
    return [...published]
      .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0))
      .slice(0, 4);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeUrl(url) {
    if (!url) return '#';
    const clean = String(url).trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('#') || clean.startsWith('/')) {
      return escapeHtml(clean);
    }
    return '#';
  }

  function renderToolLogo(tool, options = {}) {
    const width = options.width || 42;
    const height = options.height || 42;
    const borderRadius = options.borderRadius || 10;
    const extraClass = options.extraClass || '';
    const borderStyle = options.borderStyle || '1px solid rgba(255, 255, 255, 0.1)';

    const isSupabaseLogo = tool.logo && tool.logo.startsWith("http");
    const isLocalLogo = tool.logo && !isSupabaseLogo && (tool.logo.endsWith(".png") || tool.logo.endsWith(".svg") || tool.logo.endsWith(".webp") || tool.logo.endsWith(".jpg"));
    const logoUrl = isSupabaseLogo ? sanitizeUrl(tool.logo) : (isLocalLogo ? `assets/logos/${escapeHtml(tool.logo)}` : null);
    const bgCol = escapeHtml(tool.accent_color || tool.color || '#4F8CFF');
    const initText = escapeHtml((tool.name || 'AI').slice(0, 2).toUpperCase());

    if (logoUrl) {
      return `
        <div class="logo ${extraClass}" style="width:${width}px; height:${height}px; border-radius:${borderRadius}px; background-color:${bgCol}; border:${borderStyle}; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <img data-src="${logoUrl}" alt="${escapeHtml(tool.name)} logo" loading="lazy" decoding="async" class="lazy-logo" style="width:100%; height:100%; object-fit:cover; border-radius:${borderRadius}px; opacity:0; transition:opacity 0.25s ease-out;">
        </div>
      `;
    }

    return `
      <div class="logo ${extraClass}" style="width:${width}px; height:${height}px; border-radius:${borderRadius}px; background:${bgCol}; border:${borderStyle}; color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-size:${Math.round(width * 0.38)}px; font-weight:700; flex-shrink:0;">
        ${initText}
      </div>
    `;
  }

  let logoObserver = null;

  function observeLazyLogos(container = document) {
    if (!container) return;
    const lazyImages = container.querySelectorAll("img.lazy-logo[data-src]");
    if (lazyImages.length === 0) return;

    if ("IntersectionObserver" in window) {
      if (!logoObserver) {
        logoObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute("data-src");
                img.onload = () => { img.style.opacity = "1"; };
                img.onerror = () => { img.style.opacity = "1"; };
              }
              observer.unobserve(img);
            }
          });
        }, { rootMargin: "100px 0px" });
      }

      lazyImages.forEach(img => logoObserver.observe(img));
    } else {
      lazyImages.forEach(img => {
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          img.style.opacity = "1";
        }
      });
    }
  }

  async function fetchHomepageData() {
    renderSkeletons();

    if (typeof StorageService !== "undefined") {
      try {
        siteSettings = await StorageService.fetchSettings();
        const githubEls = document.querySelectorAll("#githubLink, #footerGithubLink");
        const twitterEl = document.getElementById("twitterLink");

        if (githubEls.length && siteSettings.githubUrl) {
          githubEls.forEach(el => {
            el.href = sanitizeUrl(siteSettings.githubUrl);
            el.title = `GitHub Repository (${escapeHtml(siteSettings.githubUrl)})`;
          });
        }
        if (twitterEl && siteSettings.twitterUrl) {
          twitterEl.href = sanitizeUrl(siteSettings.twitterUrl);
          twitterEl.title = `Twitter / X Profile (${escapeHtml(siteSettings.twitterUrl)})`;
        }
        if (siteSettings.siteTitle) {
          const siteTitleEl = document.getElementById("siteTitle");
          if (siteTitleEl) siteTitleEl.textContent = siteSettings.siteTitle;
        }
      } catch (e) {
        console.warn("Failed to load settings:", e);
      }
    }

    const defaultCats = [
      { id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" }
    ];

    let fetchSuccess = false;

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data: catData, error: catError } = await supabaseClient
          .from("categories")
          .select("*")
          .order("name");

        if (catError) {
          console.error("Query failed: categories.select('*').order('name')", catError);
        } else if (catData && catData.length > 0) {
          categories = [
            { id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" },
            ...catData
          ];
        } else {
          categories = defaultCats;
        }

        const { data: toolsData, error: toolsError } = await supabaseClient
          .from("tools")
          .select("id, name, description, website, logo, category, category_id, homepage_position, featured, sponsored, accent_color, status, created_at, updated_at, categories:category_id(name, icon, color)");

        if (toolsError) {
          console.error("Query failed: tools.select(...)", toolsError);
          if (dbErrorBanner) dbErrorBanner.style.display = "flex";
          tools = [];
        } else {
          if (dbErrorBanner) dbErrorBanner.style.display = "none";
          
          const rawTools = (toolsData || []).map(t => {
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

          tools = getPublishedTools(rawTools);
          fetchSuccess = true;
        }
      } catch (err) {
        console.error("Supabase fetch exception:", err);
        if (dbErrorBanner) dbErrorBanner.style.display = "flex";
        tools = [];
      }
    } else {
      if (dbErrorBanner) dbErrorBanner.style.display = "flex";
      tools = [];
    }

    if (!fetchSuccess && categories.length === 0) {
      categories = defaultCats;
    }

    return fetchSuccess;
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

  function renderHero() {
    const heroCard = document.getElementById("heroToolCard");
    if (!heroCard) return;

    const parentSection = heroCard.closest("section") || document.querySelector(".featured-showcase");
    const heroTool = getHeroTool(tools);

    if (!heroTool) {
      if (parentSection) parentSection.style.display = "none";
      return;
    }

    if (parentSection) parentSection.style.display = "block";

    const bgCol = escapeHtml(heroTool.accent_color || heroTool.color || '#4F8CFF');
    const logoHtml = renderToolLogo(heroTool, { width: 80, height: 80, borderRadius: 20, borderStyle: '1px solid var(--border)' });

    heroCard.innerHTML = `
      <div>
        <div class="showcase-badge">✨ Featured Tool of the Week</div>
        <h2 class="showcase-title">${escapeHtml(heroTool.name)}</h2>
        <p class="showcase-desc">${escapeHtml(heroTool.description || '')}</p>
        <a href="${sanitizeUrl(heroTool.website || heroTool.url)}" target="_blank" rel="noopener" class="showcase-btn" style="background:${bgCol}; color:#fff;">Try ${escapeHtml(heroTool.name)} →</a>
      </div>
      ${logoHtml}
    `;

    observeLazyLogos(heroCard);
  }

  function renderSponsor() {
    const sponsorCard = document.getElementById("sponsorToolCard");
    if (!sponsorCard) return;

    const parentSection = sponsorCard.closest("section") || document.querySelector(".sponsor-spotlight");
    const sponsorTool = getSponsorTool(tools);

    if (!sponsorTool) {
      if (parentSection) parentSection.style.display = "none";
      return;
    }

    if (parentSection) parentSection.style.display = "block";

    const logoHtml = renderToolLogo(sponsorTool, { width: 56, height: 56, borderRadius: 14, borderStyle: '1px solid var(--sponsor-border)' });

    sponsorCard.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px;">
        ${logoHtml}
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--text);">${escapeHtml(sponsorTool.name)}</h3>
            <span class="sponsor-tag">Partner Spotlight</span>
          </div>
          <p style="margin:0; font-size:13.5px; color:var(--text-secondary); line-height:1.4;">${escapeHtml(sponsorTool.description || '')}</p>
        </div>
      </div>
      <a href="${sanitizeUrl(sponsorTool.website || sponsorTool.url)}" target="_blank" rel="noopener" class="showcase-btn" style="background:var(--surface); color:var(--text); border:1px solid var(--border); flex-shrink:0;">Visit ${escapeHtml(sponsorTool.name)} →</a>
    `;

    observeLazyLogos(sponsorCard);
  }

  function renderFeatured() {
    const featuredGrid = document.getElementById("featuredScrollGrid") || 
                         document.querySelector('[aria-label="Featured AI Tools"] .horizontal-scroll-grid');
    if (!featuredGrid) return;

    const parentSection = featuredGrid.closest("section");
    const featuredTools = getFeaturedTools(tools).slice(0, 8);

    if (featuredTools.length === 0) {
      if (parentSection) parentSection.style.display = "none";
      return;
    }

    if (parentSection) parentSection.style.display = "block";

    featuredGrid.innerHTML = featuredTools.map(t => {
      const nameEsc = escapeHtml(t.name);
      const descEsc = escapeHtml(t.description || '');
      const urlEsc = sanitizeUrl(t.website || t.url || '#');
      return `
        <a href="${urlEsc}" target="_blank" rel="noopener" class="trending-card">
          <span class="trending-tag">🔥 Featured</span>
          <strong style="font-size:15px; color:var(--text);">${nameEsc}</strong>
          <span style="font-size:13px; color:var(--text-secondary); line-height:1.4;">${descEsc}</span>
        </a>
      `;
    }).join("");

    observeLazyLogos(featuredGrid);
  }

  function renderNewest() {
    const newlyAddedGrid = document.getElementById("newlyAddedGrid") || 
                           document.querySelector('[aria-label="Newly Added AI Tools"] .horizontal-scroll-grid');
    if (!newlyAddedGrid) return;

    const parentSection = newlyAddedGrid.closest("section");
    const newestTools = getNewlyAddedTools(tools);

    if (newestTools.length === 0) {
      if (parentSection) parentSection.style.display = "none";
      return;
    }

    if (parentSection) parentSection.style.display = "block";

    newlyAddedGrid.innerHTML = newestTools.map(t => {
      const nameEsc = escapeHtml(t.name);
      const catEsc = escapeHtml(t.category || 'AI');
      const descEsc = escapeHtml(t.description || '');
      const urlEsc = sanitizeUrl(t.website || t.url || '#');
      return `
        <a href="${urlEsc}" target="_blank" rel="noopener" class="trending-card">
          <span class="trending-tag" style="color:var(--text-muted);">New • ${catEsc}</span>
          <strong style="font-size:15px; color:var(--text);">${nameEsc}</strong>
          <span style="font-size:13px; color:var(--text-secondary); line-height:1.4;">${descEsc}</span>
        </a>
      `;
    }).join("");

    observeLazyLogos(newlyAddedGrid);
  }

  const CATEGORY_ICONS = {
    "All": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`,
    "3D": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    "Audio": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`,
    "Automation": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`,
    "Chat": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    "Coding": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    "Design": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
    "Education": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    "Experimental": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.31L4.75 18.5A2 2 0 0 0 6.46 21.5h11.08a2 2 0 0 0 1.71-3L14 9.31V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>`,
    "Image": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    "Image Generation": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    "Marketing": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,
    "Productivity": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    "Research": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    "Text Generation": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    "Writing": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    "Video": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4l2 4"/><path d="M12 4l2 4"/><path d="M18 4l2 4"/></svg>`,
    "Arrow Right": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`
  };

  function getCategoryIconSvg(categoryName) {
    if (!categoryName) return CATEGORY_ICONS["All"];
    const name = String(categoryName).trim();
    return CATEGORY_ICONS[name] || CATEGORY_ICONS["All"];
  }

  function renderCategories() {
    const categoryGrid = document.getElementById("categoryCardsGrid") || document.querySelector(".category-cards-grid");
    if (!categoryGrid) return;

    const parentSection = categoryGrid.closest("section");
    const publishedTools = getPublishedTools(tools);

    const categoryCounts = {};
    publishedTools.forEach(t => {
      const catName = t.category || "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      if (t.category_id) {
        categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
      }
    });

    let activeCategories = categories.filter(cat => {
      if (cat.name === "All") return false;
      const count = categoryCounts[cat.name] || categoryCounts[cat.id] || 0;
      return count > 0;
    });

    if (activeCategories.length === 0) {
      if (parentSection) parentSection.style.display = "none";
      return;
    }

    if (parentSection) parentSection.style.display = "block";

    categoryGrid.innerHTML = activeCategories.map(cat => {
      const count = categoryCounts[cat.name] || categoryCounts[cat.id] || 0;
      const countLabel = count === 1 ? "1 Tool" : `${count} Tools`;
      const catNameEsc = escapeHtml(cat.name);
      const iconSvg = getCategoryIconSvg(cat.name);

      return `
        <a href="#" class="cat-card" data-cat="${catNameEsc}">
          <div class="cat-icon-wrap">
            <span class="cat-icon">${iconSvg}</span>
            <span class="cat-title">${catNameEsc}</span>
          </div>
          <span class="cat-count">${countLabel}</span>
        </a>
      `;
    }).join("");

    categoryGrid.querySelectorAll(".cat-card").forEach(card => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const catName = card.dataset.cat;
        if (catName) {
          activeCategory = catName;
          visibleCount = 24;
          renderSegmented();
          renderGrid();
          if (segmentedEl) {
            segmentedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      });
    });
  }

  async function renderStats() {
    const toolCountEl = document.getElementById("toolCount");
    const categoryCountEl = document.getElementById("categoryCount");
    const featuredCountEl = document.getElementById("featuredCount");
    const lastUpdatedCountEl = document.getElementById("lastUpdatedCount");

    let statsData = null;

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("directory_stats")
          .select("*");

        if (!error && data && data.length > 0) {
          statsData = data[0];
        }
      } catch (e) {
        console.warn("Failed to fetch directory_stats view:", e);
      }
    }

    if (statsData) {
      const toolCount = statsData.total_tools ?? statsData.tool_count ?? statsData.ai_tools ?? statsData.total_published ?? 0;
      const categoryCount = statsData.total_categories ?? statsData.category_count ?? statsData.categories ?? 0;
      const featuredCount = statsData.featured_tools ?? statsData.featured_count ?? statsData.featured ?? 0;
      const rawUpdate = statsData.last_updated ?? statsData.fresh_updates ?? statsData.updated_at ?? null;

      let freshUpdateLabel = "Live";
      if (rawUpdate) {
        const d = new Date(rawUpdate);
        if (!isNaN(d.getTime())) {
          const diffHours = Math.floor((new Date() - d) / (1000 * 60 * 60));
          freshUpdateLabel = diffHours < 24 ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } else {
          freshUpdateLabel = String(rawUpdate);
        }
      }

      if (toolCountEl) toolCountEl.textContent = toolCount > 0 ? `${toolCount}+` : '0';
      if (categoryCountEl) categoryCountEl.textContent = categoryCount > 0 ? `${categoryCount}+` : '0';
      if (featuredCountEl) featuredCountEl.textContent = featuredCount > 0 ? `${featuredCount}` : '0';
      if (lastUpdatedCountEl) lastUpdatedCountEl.textContent = freshUpdateLabel;
      return;
    }

    const publishedTools = getPublishedTools(tools);
    const totalTools = publishedTools.length;
    const activeCategoryCount = categories.filter(c => c.name !== "All").length;
    const featuredToolsCount = getFeaturedTools(publishedTools).length;

    if (toolCountEl) toolCountEl.textContent = totalTools > 0 ? `${totalTools}+` : '0';
    if (categoryCountEl) categoryCountEl.textContent = activeCategoryCount > 0 ? `${activeCategoryCount}+` : '0';
    if (featuredCountEl) featuredCountEl.textContent = featuredToolsCount > 0 ? `${featuredToolsCount}` : '0';
    if (lastUpdatedCountEl) lastUpdatedCountEl.textContent = totalTools > 0 ? "Live" : "Active";
  }

  function renderFooterCategories() {
    const footerCatList = document.getElementById("footerCategoryLinks");
    if (!footerCatList) return;

    const publishedTools = getPublishedTools(tools);

    const categoryCounts = {};
    publishedTools.forEach(t => {
      const catName = t.category || "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      if (t.category_id) {
        categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
      }
    });

    let activeCategories = categories.filter(cat => {
      if (cat.name === "All") return false;
      const count = categoryCounts[cat.name] || categoryCounts[cat.id] || 0;
      return count > 0;
    }).slice(0, 6);

    if (activeCategories.length === 0) {
      footerCatList.innerHTML = `<li><a href="#" onclick="event.preventDefault();">Directory</a></li>`;
      return;
    }

    footerCatList.innerHTML = activeCategories.map(cat => {
      const catNameEsc = escapeHtml(cat.name);
      return `<li><a href="#" data-footer-cat="${catNameEsc}">${catNameEsc} AI</a></li>`;
    }).join("");

    footerCatList.querySelectorAll("a[data-footer-cat]").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const catName = link.dataset.footerCat;
        if (catName) {
          activeCategory = catName;
          visibleCount = 24;
          renderSegmented();
          renderGrid();
          if (segmentedEl) {
            segmentedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      });
    });
  }

  function ensureLoadMoreButton() {
    if (!gridEl) return null;
    let wrapper = document.getElementById("loadMoreWrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "loadMoreWrapper";
      wrapper.style.cssText = "margin-top: 32px; text-align: center; display: none;";

      wrapper.innerHTML = `
        <div id="loadMoreCount" style="font-size: 13px; font-weight: 500; color: var(--text-muted); margin-bottom: 14px; letter-spacing: -0.01em;">
          Showing 0 of 0 Tools
        </div>
        <button id="loadMoreBtn" type="button" class="load-more-btn">
          Load More Tools
        </button>
      `;

      const btn = wrapper.querySelector("#loadMoreBtn");
      if (btn) {
        btn.addEventListener("click", () => {
          visibleCount += 24;
          renderGrid();
        });
      }

      if (gridEl.parentNode) {
        gridEl.parentNode.insertBefore(wrapper, gridEl.nextSibling);
      }
    }
    return wrapper;
  }

  function updateLoadMoreButton(filteredTotalLength) {
    const wrapper = ensureLoadMoreButton();
    if (!wrapper) return;
    const countEl = document.getElementById("loadMoreCount");
    const visibleNumber = Math.min(visibleCount, filteredTotalLength);
    if (countEl) {
      countEl.textContent = `Showing ${visibleNumber} of ${filteredTotalLength} Tools`;
    }
    if (visibleCount >= filteredTotalLength) {
      wrapper.style.display = "none";
    } else {
      wrapper.style.display = "block";
    }
  }

  function openCategoryBottomSheet() {
    const overlay = document.getElementById("categoryBottomSheet");
    const container = document.getElementById("bottomSheetCatList");
    if (!overlay || !container) return;

    const publishedTools = getPublishedTools(tools);
    const categoryCounts = {};
    publishedTools.forEach(t => {
      const catName = t.category || "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      if (t.category_id) {
        categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
      }
    });

    container.innerHTML = categories.map(cat => {
      const isActive = cat.name === activeCategory;
      const catNameEsc = escapeHtml(cat.name);
      const iconSvg = getCategoryIconSvg(cat.name);
      const count = cat.name === "All" ? publishedTools.length : (categoryCounts[cat.name] || categoryCounts[cat.id] || 0);

      return `
        <div class="bottom-sheet-cat-item ${isActive ? 'active' : ''}" data-cat="${catNameEsc}">
          <span class="chip-icon">${iconSvg}</span>
          <div style="flex:1; min-width:0;">
            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${catNameEsc}</div>
            <div style="font-size:11px; color:var(--text-muted); font-weight:400;">${count} Tools</div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".bottom-sheet-cat-item").forEach(item => {
      item.addEventListener("click", () => {
        activeCategory = item.dataset.cat;
        visibleCount = 24;
        renderSegmented();
        renderGrid();
        closeCategoryBottomSheet();
      });
    });

    overlay.classList.add("active");
  }

  function closeCategoryBottomSheet() {
    const overlay = document.getElementById("categoryBottomSheet");
    if (overlay) overlay.classList.remove("active");
  }

  const closeBottomSheetBtn = document.getElementById("closeBottomSheetBtn");
  if (closeBottomSheetBtn) {
    closeBottomSheetBtn.addEventListener("click", closeCategoryBottomSheet);
  }

  const categoryBottomSheetOverlay = document.getElementById("categoryBottomSheet");
  if (categoryBottomSheetOverlay) {
    categoryBottomSheetOverlay.addEventListener("click", (e) => {
      if (e.target === categoryBottomSheetOverlay) {
        closeCategoryBottomSheet();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCategoryBottomSheet();
    }
  });

  function renderSegmented() {
    if (!segmentedEl) return;
    
    const chipsHtml = categories.map(cat => {
      const isActive = cat.name === activeCategory;
      const catNameEsc = escapeHtml(cat.name);
      const iconSvg = getCategoryIconSvg(cat.name);
      return `<button class="${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" data-cat="${catNameEsc}"><span class="chip-icon">${iconSvg}</span><span class="chip-text">${catNameEsc}</span></button>`;
    }).join("");

    const viewAllChipHtml = `<button class="view-all-chip" id="viewAllCategoriesBtn" type="button"><span class="chip-text">View All</span><span class="chip-icon">${CATEGORY_ICONS["Arrow Right"]}</span></button>`;

    segmentedEl.innerHTML = chipsHtml + viewAllChipHtml;

    segmentedEl.querySelectorAll("button[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        visibleCount = 24;
        renderSegmented();
        renderGrid();
      });
    });

    const viewAllBtn = document.getElementById("viewAllCategoriesBtn");
    if (viewAllBtn) {
      viewAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openCategoryBottomSheet();
      });
    }
  }

  function renderCollections() {
    if (!collectionsWrap) return;
    const catList = categories.filter(c => c.name !== "All");
    collectionsWrap.innerHTML = catList.map(cat => `
      <div class="collection-card" tabindex="0" role="button" aria-label="Browse ${escapeHtml(cat.name)} tools" data-cat="${escapeHtml(cat.name)}">
        <span class="chip-icon">${getCategoryIconSvg(cat.name)}</span>
        <span class="collection-name">${escapeHtml(cat.name)} Tools</span>
      </div>
    `).join("");
  }

  function renderGrid() {
    const publishedTools = getPublishedTools(tools);
    const filtered = publishedTools.filter(t => {
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      const matchesSearch = !searchQuery || 
                            (t.name && t.name.toLowerCase().includes(searchQuery)) ||
                            (t.description && t.description.toLowerCase().includes(searchQuery)) ||
                            (t.category && t.category.toLowerCase().includes(searchQuery));
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      const aFeatured = a.homepage_position === 'featured' || a.featured || a.sponsored ? 1 : 0;
      const bFeatured = b.homepage_position === 'featured' || b.featured || b.sponsored ? 1 : 0;
      if (bFeatured !== aFeatured) return bFeatured - aFeatured;

      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    if (filtered.length === 0) {
      gridEl.style.display = "none";
      if (emptyStateEl) emptyStateEl.style.display = "flex";
      const wrapper = document.getElementById("loadMoreWrapper");
      if (wrapper) wrapper.style.display = "none";
      return;
    }

    gridEl.style.display = "grid";
    if (emptyStateEl) emptyStateEl.style.display = "none";

    const visibleBatch = filtered.slice(0, visibleCount);

    gridEl.innerHTML = visibleBatch.map(t => {
      const descText = t.description || "";
      const targetUrl = sanitizeUrl(t.website || t.url || '#');
      const isFeatured = t.homepage_position === 'featured' || t.sponsored || t.featured;

      const nameEsc = escapeHtml(t.name);
      const descEsc = escapeHtml(descText);
      const catEsc = escapeHtml(t.category);
      const logoHtml = renderToolLogo(t, { width: 42, height: 42, borderRadius: 10 });

      return `
        <a href="${targetUrl}" target="_blank" rel="noopener" aria-label="${nameEsc} — ${descEsc}">
          <div class="card ${isFeatured ? 'sponsored' : ''}">
            <div class="card-top">
              ${logoHtml}
              ${isFeatured ? '<span class="sponsor-tag">Featured</span>' : ''}
            </div>
            <div class="card-content">
              <h3 class="card-name">${nameEsc}</h3>
              <p class="card-tagline">${descEsc}</p>
            </div>
            <div class="card-bottom">
              <span class="category-badge">${catEsc}</span>
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

    observeLazyLogos(gridEl);
    updateLoadMoreButton(filtered.length);
  }

  let scrollSearchTimeout = null;

  function scrollToResultsIfNecessary() {
    if (scrollSearchTimeout) {
      clearTimeout(scrollSearchTimeout);
      scrollSearchTimeout = null;
    }

    if (!searchQuery) return;

    scrollSearchTimeout = setTimeout(() => {
      const publishedTools = getPublishedTools(tools);
      const hasMatches = publishedTools.some(t => {
        const matchesCategory = activeCategory === "All" || t.category === activeCategory;
        const matchesSearch = !searchQuery || 
                              (t.name && t.name.toLowerCase().includes(searchQuery)) ||
                              (t.description && t.description.toLowerCase().includes(searchQuery)) ||
                              (t.category && t.category.toLowerCase().includes(searchQuery));
        return matchesCategory && matchesSearch;
      });

      if (!hasMatches) return;

      const mainHeader = document.querySelector("main .section-header") || gridEl;
      if (!mainHeader) return;

      const rect = mainHeader.getBoundingClientRect();
      const headerOffset = 80;

      if (rect.top >= headerOffset && rect.top <= window.innerHeight * 0.6) {
        return;
      }

      if (rect.top < 0) {
        return;
      }

      const targetY = window.pageYOffset + rect.top - headerOffset;
      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: "smooth"
      });
    }, 200);
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      visibleCount = 24;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchQuery.length > 0 ? "flex" : "none";
      }
      renderGrid();
      if (searchQuery.length > 0) {
        scrollToResultsIfNecessary();
      } else if (scrollSearchTimeout) {
        clearTimeout(scrollSearchTimeout);
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (scrollSearchTimeout) clearTimeout(scrollSearchTimeout);
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      visibleCount = 24;
      clearSearchBtn.style.display = "none";
      if (searchInput) searchInput.focus();
      renderGrid();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (scrollSearchTimeout) clearTimeout(scrollSearchTimeout);
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      activeCategory = "All";
      visibleCount = 24;
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      renderSegmented();
      renderGrid();
    });
  }

  const newsletterForm = document.querySelector(".newsletter-form");
  if (newsletterForm) {
    newsletterForm.removeAttribute("onsubmit");
    newsletterForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector(".newsletter-input");
      const submitBtn = newsletterForm.querySelector(".newsletter-btn");
      if (!input) return;

      const email = input.value.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !emailRegex.test(email)) {
        if (window.showToast) window.showToast("Please enter a valid email address.", "error");
        return;
      }

      setButtonLoading(submitBtn, true, "Subscribing...");

      try {
        if (typeof supabaseClient !== "undefined" && supabaseClient) {
          const { data: existing, error: checkError } = await supabaseClient
            .from("newsletter_subscribers")
            .select("id, email")
            .eq("email", email);

          if (!checkError && existing && existing.length > 0) {
            if (window.showToast) window.showToast("This email is already subscribed!", "info");
            return;
          }

          const { error: insertError } = await supabaseClient
            .from("newsletter_subscribers")
            .insert([{ email: email, created_at: new Date().toISOString() }]);

          if (insertError) {
            if (insertError.code === '23505' || (insertError.message && insertError.message.includes("unique"))) {
              if (window.showToast) window.showToast("This email is already subscribed!", "info");
            } else {
              console.error("Newsletter insert error:", insertError);
              if (window.showToast) window.showToast(insertError.message || "Failed to subscribe. Please try again.", "error");
            }
            return;
          }
        }

        if (window.showToast) window.showToast("Thank you for subscribing to Xnovaa.ai Newsletter!", "success");
        newsletterForm.reset();
      } catch (err) {
        console.error("Newsletter subscription exception:", err);
        if (window.showToast) window.showToast("Subscription error. Please try again.", "error");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  function setButtonLoading(btn, isLoading, loadingText = "Processing...") {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${escapeHtml(loadingText)}`;
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
        const ok = await fetchHomepageData();
        if (ok) {
          visibleCount = 24;
          await renderStats();
          renderHero();
          renderSponsor();
          renderFeatured();
          renderNewest();
          renderCategories();
          renderFooterCategories();
          renderSegmented();
          renderGrid();
          if (window.showToast) window.showToast("Connected to database successfully!", "success");
        }
      } finally {
        setButtonLoading(dbRetryBtn, false);
      }
    });
  }

  window.fetchHomepageData = fetchHomepageData;
  window.renderHero = renderHero;
  window.renderSponsor = renderSponsor;
  window.renderFeatured = renderFeatured;
  window.renderNewest = renderNewest;
  window.renderCategories = renderCategories;
  window.renderFooterCategories = renderFooterCategories;
  window.renderStats = renderStats;
  window.renderToolLogo = renderToolLogo;
  window.observeLazyLogos = observeLazyLogos;
  window.getPublishedTools = getPublishedTools;
  window.getFeaturedTools = getFeaturedTools;
  window.getHeroTool = getHeroTool;
  window.getSponsorTool = getSponsorTool;
  window.getNewlyAddedTools = getNewlyAddedTools;
  window.renderCategoryCards = renderCategories;
  window.renderNewlyAddedTools = renderNewest;
  window.openCategoryBottomSheet = openCategoryBottomSheet;
  window.closeCategoryBottomSheet = closeCategoryBottomSheet;

  const ok = await fetchHomepageData();
  visibleCount = 24;
  await renderStats();
  renderHero();
  renderSponsor();
  renderFeatured();
  renderNewest();
  renderCategories();
  renderFooterCategories();
  renderSegmented();
  renderCollections();
  renderGrid();
})();
