/**
 * Public Website Application Controller — directory.ai / Xnovaa.ai
 * Data-driven architecture powered by Supabase.
 */
(async function PublicApp() {
  let tools = [];
  let categories = [];
  let activeCategory = "All";
  let searchQuery = "";
  let siteSettings = {};

  // Infinite Scroll State
  let visibleCount = 24;
  let isLoadingMore = false;
  let gridSentinelObserver = null;

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

  // Reusable Helper Functions for status & homepage_position filtering
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

  // Security Sanitization Helpers
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

  // LAZY LOGO LOAD HELPERS (IntersectionObserver + loading="lazy" decoding="async")
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
      // Graceful fallback for unsupported browsers
      lazyImages.forEach(img => {
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          img.style.opacity = "1";
        }
      });
    }
  }

  // 1. SINGLE DATA FETCH FOR HOMEPAGE
  async function fetchHomepageData() {
    renderSkeletons();

    // Fetch site settings
    if (typeof StorageService !== "undefined") {
      try {
        siteSettings = await StorageService.fetchSettings();
        const githubEl = document.getElementById("githubLink");
        const twitterEl = document.getElementById("twitterLink");

        if (githubEl && siteSettings.githubUrl) {
          githubEl.href = sanitizeUrl(siteSettings.githubUrl);
          githubEl.title = `GitHub Repository (${escapeHtml(siteSettings.githubUrl)})`;
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

    // Default category fallback
    const defaultCats = [
      { id: "cat_all", name: "All", icon: "📚", color: "#4F8CFF" }
    ];

    let fetchSuccess = false;

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        // Fetch Categories
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

        // Fetch Tools (Minimal select optimization)
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

          // Store only published tools for public homepage
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

  // 2. HERO TOOL RENDERER (homepage_position = 'hero', status = 'published')
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

  // 3. SPONSOR SPOTLIGHT RENDERER (homepage_position = 'sponsor', status = 'published')
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

  // 4. FEATURED SECTION RENDERER (homepage_position = 'featured', status = 'published', max 8)
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

  // 5. NEWLY ADDED RENDERER (status = 'published', ORDER BY created_at DESC, limit 4)
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

  // 6. BROWSE BY CATEGORY RENDERER (Supabase categories source of truth, count published tools)
  function renderCategories() {
    const categoryGrid = document.getElementById("categoryCardsGrid") || document.querySelector(".category-cards-grid");
    if (!categoryGrid) return;

    const parentSection = categoryGrid.closest("section");
    const publishedTools = getPublishedTools(tools);

    // Count published tools per category name & ID
    const categoryCounts = {};
    publishedTools.forEach(t => {
      const catName = t.category || "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      if (t.category_id) {
        categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
      }
    });

    // Pure Source of Truth: Filter categories from categories table with >0 published tools
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
      const iconEsc = escapeHtml(cat.icon || "✨");

      return `
        <a href="#" class="cat-card" data-cat="${catNameEsc}">
          <div class="cat-icon-wrap">
            <span class="cat-icon">${iconEsc}</span>
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

  // 7. LIVE STATS RENDERER (fetches directly from public.directory_stats view)
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

    // Fallback if directory_stats view is unavailable
    const publishedTools = getPublishedTools(tools);
    const totalTools = publishedTools.length;
    const activeCategoryCount = categories.filter(c => c.name !== "All").length;
    const featuredToolsCount = getFeaturedTools(publishedTools).length;

    if (toolCountEl) toolCountEl.textContent = totalTools > 0 ? `${totalTools}+` : '0';
    if (categoryCountEl) categoryCountEl.textContent = activeCategoryCount > 0 ? `${activeCategoryCount}+` : '0';
    if (featuredCountEl) featuredCountEl.textContent = featuredToolsCount > 0 ? `${featuredToolsCount}` : '0';
    if (lastUpdatedCountEl) lastUpdatedCountEl.textContent = totalTools > 0 ? "Live" : "Active";
  }

  // 8. DYNAMIC FOOTER CATEGORIES RENDERER (max 6 categories with >0 published tools)
  function renderFooterCategories() {
    const footerCatList = document.getElementById("footerCategoryLinks");
    if (!footerCatList) return;

    const publishedTools = getPublishedTools(tools);

    // Count published tools per category
    const categoryCounts = {};
    publishedTools.forEach(t => {
      const catName = t.category || "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      if (t.category_id) {
        categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
      }
    });

    // Filter categories with >0 published tools, limit to max 6
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

  // INFINITE SCROLL SENTINEL & OBSERVER
  function ensureGridSentinel() {
    if (!gridEl) return null;
    let sentinel = document.getElementById("gridSentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.id = "gridSentinel";
      sentinel.style.cssText = "grid-column: 1 / -1; margin-top: 32px; padding: 20px 0; text-align: center; display: none;";
      sentinel.innerHTML = `
        <div style="display:inline-flex; align-items:center; justify-content:center; gap:10px; color:var(--text-secondary); font-size:13.5px; font-weight:600; background:var(--surface); border:1px solid var(--border); padding:10px 24px; border-radius:999px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <span class="spinner" style="width:16px; height:16px; border-width:2px; border-color:var(--text-muted); border-top-color:var(--text);"></span>
          Loading more AI tools...
        </div>
      `;
      if (gridEl.parentNode) {
        gridEl.parentNode.insertBefore(sentinel, gridEl.nextSibling);
      }
    }
    return sentinel;
  }

  function setupInfiniteScroll(filteredTotalLength) {
    const sentinel = ensureGridSentinel();
    if (!sentinel) return;

    if (visibleCount >= filteredTotalLength) {
      sentinel.style.display = "none";
      return;
    }

    sentinel.style.display = "block";

    if ("IntersectionObserver" in window) {
      if (gridSentinelObserver) {
        gridSentinelObserver.disconnect();
      }

      gridSentinelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !isLoadingMore && visibleCount < filteredTotalLength) {
            isLoadingMore = true;
            setTimeout(() => {
              visibleCount += 24;
              renderGrid();
              isLoadingMore = false;
            }, 120);
          }
        });
      }, { rootMargin: "250px 0px" });

      gridSentinelObserver.observe(sentinel);
    }
  }

  // MAIN DIRECTORY GRID RENDERER (Infinite Scroll Batching: 24 items per batch)
  function renderSegmented() {
    if (!segmentedEl) return;
    segmentedEl.innerHTML = categories.map(cat => {
      const isActive = cat.name === activeCategory;
      const catNameEsc = escapeHtml(cat.name);
      const catIconEsc = cat.icon ? escapeHtml(cat.icon) + ' ' : '';
      return `<button class="${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" data-cat="${catNameEsc}">${catIconEsc}${catNameEsc}</button>`;
    }).join("");

    segmentedEl.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        visibleCount = 24;
        renderSegmented();
        renderGrid();
      });
    });
  }

  function renderCollections() {
    if (!collectionsWrap) return;
    const catList = categories.filter(c => c.name !== "All");
    collectionsWrap.innerHTML = catList.map(cat => `
      <div class="collection-card" tabindex="0" role="button" aria-label="Browse ${escapeHtml(cat.name)} tools" data-cat="${escapeHtml(cat.name)}">
        <span class="collection-icon">${escapeHtml(cat.icon || '✨')}</span>
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

    const sentinel = document.getElementById("gridSentinel");

    if (filtered.length === 0) {
      gridEl.style.display = "none";
      if (emptyStateEl) emptyStateEl.style.display = "flex";
      if (sentinel) sentinel.style.display = "none";
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
    setupInfiniteScroll(filtered.length);
  }

  // Event Listeners for Search & Filter
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      visibleCount = 24;
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
      visibleCount = 24;
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
      visibleCount = 24;
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      renderSegmented();
      renderGrid();
    });
  }

  // NEWSLETTER SUBSCRIPTION HANDLER (Supabase integration + Duplicate Prevention + Toast Alerts)
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
          // Check if email already exists in newsletter_subscribers table
          const { data: existing, error: checkError } = await supabaseClient
            .from("newsletter_subscribers")
            .select("id, email")
            .eq("email", email);

          if (!checkError && existing && existing.length > 0) {
            if (window.showToast) window.showToast("This email is already subscribed!", "info");
            return;
          }

          // Insert new subscriber into Supabase
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

  // Retry Handler
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

  // Expose Modular Functions on Window for Global & Backward Compatibility Access
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

  // INITIALIZE HOMEPAGE DATA-DRIVEN ARCHITECTURE
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
