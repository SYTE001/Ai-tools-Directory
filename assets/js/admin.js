/**
 * Admin Dashboard Controller — directory.ai Production Controller
 */
(async function AdminApp() {

  let adminTools = [];
  let adminCategories = [];
  let siteSettings = {};

  // Elements
  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");
  const dbRetryBtn = document.getElementById("dbRetryBtn");
  const dbErrorOverlay = document.getElementById("dbErrorOverlay");

  // Navigation Items
  const navItems = document.querySelectorAll(".nav-item[data-view]");
  const viewSections = document.querySelectorAll(".view-section");

  // State Management
  let toolSearchQuery = "";
  let toolCategoryFilter = "All";
  let toolSortOrder = "Newest";
  let editingToolId = null;
  let deletingToolId = null;
  let editingCategoryId = null;

  // Button Loading State & Disabling Helper
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

  // Focus Trapping Accessibility Helper
  let lastActiveElement = null;

  function trapFocus(modalEl) {
    lastActiveElement = document.activeElement;
    const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;

    const firstEl = focusables[0];
    const lastEl = focusables[focusables.length - 1];
    firstEl.focus();

    function handleTabKey(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            lastEl.focus();
          }
        }
      } else if (e.key === 'Escape') {
        closeAllModals();
      }
    }

    modalEl._tabHandler = handleTabKey;
    modalEl.addEventListener('keydown', handleTabKey);
  }

  function releaseFocus(modalEl) {
    if (modalEl._tabHandler) {
      modalEl.removeEventListener('keydown', modalEl._tabHandler);
      delete modalEl._tabHandler;
    }
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    }
  }

  function openModal(modalEl) {
    modalEl.style.display = "flex";
    trapFocus(modalEl);
  }

  function closeModal(modalEl) {
    modalEl.style.display = "none";
    releaseFocus(modalEl);
  }

  function closeAllModals() {
    [document.getElementById("toolModal"), document.getElementById("deleteModal"), document.getElementById("categoryEditModal")].forEach(m => {
      if (m && m.style.display === "flex") {
        closeModal(m);
      }
    });
  }

  // Handle Global Escape Key for Modals
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });

  // Table Skeleton Loader
  function renderTableSkeletons() {
    const tbody = document.getElementById("toolsTableBody");
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() => `
      <tr class="skeleton-row">
        <td><div class="skeleton-bar" style="width:36px; height:36px; border-radius:8px;"></div></td>
        <td><div class="skeleton-bar" style="width:120px;"></div></td>
        <td><div class="skeleton-bar" style="width:80px;"></div></td>
        <td><div class="skeleton-bar" style="width:180px;"></div></td>
        <td><div class="skeleton-bar" style="width:70px;"></div></td>
        <td><div class="skeleton-bar" style="width:90px;"></div></td>
        <td><div class="skeleton-bar" style="width:80px;"></div></td>
      </tr>
    `).join("");
  }

  // Load tools and categories from Supabase with detailed query error reporting
  async function loadAdminData() {
    renderTableSkeletons();

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data: categoryData, error: categoryError } = await supabaseClient
          .from("categories")
          .select("*")
          .order("name");

        if (categoryError) {
          console.error("Query failed: categories.select('*').order('name')", {
            message: categoryError?.message,
            details: categoryError?.details,
            hint: categoryError?.hint,
            code: categoryError?.code
          });
        }

        const { data: toolsData, error: toolsError } = await supabaseClient
          .from("tools")
          .select("*, categories:category_id(*)");

        if (toolsError) {
          console.error("Query failed: tools.select('*, categories:category_id(*)')", {
            message: toolsError?.message,
            details: toolsError?.details,
            hint: toolsError?.hint,
            code: toolsError?.code
          });
        }

        if (toolsError || categoryError) {
          if (dbErrorOverlay) dbErrorOverlay.style.display = "flex";
          showToast("Database connection error.", "error");
          return false;
        }

        if (dbErrorOverlay) dbErrorOverlay.style.display = "none";
        adminCategories = categoryData || [];

        // Process tools mapping category_id relationships
        adminTools = (toolsData || []).map(t => {
          let categoryName = t.category;
          if (t.categories && t.categories.name) {
            categoryName = t.categories.name;
          } else if (t.category_id && adminCategories.length > 0) {
            const cat = adminCategories.find(c => String(c.id) === String(t.category_id));
            if (cat) categoryName = cat.name;
          }
          return {
            ...t,
            category: categoryName || "Uncategorized"
          };
        });

        return true;
      } catch (err) {
        console.error("Supabase load exception:", {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        });
        if (dbErrorOverlay) dbErrorOverlay.style.display = "flex";
        return false;
      }
    } else {
      if (dbErrorOverlay) dbErrorOverlay.style.display = "flex";
      return false;
    }
  }

  if (dbRetryBtn) {
    dbRetryBtn.addEventListener("click", async () => {
      setButtonLoading(dbRetryBtn, true, "Retrying...");
      try {
        const ok = await loadAdminData();
        if (ok) {
          renderDashboard();
          showToast("Connected to database successfully!", "success");
        } else {
          showToast("Retry failed. Check Supabase database connectivity.", "error");
        }
      } finally {
        setButtonLoading(dbRetryBtn, false);
      }
    });
  }

  // ===== Supabase Auth Guard =====
  async function checkAuth() {
    const isAuth = await AuthService.isAuthenticated();
    if (isAuth) {
      loginView.style.display = "none";
      dashboardView.style.display = "flex";
      await loadAdminData();
      await loadSettings();
      renderDashboard();
    } else {
      loginView.style.display = "flex";
      dashboardView.style.display = "none";
    }
  }

  // Handle Login Submission
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginBtn = document.getElementById("loginSubmitBtn");
      setButtonLoading(loginBtn, true, "Signing In...");

      try {
        const user = document.getElementById("usernameInput").value.trim();
        const pass = document.getElementById("passwordInput").value.trim();

        const res = await AuthService.login(user, pass);
        if (res.success) {
          loginError.style.display = "none";
          showToast("Signed in successfully!", "success");
          await checkAuth();
        } else {
          loginError.textContent = res.message;
          loginError.style.display = "block";
          showToast(res.message, "error");
        }
      } finally {
        setButtonLoading(loginBtn, false);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      AuthService.logout();
    });
  }

  // ===== Navigation Switcher =====
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = item.dataset.view;

      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      viewSections.forEach(sec => {
        sec.style.display = sec.id === targetView + "Section" ? "block" : "none";
      });

      if (targetView === "overview") renderOverviewStats();
      if (targetView === "tools") renderToolsTable();
      if (targetView === "categories") renderCategoriesManager();
      if (targetView === "featured") renderFeaturedOrder();
      if (targetView === "settings") renderSettingsForm();
    });
  });

  function renderDashboard() {
    renderOverviewStats();
    renderCategoryOptions();
    renderToolsTable();
    renderCategoriesManager();
  }

  // ===== 1. OVERVIEW STATS =====
  function renderOverviewStats() {
    const featuredCount = adminTools.filter(t => t.featured || t.sponsored).length;
    const newestTool = adminTools.length > 0 ? adminTools[0].name : "None";

    document.getElementById("statTotalTools").textContent = adminTools.length;
    document.getElementById("statFeaturedTools").textContent = featuredCount;
    document.getElementById("statTotalCategories").textContent = adminCategories.length;
    document.getElementById("statNewestTool").textContent = newestTool;
  }

  // ===== 2. TOOLS MANAGEMENT =====
  function renderCategoryOptions() {
    const selectEl = document.getElementById("toolCategorySelect");
    const filterSelectEl = document.getElementById("filterCategorySelect");

    const optionsHtml = adminCategories.map(c =>
      `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`
    ).join("");

    if (selectEl) selectEl.innerHTML = optionsHtml;
    if (filterSelectEl) {
      filterSelectEl.innerHTML = `<option value="All">All Categories</option>` + adminCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
    }
  }

  function renderToolsTable() {
    const tbody = document.getElementById("toolsTableBody");
    if (!tbody) return;

    let filtered = adminTools.filter(t => {
      const matchesSearch = !toolSearchQuery ||
                            t.name.toLowerCase().includes(toolSearchQuery) ||
                            (t.description && t.description.toLowerCase().includes(toolSearchQuery));
      const matchesCategory = toolCategoryFilter === "All" || t.category === toolCategoryFilter;
      return matchesSearch && matchesCategory;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (toolSortOrder === "A-Z") return a.name.localeCompare(b.name);
      if (toolSortOrder === "Z-A") return b.name.localeCompare(a.name);
      if (toolSortOrder === "Featured First") return ((b.featured || b.sponsored) ? 1 : 0) - ((a.featured || a.sponsored) ? 1 : 0);
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      if (toolSortOrder === "Oldest") return dateA - dateB;
      return dateB - dateA;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:var(--admin-text-muted);">
            No tools found matching your criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const isSupabaseLogo = t.logo && t.logo.startsWith("http");
      const isLocalLogo = t.logo && !isSupabaseLogo && (t.logo.endsWith(".png") || t.logo.endsWith(".svg") || t.logo.endsWith(".webp"));
      const bgCol = t.accent_color || t.color || '#4F8CFF';
      let logoStyle;
      if (isSupabaseLogo) {
          logoStyle = `background-image:url('${t.logo}'); background-size:cover; background-position:center; background-color:${bgCol};`;
      } else if (isLocalLogo) {
          logoStyle = `background-image:url('../assets/logos/${t.logo}'); background-size:cover; background-position:center; background-color:${bgCol};`;
      } else {
          logoStyle = `background:${bgCol}`;
      }
      const logoText = (isSupabaseLogo || isLocalLogo) ? '' : t.name.slice(0,2).toUpperCase();

      const dateRaw = t.updated_at || t.created_at;
      const formattedDate = dateRaw ? new Date(dateRaw).toISOString().slice(0,10) : 'Recent';

      return `
        <tr>
          <td><div class="table-logo" style="${logoStyle}">${logoText}</div></td>
          <td><strong>${t.name}</strong></td>
          <td><span class="badge badge-category">${t.category}</span></td>
          <td style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--admin-text-muted);">${t.description || '-'}</td>
          <td>${t.featured || t.sponsored ? '<span class="badge badge-featured">Featured</span>' : '<span style="color:var(--admin-text-muted)">Standard</span>'}</td>
          <td><span style="font-size:12px; color:var(--admin-text-muted);">${formattedDate}</span></td>
          <td>
            <div class="action-btns">
              <button class="btn-icon" data-action="edit" data-id="${t.id}" title="Edit tool" aria-label="Edit ${t.name}">✏️</button>
              <button class="btn-icon" data-action="duplicate" data-id="${t.id}" title="Duplicate tool" aria-label="Duplicate ${t.name}">📋</button>
              <button class="btn-icon danger" data-action="delete" data-id="${t.id}" title="Delete tool" aria-label="Delete ${t.name}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "edit") editTool(id);
        if (action === "duplicate") duplicateTool(id);
        if (action === "delete") confirmDeleteTool(id);
      });
    });
  }

  // Filter & Search Controls
  const adminSearchInput = document.getElementById("adminSearchInput");
  if (adminSearchInput) {
    adminSearchInput.addEventListener("input", (e) => {
      toolSearchQuery = e.target.value.toLowerCase().trim();
      renderToolsTable();
    });
  }

  const filterCategorySelect = document.getElementById("filterCategorySelect");
  if (filterCategorySelect) {
    filterCategorySelect.addEventListener("change", (e) => {
      toolCategoryFilter = e.target.value;
      renderToolsTable();
    });
  }

  const sortOrderSelect = document.getElementById("sortOrderSelect");
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener("change", (e) => {
      toolSortOrder = e.target.value;
      renderToolsTable();
    });
  }

  // Modal Controls
  const toolModal = document.getElementById("toolModal");
  const openAddToolModalBtn = document.getElementById("openAddToolModal");
  const closeToolModalBtn = document.getElementById("closeToolModal");
  const cancelToolModalBtn = document.getElementById("cancelToolModalBtn");
  const toolForm = document.getElementById("toolForm");

  if (openAddToolModalBtn) {
    openAddToolModalBtn.addEventListener("click", () => {
      editingToolId = null;
      document.getElementById("toolModalTitle").textContent = "Add New AI Tool";
      toolForm.reset();
      openModal(toolModal);
    });
  }

  if (closeToolModalBtn) {
    closeToolModalBtn.addEventListener("click", () => closeModal(toolModal));
  }
  if (cancelToolModalBtn) {
    cancelToolModalBtn.addEventListener("click", () => closeModal(toolModal));
  }

  function editTool(id) {
    const tool = adminTools.find(t => String(t.id) === String(id));
    if (!tool) return;

    editingToolId = id;
    document.getElementById("toolModalTitle").textContent = "Edit AI Tool";
    document.getElementById("toolNameInput").value = tool.name || "";
    document.getElementById("toolDescInput").value = tool.description || "";
    document.getElementById("toolUrlInput").value = tool.website || tool.url || "#";
    
    const catSelect = document.getElementById("toolCategorySelect");
    if (catSelect) {
      if (tool.category_id) {
        catSelect.value = tool.category_id;
      } else {
        const found = adminCategories.find(c => c.name === tool.category);
        if (found) catSelect.value = found.id;
      }
    }

    document.getElementById("toolColorInput").value = tool.accent_color || tool.color || "#4F8CFF";
    document.getElementById("toolFeaturedToggle").checked = !!(tool.featured || tool.sponsored);

    openModal(toolModal);
  }

  // Duplicate Tool with Optimistic Update
  async function duplicateTool(id) {
    const existing = adminTools.find(t => String(t.id) === String(id));
    if (!existing) return;

    const matchedCat = adminCategories.find(c => String(c.id) === String(existing.category_id) || c.name === existing.category);

    const tempId = `temp_${Date.now()}`;
    const copyPayload = {
      id: tempId,
      name: existing.name + ' (Copy)',
      description: existing.description,
      website: existing.website || existing.url,
      category: matchedCat ? matchedCat.name : existing.category,
      category_id: matchedCat ? matchedCat.id : existing.category_id,
      accent_color: existing.accent_color || existing.color,
      featured: existing.featured,
      sponsored: existing.sponsored,
      logo: existing.logo,
      created_at: new Date().toISOString()
    };

    // Optimistic Local Update
    adminTools.unshift(copyPayload);
    renderToolsTable();
    renderOverviewStats();

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      const dbPayload = { ...copyPayload };
      delete dbPayload.id;

      const { data, error } = await supabaseClient
        .from("tools")
        .insert([dbPayload])
        .select();

      if (error) {
        console.error("Query failed: tools.insert()", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        adminTools = adminTools.filter(t => t.id !== tempId);
        renderToolsTable();
        renderOverviewStats();
        showToast(`Failed to duplicate: ${error.message}`, "error");
        return;
      }
    }

    await loadAdminData();
    renderToolsTable();
    renderOverviewStats();
    showToast("Tool duplicated successfully!", "success");
  }

  // Tool Form Submission
  if (toolForm) {
    toolForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = toolForm.querySelector('button[type="submit"]');
      const logoInput = document.getElementById("toolLogoInput");
      const file = logoInput && logoInput.files.length > 0 ? logoInput.files[0] : null;

      setButtonLoading(submitBtn, true, file ? "Uploading Logo & Saving..." : "Saving Tool...");
      if (logoInput) logoInput.disabled = true;

      try {
        const name = document.getElementById("toolNameInput").value.trim();
        const description = document.getElementById("toolDescInput").value.trim();
        const website = document.getElementById("toolUrlInput").value.trim();
        const selectedCatId = document.getElementById("toolCategorySelect").value;
        const accent_color = document.getElementById("toolColorInput").value;
        const featured = document.getElementById("toolFeaturedToggle").checked;
        const sponsored = featured;

        const matchedCat = adminCategories.find(c => String(c.id) === String(selectedCatId));
        const categoryName = matchedCat ? matchedCat.name : "Uncategorized";

        let logoUrl = "";
        
        if (file && typeof supabaseClient !== "undefined" && supabaseClient) {
          try {
            const fileName = `${crypto.randomUUID()}-${file.name}`;
            const { error: uploadError } = await supabaseClient.storage
              .from("Logo")
              .upload(fileName, file);

            if (uploadError) {
              console.error("Storage upload failed: storage.from('Logo').upload()", {
                message: uploadError?.message,
                details: uploadError?.details,
                hint: uploadError?.hint,
                code: uploadError?.code
              });
              showToast(`Logo upload warning: ${uploadError.message}`, "warning");
            } else {
              const { data } = supabaseClient.storage
                .from("Logo")
                .getPublicUrl(fileName);
              logoUrl = data.publicUrl;
            }
          } catch (e) {
            console.error("Storage upload exception: storage.from('Logo').upload()", {
              message: e?.message,
              details: e?.details,
              hint: e?.hint,
              code: e?.code
            });
            showToast("Logo upload failed.", "error");
          }
        }

        if (editingToolId) {
          const updateData = {
            name,
            description,
            website,
            category: categoryName,
            category_id: selectedCatId,
            accent_color,
            featured,
            sponsored,
            updated_at: new Date().toISOString()
          };
          if (logoUrl) updateData.logo = logoUrl;

          const idx = adminTools.findIndex(t => String(t.id) === String(editingToolId));
          const prevTool = adminTools[idx];
          if (idx !== -1) {
            adminTools[idx] = { ...adminTools[idx], ...updateData };
            renderToolsTable();
            renderOverviewStats();
          }

          if (typeof supabaseClient !== "undefined" && supabaseClient) {
            const { error } = await supabaseClient
              .from("tools")
              .update(updateData)
              .eq("id", editingToolId);

            if (error) {
              console.error("Query failed: tools.update().eq('id', editingToolId)", {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code
              });
              if (idx !== -1) adminTools[idx] = prevTool;
              renderToolsTable();
              showToast(`Update error: ${error.message}`, "error");
              return;
            }
          }
          showToast("Tool updated successfully!", "success");
        } else {
          const insertPayload = {
            name,
            description,
            website,
            category: categoryName,
            category_id: selectedCatId,
            accent_color,
            featured,
            sponsored,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          if (logoUrl) insertPayload.logo = logoUrl;

          if (typeof supabaseClient !== "undefined" && supabaseClient) {
            const { error } = await supabaseClient
              .from("tools")
              .insert([insertPayload]);

            if (error) {
              console.error("Query failed: tools.insert()", {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code
              });
              showToast(`Create error: ${error.message}`, "error");
              return;
            }
          }
          showToast("Tool created successfully!", "success");
        }

        closeModal(toolModal);
        await loadAdminData();
        renderToolsTable();
        renderOverviewStats();
      } finally {
        if (logoInput) logoInput.disabled = false;
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Delete Tool Confirmation Modal
  const deleteModal = document.getElementById("deleteModal");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  function confirmDeleteTool(id) {
    deletingToolId = id;
    openModal(deleteModal);
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", () => closeModal(deleteModal));
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (deletingToolId) {
        setButtonLoading(confirmDeleteBtn, true, "Deleting...");
        if (cancelDeleteBtn) cancelDeleteBtn.disabled = true;

        try {
          const idToDelete = deletingToolId;
          const prevTools = [...adminTools];

          adminTools = adminTools.filter(t => String(t.id) !== String(idToDelete));
          renderToolsTable();
          renderOverviewStats();
          closeModal(deleteModal);

          if (typeof supabaseClient !== "undefined" && supabaseClient) {
            const { error } = await supabaseClient
              .from("tools")
              .delete()
              .eq("id", idToDelete);

            if (error) {
              console.error("Query failed: tools.delete().eq('id', idToDelete)", {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code
              });
              adminTools = prevTools;
              renderToolsTable();
              renderOverviewStats();
              showToast(`Delete error: ${error.message}`, "error");
              return;
            }
          }

          deletingToolId = null;
          showToast("Tool deleted successfully!", "success");
        } finally {
          if (cancelDeleteBtn) cancelDeleteBtn.disabled = false;
          setButtonLoading(confirmDeleteBtn, false);
        }
      }
    });
  }

  // ===== 3. CATEGORIES MANAGEMENT =====
  const categoryEditModal = document.getElementById("categoryEditModal");
  const closeCategoryEditModalBtn = document.getElementById("closeCategoryEditModal");
  const cancelCategoryEditBtn = document.getElementById("cancelCategoryEditBtn");
  const categoryEditForm = document.getElementById("categoryEditForm");

  if (closeCategoryEditModalBtn) {
    closeCategoryEditModalBtn.addEventListener("click", () => closeModal(categoryEditModal));
  }
  if (cancelCategoryEditBtn) {
    cancelCategoryEditBtn.addEventListener("click", () => closeModal(categoryEditModal));
  }

  function renderCategoriesManager() {
    const catList = document.getElementById("categoriesList");
    if (!catList) return;

    if (adminCategories.length === 0) {
      catList.innerHTML = `<div style="color:var(--admin-text-muted);">No categories added yet.</div>`;
      return;
    }

    catList.innerHTML = adminCategories.map(c => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--admin-surface); border:1px solid var(--admin-border); border-radius:10px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px;">${c.icon || '📁'}</span>
          <strong>${c.name}</strong>
          ${c.color ? `<span style="width:12px; height:12px; border-radius:50%; background:${c.color}; display:inline-block; margin-left:6px;" title="Color: ${c.color}"></span>` : ''}
        </div>
        <div style="display:flex; gap:6px;">
          ${c.name !== 'All' ? `<button class="btn-icon" data-action="editCat" data-id="${c.id}" title="Edit category" aria-label="Edit category ${c.name}">✏️</button>` : ''}
          ${c.name !== 'All' ? `<button class="btn-icon danger" data-action="deleteCat" data-id="${c.id}" title="Delete category" aria-label="Delete category ${c.name}">🗑️</button>` : ''}
        </div>
      </div>
    `).join("");

    catList.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "editCat") editCategory(id);
        if (action === "deleteCat") deleteCategory(id);
      });
    });
  }

  function isDuplicateCategoryName(name, excludeId = null) {
    const clean = name.trim().toLowerCase();
    return adminCategories.some(c => String(c.id) !== String(excludeId) && c.name.trim().toLowerCase() === clean);
  }

  const addCategoryForm = document.getElementById("addCategoryForm");
  if (addCategoryForm) {
    addCategoryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = addCategoryForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Creating...");

      try {
        const name = document.getElementById("catNameInput").value.trim();
        const icon = document.getElementById("catIconInput").value.trim() || "📁";
        const colorInput = document.getElementById("catColorInput");
        const color = colorInput ? colorInput.value : "#4F8CFF";

        if (!name) return;

        if (isDuplicateCategoryName(name)) {
          showToast(`Category "${name}" already exists!`, "warning");
          return;
        }

        if (typeof supabaseClient !== "undefined" && supabaseClient) {
          const { error } = await supabaseClient
            .from("categories")
            .insert([{ name, icon, color }]);

          if (error) {
            console.error("Query failed: categories.insert()", {
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              code: error?.code
            });
            showToast(`Category error: ${error.message}`, "error");
            return;
          }
        }

        await loadAdminData();
        document.getElementById("catNameInput").value = "";
        document.getElementById("catIconInput").value = "";
        if (colorInput) colorInput.value = "#4F8CFF";
        renderCategoriesManager();
        renderCategoryOptions();
        renderOverviewStats();
        showToast(`Category "${name}" created successfully!`, "success");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  function editCategory(id) {
    const cat = adminCategories.find(c => String(c.id) === String(id));
    if (!cat) return;

    editingCategoryId = id;
    document.getElementById("catEditNameInput").value = cat.name || "";
    document.getElementById("catEditIconInput").value = cat.icon || "📁";
    const colorInput = document.getElementById("catEditColorInput");
    if (colorInput) colorInput.value = cat.color || cat.accent_color || "#4F8CFF";

    openModal(categoryEditModal);
  }

  if (categoryEditForm) {
    categoryEditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!editingCategoryId) return;

      const submitBtn = categoryEditForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Saving...");

      try {
        const name = document.getElementById("catEditNameInput").value.trim();
        const icon = document.getElementById("catEditIconInput").value.trim() || "📁";
        const colorInput = document.getElementById("catEditColorInput");
        const color = colorInput ? colorInput.value : "#4F8CFF";

        if (!name) return;

        if (isDuplicateCategoryName(name, editingCategoryId)) {
          showToast(`Category name "${name}" is already taken!`, "warning");
          return;
        }

        if (typeof supabaseClient !== "undefined" && supabaseClient) {
          const { error } = await supabaseClient
            .from("categories")
            .update({ name, icon, color })
            .eq("id", editingCategoryId);

          if (error) {
            console.error("Query failed: categories.update().eq('id', editingCategoryId)", {
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              code: error?.code
            });
            showToast(`Update error: ${error.message}`, "error");
            return;
          }
        }

        editingCategoryId = null;
        closeModal(categoryEditModal);
        await loadAdminData();
        renderCategoriesManager();
        renderCategoryOptions();
        renderOverviewStats();
        showToast(`Category "${name}" updated!`, "success");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  async function deleteCategory(id) {
    const targetCat = adminCategories.find(c => String(c.id) === String(id));
    if (!targetCat) return;

    const referencingTools = adminTools.filter(t => String(t.category_id) === String(id) || t.category === targetCat.name);
    if (referencingTools.length > 0) {
      showToast(`Cannot delete "${targetCat.name}": ${referencingTools.length} tool(s) are currently assigned to it!`, "error");
      return;
    }

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      const { error } = await supabaseClient
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Query failed: categories.delete().eq('id', id)", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        showToast(`Delete category error: ${error.message}`, "error");
        return;
      }
    }

    await loadAdminData();
    renderCategoriesManager();
    renderCategoryOptions();
    renderOverviewStats();
    showToast(`Category "${targetCat.name}" deleted!`, "success");
  }

  // ===== 4. FEATURED DRAG & DROP ORDERING =====
  let previousOrderSnapshot = null;

  function renderFeaturedOrder(focusedId = null) {
    const container = document.getElementById("featuredOrderList");
    if (!container) return;

    container.setAttribute("role", "list");
    container.setAttribute("aria-label", "Featured Tools Order Manager");

    const featuredTools = adminTools
      .filter(t => t.featured || t.sponsored)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    if (featuredTools.length === 0) {
      container.innerHTML = `<div style="padding:20px; color:var(--admin-text-muted);">No featured tools added yet. Mark tools as Featured in the Tools section.</div>`;
      return;
    }

    const totalCount = featuredTools.length;

    container.innerHTML = featuredTools.map((t, idx) => `
      <div class="drag-item" 
           draggable="true" 
           data-id="${t.id}" 
           data-index="${idx}" 
           style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:var(--admin-surface); border:1px solid var(--admin-border); border-radius:12px; margin-bottom:10px; cursor:grab;" 
           tabindex="0" 
           role="listitem"
           aria-label="${t.name}, position ${idx + 1} of ${totalCount}. Press Arrow Up or Down to reorder, or drag to move.">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="color:var(--admin-text-muted); font-size:18px; cursor:grab;" aria-hidden="true">☰</span>
          <strong>${t.name}</strong>
          <span class="badge badge-category">${t.category}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--admin-text-muted);">Order: ${t.order_index ?? idx}</span>
          <span class="badge badge-featured">Featured</span>
        </div>
      </div>
    `).join("");

    if (focusedId) {
      const elToFocus = container.querySelector(`.drag-item[data-id="${focusedId}"]`);
      if (elToFocus) elToFocus.focus();
    }

    let draggedElement = null;

    container.querySelectorAll(".drag-item").forEach((item, index) => {
      item.addEventListener("dragstart", (e) => {
        draggedElement = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        previousOrderSnapshot = JSON.parse(JSON.stringify(adminTools));
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        container.querySelectorAll(".drag-item").forEach(el => el.classList.remove("drag-over"));
        saveNewFeaturedOrder(container);
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        if (draggedElement && draggedElement !== item) {
          const items = Array.from(container.querySelectorAll(".drag-item"));
          const srcIdx = items.indexOf(draggedElement);
          const targetIdx = items.indexOf(item);

          if (srcIdx < targetIdx) {
            item.after(draggedElement);
          } else {
            item.before(draggedElement);
          }
        }
      });

      item.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          moveFeaturedItem(index, -1);
        } else if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          moveFeaturedItem(index, 1);
        }
      });
    });
  }

  function moveFeaturedItem(currentIndex, direction) {
    const featuredTools = adminTools
      .filter(t => t.featured || t.sponsored)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= featuredTools.length) return;

    previousOrderSnapshot = JSON.parse(JSON.stringify(adminTools));

    const itemToMove = featuredTools[currentIndex];
    featuredTools.splice(currentIndex, 1);
    featuredTools.splice(targetIndex, 0, itemToMove);

    featuredTools.forEach((tool, idx) => {
      const matchInAdmin = adminTools.find(t => String(t.id) === String(tool.id));
      if (matchInAdmin) {
        matchInAdmin.order_index = idx;
      }
    });

    renderFeaturedOrder(itemToMove.id);

    const container = document.getElementById("featuredOrderList");
    saveNewFeaturedOrder(container, itemToMove.id);
  }

  async function saveNewFeaturedOrder(container, focusedId = null) {
    if (!container) return;
    const items = Array.from(container.querySelectorAll(".drag-item"));
    if (items.length === 0) return;

    if (!previousOrderSnapshot) {
      previousOrderSnapshot = JSON.parse(JSON.stringify(adminTools));
    }

    const updates = [];

    items.forEach((el, newIdx) => {
      const id = el.dataset.id;
      const tool = adminTools.find(t => String(t.id) === String(id));
      if (tool) {
        tool.order_index = newIdx;
        if (typeof supabaseClient !== "undefined" && supabaseClient) {
          updates.push(
            supabaseClient
              .from("tools")
              .update({ order_index: newIdx })
              .eq("id", id)
          );
        }
      }
    });

    renderFeaturedOrder(focusedId);

    if (updates.length > 0) {
      try {
        const results = await Promise.all(updates);
        const errResult = results.find(res => res && res.error);

        if (errResult) {
          console.error("Query failed: tools.update({ order_index }).eq('id', id)", {
            message: errResult.error?.message,
            details: errResult.error?.details,
            hint: errResult.error?.hint,
            code: errResult.error?.code
          });
          if (previousOrderSnapshot) {
            adminTools = previousOrderSnapshot;
          }
          renderFeaturedOrder(focusedId);
          showToast("Failed to update database. Restored previous order.", "error");
        } else {
          showToast("Featured tools order updated and saved!", "success");
        }
      } catch (err) {
        console.error("Query exception: tools.update({ order_index }).eq('id', id)", {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        });
        if (previousOrderSnapshot) {
          adminTools = previousOrderSnapshot;
        }
        renderFeaturedOrder(focusedId);
        showToast(`Failed to save order: ${err.message}. Order restored.`, "error");
      }
    } else {
      showToast("Featured order updated!", "success");
    }

    previousOrderSnapshot = null;
  }

  // ===== 5. SITE SETTINGS & BACKUP =====
  async function loadSettings() {
    siteSettings = await StorageService.fetchSettings();
  }

  function renderSettingsForm() {
    document.getElementById("settingTitleInput").value = siteSettings.siteTitle || "";
    document.getElementById("settingGithubInput").value = siteSettings.githubUrl || "";
  }

  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = settingsForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Saving Settings...");

      try {
        const siteTitle = document.getElementById("settingTitleInput").value.trim();
        const githubUrl = document.getElementById("settingGithubInput").value.trim();
        const newPassword = document.getElementById("settingPasswordInput").value.trim();

        const newSettings = { siteTitle, githubUrl };

        if (newPassword) {
          newSettings.authHash = await AuthService.hashPassword(newPassword);
        }

        await StorageService.saveSettings(newSettings);
        siteSettings = StorageService.getSettings();
        showToast("Site settings saved successfully!", "success");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Backup Export & Import with Button Loading States
  const exportBtn = document.getElementById("exportBackupBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      setButtonLoading(exportBtn, true, "Exporting...");
      try {
        const payload = {
          tools: adminTools,
          categories: adminCategories,
          settings: StorageService.getSettings(),
          exportedAt: new Date().toISOString()
        };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ai-directory-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        showToast("Backup exported successfully!", "success");
      } finally {
        setTimeout(() => setButtonLoading(exportBtn, false), 500);
      }
    });
  }

  const importBtn = document.getElementById("importBackupBtn");
  const importInput = document.getElementById("importBackupInput");

  if (importBtn && importInput) {
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        setButtonLoading(importBtn, true, "Importing...");
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (data.settings) await StorageService.saveSettings(data.settings);
            showToast("Backup data loaded!", "success");
            await loadAdminData();
            renderDashboard();
          } catch (err) {
            showToast("Invalid JSON backup file format.", "error");
          } finally {
            setButtonLoading(importBtn, false);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  await checkAuth();

})();
