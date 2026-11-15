(function () {
  "use strict";

  const { conditions, statuses, inspectionWindowDays } = window.SATRIA_CONFIG;
  const state = {
    assets: [],
    inspections: [],
    audit: [],
    route: "dashboard",
    importPreview: null,
    scanner: null,
    previousFocus: null
  };

  const pageMeta = {
    dashboard: { title: "Dashboard aset", eyebrow: "Bidang Pembinaan" },
    inventory: { title: "Inventaris BMN", eyebrow: "SATRIA BMN" },
    monitoring: { title: "Monitoring kondisi", eyebrow: "Pemeriksaan berkala" },
    reports: { title: "Laporan inventaris", eyebrow: "Rekap dan analitik" },
    import: { title: "Impor inventaris", eyebrow: "Validasi data BMN" },
    audit: { title: "Jejak aktivitas", eyebrow: "Akuntabilitas data" }
  };

  const $ = (selector, parent) => (parent || document).querySelector(selector);
  const $$ = (selector, parent) => Array.from((parent || document).querySelectorAll(selector));

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function localDate(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = localDate(value);
    if (!date) return "Belum ada data";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function formatDateTime(value) {
    const date = localDate(value);
    if (!date) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function shortCurrency(value) {
    const numeric = Number(value) || 0;
    if (numeric >= 1000000000) return `Rp${(numeric / 1000000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (numeric >= 1000000) return `Rp${(numeric / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    return formatCurrency(numeric);
  }

  function assetInitial(asset) {
    return (asset.category || asset.name || "A").trim().charAt(0).toUpperCase();
  }

  function conditionClass(condition) {
    if (condition === "Rusak Ringan") return "ringan";
    if (condition === "Rusak Berat") return "berat";
    if (condition === "Tidak Ditemukan") return "missing";
    return "baik";
  }

  function conditionBadge(condition) {
    return `<span class="status-badge status-badge--${conditionClass(condition)}">${escapeHTML(condition)}</span>`;
  }

  function inspectionState(asset) {
    if (!asset.lastInspection) return { due: true, className: "berat", label: "Belum diperiksa", age: null };
    const inspected = localDate(asset.lastInspection);
    if (!inspected) return { due: true, className: "berat", label: "Tanggal tidak valid", age: null };
    const now = localDate(today());
    const age = Math.floor((now - inspected) / 86400000);
    if (age >= inspectionWindowDays) return { due: true, className: "late", label: "Jatuh tempo", age };
    const left = Math.max(0, inspectionWindowDays - age);
    return { due: false, className: "baik", label: `Berlaku · ${left} hari`, age };
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "id"));
  }

  function optionMarkup(values, selected, firstLabel) {
    const first = `<option value="">${escapeHTML(firstLabel)}</option>`;
    return first + values.map((value) => `<option value="${escapeHTML(value)}"${value === selected ? " selected" : ""}>${escapeHTML(value)}</option>`).join("");
  }

  function fillFilterOptions() {
    const locations = uniqueSorted(state.assets.map((asset) => asset.location));
    const inventoryCondition = $("#inventory-condition-filter");
    const inventoryLocation = $("#inventory-location-filter");
    const reportCondition = $("#report-condition-filter");
    const reportLocation = $("#report-location-filter");
    const saved = {
      inventoryCondition: inventoryCondition.value,
      inventoryLocation: inventoryLocation.value,
      reportCondition: reportCondition.value,
      reportLocation: reportLocation.value
    };
    inventoryCondition.innerHTML = optionMarkup(conditions, saved.inventoryCondition, "Semua kondisi");
    inventoryLocation.innerHTML = optionMarkup(locations, saved.inventoryLocation, "Semua lokasi");
    reportCondition.innerHTML = optionMarkup(conditions, saved.reportCondition, "Semua kondisi");
    reportLocation.innerHTML = optionMarkup(locations, saved.reportLocation, "Semua lokasi");
  }

  async function refreshData() {
    const [assets, inspections, audit] = await Promise.all([
      SATRIA_DB.listAssets(), SATRIA_DB.listInspections(), SATRIA_DB.listAudit()
    ]);
    state.assets = assets;
    state.inspections = inspections;
    state.audit = audit;
  }

  function renderAll() {
    fillFilterOptions();
    renderDashboard();
    renderInventory();
    renderMonitoring();
    renderReports();
    renderAudit();
  }

  function conditionBreakdown(items) {
    return conditions.map((condition) => ({
      label: condition,
      count: items.filter((item) => item.condition === condition).length
    }));
  }

  function conditionChartMarkup(items) {
    const breakdown = conditionBreakdown(items);
    const maximum = Math.max(1, ...breakdown.map((item) => item.count));
    return breakdown.map((item) => {
      const className = conditionClass(item.label);
      const width = Math.round((item.count / maximum) * 100);
      return `<div class="condition-row">
        <span class="condition-label"><i class="condition-dot condition-dot--${className}"></i>${escapeHTML(item.label)}</span>
        <div class="condition-track" aria-hidden="true"><div class="condition-fill condition-fill--${className}" style="width:${width}%"></div></div>
        <span class="condition-total">${item.count}</span>
      </div>`;
    }).join("");
  }

  function barChartMarkup(items, formatter) {
    if (!items.length) return '<p class="empty-state">Belum ada data untuk ditampilkan.</p>';
    const maximum = Math.max(1, ...items.map((item) => item.value));
    return items.map((item) => `<div class="location-row">
      <span class="location-name" title="${escapeHTML(item.label)}">${escapeHTML(item.label)}</span>
      <div class="location-track" aria-hidden="true"><div class="location-fill" style="width:${Math.max(3, Math.round((item.value / maximum) * 100))}%"></div></div>
      <span class="location-value">${escapeHTML(formatter(item.value))}</span>
    </div>`).join("");
  }

  function renderDashboard() {
    const totalValue = state.assets.reduce((sum, asset) => sum + (Number(asset.acquiredValue) || 0), 0);
    const issueCount = state.assets.filter((asset) => asset.condition !== "Baik").length;
    const overdueCount = state.assets.filter((asset) => inspectionState(asset).due).length;
    const withoutQr = state.assets.filter((asset) => !asset.qrToken).length;
    $("#dashboard-date").textContent = `Pembaruan lokal · ${formatDate(today())}`;
    $("#metric-grid").innerHTML = [
      { icon: "▦", label: "Total aset", value: state.assets.length.toLocaleString("id-ID"), detail: "Aset tersimpan di perangkat", variant: "accent" },
      { icon: "Rp", label: "Nilai perolehan", value: shortCurrency(totalValue), detail: formatCurrency(totalValue), variant: "" },
      { icon: "!", label: "Perlu tindak lanjut", value: issueCount.toLocaleString("id-ID"), detail: issueCount ? "Kondisi bukan Baik" : "Tidak ada temuan kondisi", variant: "alert" },
      { icon: "◷", label: "Pemeriksaan jatuh tempo", value: overdueCount.toLocaleString("id-ID"), detail: withoutQr ? `${withoutQr} aset belum berlabel QR` : "Seluruh aset punya token QR", variant: "" }
    ].map((metric) => `<article class="metric-card ${metric.variant ? `metric-card--${metric.variant}` : ""}">
      <span class="metric-card__icon" aria-hidden="true">${metric.icon}</span>
      <p class="metric-card__label">${metric.label}</p>
      <p class="metric-card__value">${metric.value}</p>
      <p class="metric-card__detail">${metric.detail}</p>
    </article>`).join("");

    $("#condition-chart").innerHTML = conditionChartMarkup(state.assets);
    const attention = state.assets
      .filter((asset) => asset.condition !== "Baik" || inspectionState(asset).due)
      .sort((a, b) => {
        const aScore = (a.condition === "Rusak Berat" || a.condition === "Tidak Ditemukan" ? 2 : 0) + (inspectionState(a).due ? 1 : 0);
        const bScore = (b.condition === "Rusak Berat" || b.condition === "Tidak Ditemukan" ? 2 : 0) + (inspectionState(b).due ? 1 : 0);
        return bScore - aScore;
      });
    $("#attention-count").textContent = `${attention.length} aset`;
    $("#attention-list").innerHTML = attention.length ? attention.slice(0, 5).map((asset) => {
      const urgent = asset.condition === "Rusak Berat" || asset.condition === "Tidak Ditemukan";
      const detail = asset.condition !== "Baik" ? asset.condition : inspectionState(asset).label;
      return `<div class="attention-item ${urgent ? "attention-item--danger" : ""}">
        <span class="attention-icon" aria-hidden="true">${urgent ? "!" : "◷"}</span>
        <div class="attention-copy"><strong>${escapeHTML(asset.name)}</strong><span>${escapeHTML(asset.location)} · ${escapeHTML(detail)}</span></div>
        <button class="text-button" data-action="detail" data-id="${escapeHTML(asset.id)}" type="button">Buka</button>
      </div>`;
    }).join("") : '<p class="empty-state">Belum ada aset yang membutuhkan perhatian.</p>';

    const locationCounts = Object.entries(state.assets.reduce((groups, asset) => {
      groups[asset.location || "Belum ditetapkan"] = (groups[asset.location || "Belum ditetapkan"] || 0) + 1;
      return groups;
    }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    $("#location-chart").innerHTML = barChartMarkup(locationCounts, (value) => `${value} aset`);
    $("#activity-list").innerHTML = state.audit.length ? state.audit.slice(0, 5).map((event) => `<li>
      <strong>${escapeHTML(event.action)}</strong>
      <span>${escapeHTML(event.detail)} · ${formatDateTime(event.createdAt)}</span>
    </li>`).join("") : '<li><strong>Belum ada aktivitas</strong><span>Aktivitas akan muncul setelah data digunakan.</span></li>';
  }

  function assetCell(asset) {
    return `<div class="asset-cell"><span class="asset-symbol" aria-hidden="true">${escapeHTML(assetInitial(asset))}</span><div>
      <strong>${escapeHTML(asset.name)}</strong><span>${escapeHTML(asset.category)} · ${escapeHTML(asset.brand)}</span>
    </div></div>`;
  }

  function getInventoryFiltered() {
    const term = $("#inventory-search").value.trim().toLocaleLowerCase("id");
    const condition = $("#inventory-condition-filter").value;
    const location = $("#inventory-location-filter").value;
    return state.assets.filter((asset) => {
      const haystack = [asset.name, asset.code, asset.register, asset.serialNumber, asset.location, asset.category, asset.responsible]
        .join(" ").toLocaleLowerCase("id");
      return (!term || haystack.includes(term)) && (!condition || asset.condition === condition) && (!location || asset.location === location);
    });
  }

  function renderInventory() {
    const assets = getInventoryFiltered();
    $("#inventory-result-count").textContent = `${assets.length} dari ${state.assets.length} aset`;
    $("#inventory-table-body").innerHTML = assets.length ? assets.map((asset) => {
      const inspection = inspectionState(asset);
      return `<tr>
        <td>${assetCell(asset)}</td>
        <td class="code-cell">${escapeHTML(asset.code)}<span>NUP ${escapeHTML(asset.register)}</span></td>
        <td>${escapeHTML(asset.location)}<span class="muted-cell">${escapeHTML(asset.responsible)}</span></td>
        <td>${conditionBadge(asset.condition)}</td>
        <td><strong>${formatDate(asset.lastInspection)}</strong><span class="status-badge status-badge--${inspection.className}">${escapeHTML(inspection.label)}</span></td>
        <td><div class="table-actions">
          <button class="table-action" data-action="qr" data-id="${escapeHTML(asset.id)}" type="button">QR</button>
          <button class="table-action" data-action="detail" data-id="${escapeHTML(asset.id)}" type="button">Detail</button>
        </div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="6"><p class="empty-state">Tidak ada aset yang sesuai dengan filter.</p></td></tr>';
  }

  function renderMonitoring() {
    const due = state.assets.filter((asset) => inspectionState(asset).due).length;
    const issues = state.assets.filter((asset) => asset.condition !== "Baik").length;
    $("#monitoring-summary").innerHTML = [
      { value: due, label: "Pemeriksaan jatuh tempo" },
      { value: issues, label: "Kondisi perlu tindak lanjut" },
      { value: state.assets.length - due, label: "Masih dalam periode pemeriksaan" }
    ].map((item) => `<div class="mini-stat"><strong>${item.value}</strong><span>${item.label}</span></div>`).join("");
    const assets = [...state.assets].sort((a, b) => {
      const aWeight = (a.condition === "Baik" ? 0 : 2) + (inspectionState(a).due ? 1 : 0);
      const bWeight = (b.condition === "Baik" ? 0 : 2) + (inspectionState(b).due ? 1 : 0);
      return bWeight - aWeight || a.name.localeCompare(b.name, "id");
    });
    $("#monitoring-table-body").innerHTML = assets.length ? assets.map((asset) => {
      const inspection = inspectionState(asset);
      return `<tr>
        <td>${assetCell(asset)}</td>
        <td>${escapeHTML(asset.location)}</td>
        <td>${conditionBadge(asset.condition)}</td>
        <td>${formatDate(asset.lastInspection)}</td>
        <td><span class="status-badge status-badge--${inspection.className}">${escapeHTML(inspection.label)}</span></td>
        <td><button class="table-action" data-action="inspect" data-id="${escapeHTML(asset.id)}" type="button">Catat pemeriksaan</button></td>
      </tr>`;
    }).join("") : '<tr><td colspan="6"><p class="empty-state">Belum ada aset untuk dimonitor.</p></td></tr>';
  }

  function getReportFiltered() {
    const condition = $("#report-condition-filter").value;
    const location = $("#report-location-filter").value;
    const status = $("#report-status-filter").value;
    return state.assets.filter((asset) => (!condition || asset.condition === condition) && (!location || asset.location === location) && (!status || asset.status === status));
  }

  function renderReports() {
    const assets = getReportFiltered();
    const value = assets.reduce((sum, asset) => sum + (Number(asset.acquiredValue) || 0), 0);
    const issues = assets.filter((asset) => asset.condition !== "Baik").length;
    $("#report-period-label").textContent = `Dihasilkan pada ${formatDate(today())}`;
    $("#report-stat-grid").innerHTML = [
      { label: "Jumlah aset", value: `${assets.length} aset` },
      { label: "Nilai perolehan", value: shortCurrency(value) },
      { label: "Perlu tindak lanjut", value: `${issues} aset` }
    ].map((item) => `<div class="report-stat"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("");
    $("#report-condition-chart").innerHTML = conditionChartMarkup(assets);
    const categories = Object.entries(assets.reduce((groups, asset) => {
      groups[asset.category || "Lainnya"] = (groups[asset.category || "Lainnya"] || 0) + (Number(asset.acquiredValue) || 0);
      return groups;
    }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    $("#report-category-chart").innerHTML = barChartMarkup(categories, shortCurrency);
    $("#report-table-body").innerHTML = assets.length ? assets.map((asset) => `<tr>
      <td><strong>${escapeHTML(asset.name)}</strong><span class="muted-cell">${escapeHTML(asset.category)}</span></td>
      <td class="code-cell">${escapeHTML(asset.code)}<span>NUP ${escapeHTML(asset.register)}</span></td>
      <td>${escapeHTML(asset.location)}</td>
      <td>${conditionBadge(asset.condition)}</td>
      <td class="align-right">${formatCurrency(asset.acquiredValue)}</td>
    </tr>`).join("") : '<tr><td colspan="5"><p class="empty-state">Tidak ada data dalam filter laporan ini.</p></td></tr>';
  }

  function renderAudit() {
    $("#audit-list").innerHTML = state.audit.length ? state.audit.map((event) => `<li>
      <strong>${escapeHTML(event.action)}</strong>
      <span>${escapeHTML(event.detail)}</span>
      <span>${escapeHTML(event.actor || "Sistem")} · ${formatDateTime(event.createdAt)}</span>
    </li>`).join("") : '<li><strong>Belum ada aktivitas.</strong><span>Aktivitas berikutnya akan dicatat di sini.</span></li>';
  }

  function setRoute(route) {
    if (!pageMeta[route]) return;
    state.route = route;
    $$(".page-section").forEach((section) => {
      const visible = section.dataset.page === route;
      section.hidden = !visible;
      section.classList.toggle("is-visible", visible);
    });
    $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.route === route));
    $("#page-title").textContent = pageMeta[route].title;
    $("#page-eyebrow").textContent = pageMeta[route].eyebrow;
    closeMobileMenu();
  }

  function closeMobileMenu() {
    document.body.classList.remove("menu-open");
  }

  function openModal(content) {
    stopScanner();
    state.previousFocus = document.activeElement;
    $("#modal-content").innerHTML = content;
    $("#modal-layer").hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      const first = $("#modal-content input, #modal-content select, #modal-content textarea, #modal-content button");
      if (first) first.focus();
    }, 0);
  }

  function closeModal() {
    stopScanner();
    $("#modal-layer").hidden = true;
    $("#modal-content").innerHTML = "";
    document.body.style.overflow = "";
    if (state.previousFocus && typeof state.previousFocus.focus === "function") state.previousFocus.focus();
    state.previousFocus = null;
  }

  function conditionOptions(selected) {
    return conditions.map((condition) => `<option value="${escapeHTML(condition)}"${condition === selected ? " selected" : ""}>${escapeHTML(condition)}</option>`).join("");
  }

  function statusOptions(selected) {
    return statuses.map((status) => `<option value="${escapeHTML(status)}"${status === selected ? " selected" : ""}>${escapeHTML(status)}</option>`).join("");
  }

  function openAssetForm(assetId) {
    const existing = state.assets.find((asset) => asset.id === assetId);
    const asset = existing || {
      id: "", code: "", register: "", name: "", category: "", brand: "", serialNumber: "", acquisitionYear: new Date().getFullYear(),
      acquiredValue: "", location: "", responsible: "", condition: "Baik", status: "Aktif", lastInspection: today(), notes: "", qrToken: SATRIA_DB.makeQrToken()
    };
    openModal(`
      <div class="modal-heading"><h2>${existing ? "Ubah data aset" : "Tambah aset baru"}</h2><p>Lengkapi data minimum inventaris. Perubahan kondisi penting sebaiknya dicatat melalui pemeriksaan agar riwayat tersimpan.</p></div>
      <form class="asset-form" id="asset-form">
        <input type="hidden" name="id" value="${escapeHTML(asset.id)}" />
        <input type="hidden" name="qrToken" value="${escapeHTML(asset.qrToken)}" />
        <div class="form-field"><label for="asset-code">Kode barang <span aria-hidden="true">*</span></label><input id="asset-code" name="code" required value="${escapeHTML(asset.code)}" placeholder="Contoh: 3.10.01.01.001" /></div>
        <div class="form-field"><label for="asset-register">NUP / nomor register <span aria-hidden="true">*</span></label><input id="asset-register" name="register" required value="${escapeHTML(asset.register)}" placeholder="Contoh: 0001" /></div>
        <div class="form-field form-field--full"><label for="asset-name">Nama barang <span aria-hidden="true">*</span></label><input id="asset-name" name="name" required value="${escapeHTML(asset.name)}" placeholder="Nama aset sesuai dokumen inventaris" /></div>
        <div class="form-field"><label for="asset-category">Kategori</label><input id="asset-category" name="category" value="${escapeHTML(asset.category)}" placeholder="Contoh: Peralatan TI" /></div>
        <div class="form-field"><label for="asset-brand">Merek / model</label><input id="asset-brand" name="brand" value="${escapeHTML(asset.brand)}" /></div>
        <div class="form-field"><label for="asset-serial">Nomor seri</label><input id="asset-serial" name="serialNumber" value="${escapeHTML(asset.serialNumber)}" /></div>
        <div class="form-field"><label for="asset-year">Tahun perolehan <span aria-hidden="true">*</span></label><input id="asset-year" name="acquisitionYear" required type="number" min="1900" max="${new Date().getFullYear()}" value="${escapeHTML(asset.acquisitionYear)}" /></div>
        <div class="form-field"><label for="asset-value">Nilai perolehan (Rp) <span aria-hidden="true">*</span></label><input id="asset-value" name="acquiredValue" required type="number" min="0" step="1" value="${escapeHTML(asset.acquiredValue)}" /></div>
        <div class="form-field"><label for="asset-location">Lokasi <span aria-hidden="true">*</span></label><input id="asset-location" name="location" required value="${escapeHTML(asset.location)}" placeholder="Gedung / ruangan" /></div>
        <div class="form-field"><label for="asset-responsible">Penanggung jawab</label><input id="asset-responsible" name="responsible" value="${escapeHTML(asset.responsible)}" /></div>
        <div class="form-field"><label for="asset-condition">Kondisi saat ini</label><select id="asset-condition" name="condition">${conditionOptions(asset.condition)}</select></div>
        <div class="form-field"><label for="asset-status">Status</label><select id="asset-status" name="status">${statusOptions(asset.status)}</select></div>
        <div class="form-field"><label for="asset-inspection">Tanggal pemeriksaan terakhir</label><input id="asset-inspection" name="lastInspection" type="date" value="${escapeHTML(asset.lastInspection || "")}" /></div>
        <div class="form-field form-field--full"><label for="asset-notes">Keterangan</label><textarea id="asset-notes" name="notes" placeholder="Catatan singkat aset atau tindak lanjut">${escapeHTML(asset.notes)}</textarea><span class="form-hint">Token QR dibuat otomatis dan tidak memuat nilai atau NUP aset.</span></div>
        <div class="form-actions"><button class="button button--secondary" type="button" data-close-modal="true">Batal</button><button class="button button--primary" type="submit">${existing ? "Simpan perubahan" : "Simpan aset"}</button></div>
      </form>
    `);
  }

  async function openAssetDetail(assetId) {
    const asset = state.assets.find((item) => item.id === assetId) || await SATRIA_DB.findAsset(assetId);
    if (!asset) {
      showToast("Aset tidak ditemukan.", true);
      return;
    }
    const inspections = state.inspections.filter((item) => item.assetId === asset.id).slice(0, 5);
    openModal(`
      <div class="asset-detail">
        <div class="detail-hero"><span class="asset-symbol" aria-hidden="true">${escapeHTML(assetInitial(asset))}</span><div><h2>${escapeHTML(asset.name)}</h2><p>${escapeHTML(asset.code)} · NUP ${escapeHTML(asset.register)} · ${escapeHTML(asset.category)}</p></div></div>
        <div class="detail-actions"><button class="button button--secondary button--small" data-action="qr" data-id="${escapeHTML(asset.id)}" type="button">⌁ Lihat QR</button><button class="button button--secondary button--small" data-action="inspect" data-id="${escapeHTML(asset.id)}" type="button">◌ Catat pemeriksaan</button><button class="button button--secondary button--small" data-action="edit" data-id="${escapeHTML(asset.id)}" type="button">Ubah data</button></div>
        <div class="detail-grid">
          <div class="detail-item"><span>Lokasi</span><strong>${escapeHTML(asset.location)}</strong></div>
          <div class="detail-item"><span>Penanggung jawab</span><strong>${escapeHTML(asset.responsible)}</strong></div>
          <div class="detail-item"><span>Kondisi</span><strong>${conditionBadge(asset.condition)}</strong></div>
          <div class="detail-item"><span>Status</span><strong>${escapeHTML(asset.status)}</strong></div>
          <div class="detail-item"><span>Merek / model</span><strong>${escapeHTML(asset.brand)}</strong></div>
          <div class="detail-item"><span>Nomor seri</span><strong>${escapeHTML(asset.serialNumber)}</strong></div>
          <div class="detail-item"><span>Tahun perolehan</span><strong>${escapeHTML(asset.acquisitionYear)}</strong></div>
          <div class="detail-item"><span>Nilai perolehan</span><strong>${formatCurrency(asset.acquiredValue)}</strong></div>
          <div class="detail-item"><span>QR token</span><strong>${escapeHTML(asset.qrToken)}</strong></div>
          <div class="detail-item"><span>Pemeriksaan terakhir</span><strong>${formatDate(asset.lastInspection)}</strong></div>
        </div>
        ${asset.notes ? `<div class="detail-history"><h3>Keterangan</h3><p>${escapeHTML(asset.notes)}</p></div>` : ""}
        <div class="detail-history"><h3>Riwayat pemeriksaan</h3><ol class="activity-list">${inspections.length ? inspections.map((item) => `<li><strong>${escapeHTML(item.condition)} · ${formatDate(item.date)}</strong><span>${escapeHTML(item.note || item.recommendation || "Tidak ada catatan.")} · ${escapeHTML(item.inspector || "-")}</span></li>`).join("") : '<li><strong>Belum ada riwayat.</strong><span>Catat pemeriksaan pertama untuk aset ini.</span></li>'}</ol></div>
      </div>
    `);
  }

  function openInspectionForm(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    openModal(`
      <div class="modal-heading"><h2>Catat pemeriksaan kondisi</h2><p>${escapeHTML(asset.name)} · ${escapeHTML(asset.code)} / NUP ${escapeHTML(asset.register)}</p></div>
      <form class="inspection-form" id="inspection-form">
        <input type="hidden" name="assetId" value="${escapeHTML(asset.id)}" />
        <div class="form-field"><label for="inspection-date">Tanggal pemeriksaan <span aria-hidden="true">*</span></label><input id="inspection-date" name="date" required type="date" max="${today()}" value="${today()}" /></div>
        <div class="form-field"><label for="inspection-condition">Kondisi hasil pemeriksaan <span aria-hidden="true">*</span></label><select id="inspection-condition" name="condition">${conditionOptions(asset.condition)}</select></div>
        <div class="form-field form-field--full"><label for="inspection-inspector">Petugas pemeriksa</label><input id="inspection-inspector" name="inspector" value="Operator BMN (prototipe)" /></div>
        <div class="form-field form-field--full"><label for="inspection-note">Catatan pemeriksaan</label><textarea id="inspection-note" name="note" placeholder="Contoh: kondisi fisik, hasil uji fungsi, atau bukti pemeriksaan"></textarea></div>
        <div class="form-field form-field--full"><label for="inspection-recommendation">Rekomendasi / tindak lanjut</label><textarea id="inspection-recommendation" name="recommendation" placeholder="Contoh: servis ringan sebelum 30 November 2026"></textarea></div>
        <div class="form-actions"><button class="button button--secondary" type="button" data-close-modal="true">Batal</button><button class="button button--primary" type="submit">Simpan pemeriksaan</button></div>
      </form>
    `);
  }

  function openQrModal(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    let svg;
    try {
      svg = SATRIA_QR.toSvg(asset.qrToken, `QR Code label untuk ${asset.name}`);
    } catch (error) {
      showToast(error.message || "QR Code tidak dapat dibuat.", true);
      return;
    }
    openModal(`
      <div class="qr-modal">
        <h2>Label QR aset</h2>
        <p>${escapeHTML(asset.name)} · ${escapeHTML(asset.code)} / NUP ${escapeHTML(asset.register)}</p>
        <div class="qr-code-wrap" id="qr-code-output">${svg}</div>
        <span class="qr-token">${escapeHTML(asset.qrToken)}</span>
        <p class="qr-help">QR menyimpan token internal acak, bukan nilai, NUP, atau data pegawai. Pada produksi, detail aset tetap hanya dapat dibuka setelah autentikasi.</p>
        <div class="form-actions"><button class="button button--secondary" data-action="download-qr" data-id="${escapeHTML(asset.id)}" type="button">⇩ Unduh SVG</button><button class="button button--primary" data-action="print-qr" data-id="${escapeHTML(asset.id)}" type="button">▣ Cetak label</button></div>
      </div>
    `);
  }

  async function handleAssetSubmit(form) {
    const data = new FormData(form);
    const existing = state.assets.find((asset) => asset.id === data.get("id"));
    const payload = {
      ...(existing || {}),
      id: data.get("id"),
      code: data.get("code"),
      register: data.get("register"),
      name: data.get("name"),
      category: data.get("category"),
      brand: data.get("brand"),
      serialNumber: data.get("serialNumber"),
      acquisitionYear: data.get("acquisitionYear"),
      acquiredValue: data.get("acquiredValue"),
      location: data.get("location"),
      responsible: data.get("responsible"),
      condition: data.get("condition"),
      status: data.get("status"),
      lastInspection: data.get("lastInspection"),
      notes: data.get("notes"),
      qrToken: data.get("qrToken")
    };
    const duplicate = state.assets.some((asset) => asset.id !== payload.id && asset.code === payload.code && asset.register === payload.register);
    if (duplicate) {
      showFormError(form, "Kombinasi kode barang dan NUP sudah ada pada inventaris lokal.");
      return;
    }
    const saved = await SATRIA_DB.saveAsset(payload, !existing);
    const conditionChanged = !existing || existing.condition !== saved.condition || existing.lastInspection !== saved.lastInspection;
    if (conditionChanged && saved.lastInspection) {
      await SATRIA_DB.addInspection({
        assetId: saved.id,
        condition: saved.condition,
        date: saved.lastInspection,
        inspector: "Operator BMN (form aset)",
        note: !existing ? "Pencatatan awal aset." : "Pembaruan kondisi dari formulir aset.",
        recommendation: ""
      });
    }
    await refreshData();
    renderAll();
    closeModal();
    showToast(existing ? "Data aset diperbarui." : "Aset baru berhasil ditambahkan.");
  }

  async function handleInspectionSubmit(form) {
    const data = new FormData(form);
    await SATRIA_DB.addInspection({
      assetId: data.get("assetId"),
      date: data.get("date"),
      condition: data.get("condition"),
      inspector: data.get("inspector"),
      note: data.get("note"),
      recommendation: data.get("recommendation")
    });
    await refreshData();
    renderAll();
    closeModal();
    showToast("Pemeriksaan kondisi tersimpan dan dashboard diperbarui.");
  }

  function showFormError(form, message) {
    let node = $(".form-error", form);
    if (!node) {
      node = document.createElement("p");
      node.className = "form-error";
      form.prepend(node);
    }
    node.textContent = message;
    node.setAttribute("role", "alert");
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function assetsToCsv(assets) {
    const headers = SATRIA_CONFIG.csvHeaders;
    const rows = assets.map((asset) => [
      asset.code, asset.register, asset.name, asset.category, asset.brand, asset.serialNumber, asset.acquisitionYear,
      asset.acquiredValue, asset.location, asset.responsible, asset.condition, asset.status, asset.notes
    ]);
    return `\ufeff${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  }

  function downloadInventory(assets, filename) {
    downloadText(filename, assetsToCsv(assets), "text/csv;charset=utf-8");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          field += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if (char === "\n" && !quoted) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((item) => item.some((value) => String(value).trim() !== ""));
  }

  function normalizeHeader(value) {
    return String(value || "").trim().toLocaleLowerCase("id").replace(/\s+/g, "_");
  }

  function normalizeCondition(value) {
    const target = String(value || "").trim().toLocaleLowerCase("id");
    return conditions.find((condition) => condition.toLocaleLowerCase("id") === target) || "";
  }

  function parseImportText(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { valid: [], errors: ["Berkas CSV kosong."], total: 0 };
    const headers = rows[0].map(normalizeHeader);
    const required = ["kode_barang", "nup", "nama_barang", "lokasi", "kondisi", "tahun_perolehan", "nilai_perolehan"];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) return { valid: [], errors: [`Kolom wajib tidak ditemukan: ${missing.join(", ")}.`], total: Math.max(0, rows.length - 1) };
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    const value = (row, header) => String(row[index[header]] == null ? "" : row[index[header]]).trim();
    const errors = [];
    const valid = [];
    const keys = new Set(state.assets.map((asset) => `${asset.code}|${asset.register}`.toUpperCase()));
    const inFile = new Set();
    rows.slice(1).forEach((row, offset) => {
      const line = offset + 2;
      const code = value(row, "kode_barang");
      const register = value(row, "nup");
      const name = value(row, "nama_barang");
      const location = value(row, "lokasi");
      const condition = normalizeCondition(value(row, "kondisi"));
      const year = Number(value(row, "tahun_perolehan"));
      const amountText = value(row, "nilai_perolehan");
      const amount = Number(amountText.replace(/[^0-9-]/g, ""));
      const issues = [];
      if (!code || !register || !name || !location) issues.push("kode barang, NUP, nama barang, dan lokasi wajib diisi");
      if (!condition) issues.push("kondisi harus Baik, Rusak Ringan, Rusak Berat, atau Tidak Ditemukan");
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) issues.push("tahun perolehan tidak valid");
      if (!Number.isFinite(amount) || amount < 0) issues.push("nilai perolehan tidak valid");
      const key = `${code}|${register}`.toUpperCase();
      if (keys.has(key) || inFile.has(key)) issues.push("kombinasi kode barang dan NUP duplikat");
      if (issues.length) {
        errors.push(`Baris ${line}: ${issues.join("; ")}.`);
        return;
      }
      inFile.add(key);
      valid.push({
        code,
        register,
        name,
        category: value(row, "kategori") || "Lainnya",
        brand: value(row, "merek_model") || "-",
        serialNumber: value(row, "serial_number") || "-",
        acquisitionYear: year,
        acquiredValue: amount,
        location,
        responsible: value(row, "penanggung_jawab") || "-",
        condition,
        status: statuses.includes(value(row, "status")) ? value(row, "status") : "Aktif",
        notes: value(row, "keterangan"),
        lastInspection: ""
      });
    });
    return { valid, errors, total: Math.max(0, rows.length - 1) };
  }

  function renderImportPreview() {
    const preview = state.importPreview;
    const node = $("#import-preview");
    if (!preview) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    node.hidden = false;
    const sample = preview.valid.slice(0, 5);
    node.innerHTML = `
      <div class="preview-summary"><div><h3>Hasil validasi berkas</h3><p>${preview.total} baris dibaca. Hanya aset valid yang akan dapat ditambahkan.</p></div><div class="preview-counts"><span class="preview-count">${preview.valid.length} valid</span><span class="preview-count preview-count--error">${preview.errors.length} bermasalah</span></div></div>
      ${sample.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama barang</th><th>Kode / NUP</th><th>Lokasi</th><th>Kondisi</th></tr></thead><tbody>${sample.map((asset) => `<tr><td><strong>${escapeHTML(asset.name)}</strong></td><td class="code-cell">${escapeHTML(asset.code)}<span>NUP ${escapeHTML(asset.register)}</span></td><td>${escapeHTML(asset.location)}</td><td>${conditionBadge(asset.condition)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${preview.errors.length ? `<div class="import-validation" role="alert"><strong>Baris yang harus diperbaiki</strong><ul>${preview.errors.slice(0, 8).map((error) => `<li>${escapeHTML(error)}</li>`).join("")}${preview.errors.length > 8 ? `<li>… dan ${preview.errors.length - 8} kesalahan lainnya.</li>` : ""}</ul></div>` : ""}
      ${preview.valid.length ? `<div class="page-actions" style="margin-top:14px"><button class="button button--primary" data-action="import-confirm" type="button">Tambahkan ${preview.valid.length} aset valid</button></div>` : ""}
    `;
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type && !/csv/.test(file.type)) {
      showToast("Gunakan berkas berformat CSV.", true);
      return;
    }
    const text = await file.text();
    state.importPreview = parseImportText(text);
    renderImportPreview();
  }

  async function confirmImport() {
    if (!state.importPreview || !state.importPreview.valid.length) return;
    const count = state.importPreview.valid.length;
    await SATRIA_DB.importAssets(state.importPreview.valid);
    state.importPreview = null;
    $("#import-file-input").value = "";
    renderImportPreview();
    await refreshData();
    renderAll();
    setRoute("inventory");
    showToast(`${count} aset valid berhasil ditambahkan.`);
  }

  function downloadTemplate() {
    const sample = [
      "3.10.01.01.001", "0001", "Contoh nama barang", "Peralatan TI", "Contoh merek/model", "SERIAL-CONTOH", "2024", "15000000", "Contoh ruangan", "Contoh penanggung jawab", "Baik", "Aktif", "Hapus baris contoh ini sebelum impor data aktual"
    ];
    const csv = `\ufeff${[SATRIA_CONFIG.csvHeaders, sample].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
    downloadText("template-impor-satria-bmn.csv", csv, "text/csv;charset=utf-8");
  }

  function downloadQr(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    try {
      const svg = SATRIA_QR.toSvg(asset.qrToken, `QR Code ${asset.name}`);
      downloadText(`label-qr-${asset.code}-${asset.register}.svg`.replace(/[^a-zA-Z0-9._-]/g, "-"), svg, "image/svg+xml;charset=utf-8");
      showToast("Label QR SVG diunduh.");
    } catch (error) {
      showToast(error.message || "QR tidak dapat diunduh.", true);
    }
  }

  function printQr(assetId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    let svg;
    try { svg = SATRIA_QR.toSvg(asset.qrToken, `QR Code ${asset.name}`); } catch (error) { showToast(error.message, true); return; }
    const popup = window.open("", "_blank", "noopener,noreferrer,width=480,height=600");
    if (!popup) {
      showToast("Peramban memblokir jendela cetak. Izinkan pop-up lalu coba kembali.", true);
      return;
    }
    popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Label QR SATRIA BMN</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#17211d}.label{width:300px;border:1px solid #17211d;padding:16px;text-align:center}.brand{color:#0f5b3f;font-weight:800;letter-spacing:.08em}.label h1{font-size:16px;margin:7px 0}.label p{font-size:11px;margin:4px 0;color:#415348}.qr{width:210px;height:210px;margin:14px auto}.token{font-family:monospace;font-size:10px}@media print{body{padding:0}.label{border:0}}</style></head><body><div class="label"><div class="brand">SATRIA BMN</div><h1>${escapeHTML(asset.name)}</h1><p>${escapeHTML(asset.code)} · NUP ${escapeHTML(asset.register)}</p><div class="qr">${svg}</div><p class="token">${escapeHTML(asset.qrToken)}</p><p>Keputusan internal · ${escapeHTML(SATRIA_CONFIG.organization)}</p></div><script>window.onload=function(){window.print();};<\/script></body></html>`);
    popup.document.close();
  }

  function showToast(message, isError) {
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " toast--error" : ""}`;
    toast.textContent = message;
    $("#toast-region").appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function openScanModal() {
    openModal(`
      <div class="scanner-modal"><h2>Pindai QR aset</h2><p>Arahkan kamera ke label SATRIA BMN. Detail aset hanya ditampilkan dari data lokal perangkat ini.</p>
      <div class="scanner-video-wrap" id="scanner-video-wrap"><div class="scanner-placeholder" id="scanner-placeholder">Menyiapkan kamera…</div><video id="scanner-video" muted playsinline hidden></video></div>
      <p class="scanner-status" id="scanner-status" aria-live="polite">Jika kamera tidak tersedia, masukkan token QR secara manual.</p>
      <form class="manual-scan" id="manual-scan-form"><label class="sr-only" for="manual-qr-token">Token QR</label><input id="manual-qr-token" name="token" autocomplete="off" placeholder="Contoh: SATRIA:BMN:001" /><button class="button button--primary" type="submit">Cari aset</button></form></div>
    `);
    startScanner();
  }

  function scannerStatus(message, error) {
    const node = $("#scanner-status");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(error));
  }

  async function startScanner() {
    const video = $("#scanner-video");
    const placeholder = $("#scanner-placeholder");
    if (!video) return;
    if (!window.BarcodeDetector || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (placeholder) placeholder.textContent = "Pemindaian kamera belum didukung di peramban ini.";
      scannerStatus("Masukkan token QR secara manual atau gunakan browser Chrome/Edge versi terbaru.");
      return;
    }
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!$("#scanner-video")) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const scanner = { stream, timer: null, stopped: false, detector };
      state.scanner = scanner;
      video.srcObject = stream;
      video.hidden = false;
      if (placeholder) placeholder.hidden = true;
      await video.play();
      scannerStatus("Kamera aktif. Arahkan ke QR Code.");
      const detect = async () => {
        if (scanner.stopped || state.scanner !== scanner || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (!scanner.stopped && state.scanner === scanner) scanner.timer = window.setTimeout(detect, 300);
          return;
        }
        try {
          const results = await detector.detect(video);
          if (results && results.length && results[0].rawValue) {
            const token = results[0].rawValue;
            stopScanner();
            await handleScannedToken(token);
            return;
          }
        } catch (error) {
          // Perangkat dapat sementara belum memiliki frame; lanjutkan pemindaian.
        }
        if (!scanner.stopped && state.scanner === scanner) scanner.timer = window.setTimeout(detect, 350);
      };
      detect();
    } catch (error) {
      if (placeholder) placeholder.textContent = "Kamera tidak dapat digunakan.";
      scannerStatus("Izin kamera ditolak atau perangkat tidak memiliki kamera. Gunakan token QR manual.", true);
    }
  }

  function stopScanner() {
    const scanner = state.scanner;
    if (!scanner) return;
    scanner.stopped = true;
    if (scanner.timer) window.clearTimeout(scanner.timer);
    if (scanner.stream) scanner.stream.getTracks().forEach((track) => track.stop());
    state.scanner = null;
  }

  async function handleScannedToken(rawToken) {
    const token = String(rawToken || "").trim().toUpperCase();
    const asset = await SATRIA_DB.findAssetByQr(token);
    if (!asset) {
      scannerStatus("Token QR tidak ditemukan di inventaris lokal ini.", true);
      return;
    }
    closeModal();
    setRoute("inventory");
    await openAssetDetail(asset.id);
    showToast(`Aset ditemukan: ${asset.name}.`);
  }

  async function dispatchAction(action, idValue) {
    if (action === "detail") return openAssetDetail(idValue);
    if (action === "edit") return openAssetForm(idValue);
    if (action === "qr") return openQrModal(idValue);
    if (action === "inspect") return openInspectionForm(idValue);
    if (action === "download-qr") return downloadQr(idValue);
    if (action === "print-qr") return printQr(idValue);
    if (action === "import-confirm") return confirmImport();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const route = event.target.closest("[data-route]");
      if (route) {
        setRoute(route.dataset.route);
        return;
      }
      if (event.target.closest("[data-close-modal]")) {
        closeModal();
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) {
        dispatchAction(action.dataset.action, action.dataset.id).catch((error) => showToast(error.message || "Aksi tidak dapat dilakukan.", true));
      }
    });

    $("#dashboard-add-asset").addEventListener("click", () => openAssetForm());
    $("#inventory-add-asset").addEventListener("click", () => openAssetForm());
    $("#scan-qr-button").addEventListener("click", openScanModal);
    $("#mobile-qr-button").addEventListener("click", openScanModal);
    $("#mobile-menu-button").addEventListener("click", () => document.body.classList.toggle("menu-open"));
    $("#dismiss-notice").addEventListener("click", () => {
      $(".prototype-notice").hidden = true;
      try { window.localStorage.setItem("satria-notice-dismissed", "true"); } catch (error) { /* penyimpanan privat dapat diblokir */ }
    });
    $("#inventory-search").addEventListener("input", renderInventory);
    $("#inventory-condition-filter").addEventListener("change", renderInventory);
    $("#inventory-location-filter").addEventListener("change", renderInventory);
    $("#inventory-clear-filter").addEventListener("click", () => {
      $("#inventory-search").value = "";
      $("#inventory-condition-filter").value = "";
      $("#inventory-location-filter").value = "";
      renderInventory();
    });
    $("#report-condition-filter").addEventListener("change", renderReports);
    $("#report-location-filter").addEventListener("change", renderReports);
    $("#report-status-filter").addEventListener("change", renderReports);
    $("#export-inventory-button").addEventListener("click", () => {
      downloadInventory(getInventoryFiltered(), `inventaris-satria-bmn-${today()}.csv`);
      showToast("Inventaris sesuai filter diunduh sebagai CSV.");
    });
    $("#monitoring-export-button").addEventListener("click", () => {
      const csv = `\ufeff${[["nama_barang", "kode_barang", "nup", "lokasi", "kondisi", "pemeriksaan_terakhir", "status_pemeriksaan"], ...state.assets.map((asset) => [asset.name, asset.code, asset.register, asset.location, asset.condition, asset.lastInspection, inspectionState(asset).label])].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
      downloadText(`monitoring-kondisi-satria-bmn-${today()}.csv`, csv, "text/csv;charset=utf-8");
      showToast("Rekap monitoring diunduh.");
    });
    $("#report-export-button").addEventListener("click", () => {
      downloadInventory(getReportFiltered(), `laporan-inventaris-satria-bmn-${today()}.csv`);
      showToast("Laporan sesuai filter diunduh sebagai CSV.");
    });
    $("#report-print-button").addEventListener("click", () => window.print());
    $("#download-template-button").addEventListener("click", downloadTemplate);
    $("#import-file-input").addEventListener("change", (event) => handleImportFile(event.target.files[0]).catch((error) => showToast(error.message || "Berkas tidak dapat dibaca.", true)));
    $("#reset-demo-button").addEventListener("click", async () => {
      const confirmed = window.confirm("Pulihkan seluruh data lokal menjadi 7 data contoh? Data yang telah diimpor di perangkat ini akan dihapus.");
      if (!confirmed) return;
      await SATRIA_DB.resetDemo();
      await refreshData();
      renderAll();
      showToast("Data lokal dipulihkan ke data contoh.");
    });

    document.addEventListener("submit", (event) => {
      if (event.target.matches("#asset-form")) {
        event.preventDefault();
        handleAssetSubmit(event.target).catch((error) => showFormError(event.target, error.message || "Data aset tidak dapat disimpan."));
      }
      if (event.target.matches("#inspection-form")) {
        event.preventDefault();
        handleInspectionSubmit(event.target).catch((error) => showFormError(event.target, error.message || "Pemeriksaan tidak dapat disimpan."));
      }
      if (event.target.matches("#manual-scan-form")) {
        event.preventDefault();
        const token = new FormData(event.target).get("token");
        handleScannedToken(token).catch((error) => scannerStatus(error.message || "Token tidak dapat diperiksa.", true));
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#modal-layer").hidden) closeModal();
    });
  }

  async function boot() {
    try {
      await SATRIA_DB.initialize();
      await refreshData();
      renderAll();
      bindEvents();
      try {
        if (window.localStorage.getItem("satria-notice-dismissed") === "true") $(".prototype-notice").hidden = true;
      } catch (error) { /* mode privat mungkin membatasi localStorage */ }
    } catch (error) {
      document.body.innerHTML = `<main style="max-width:680px;margin:60px auto;padding:24px;font-family:system-ui"><h1>SATRIA BMN tidak dapat dimulai</h1><p>${escapeHTML(error.message || "Penyimpanan lokal tidak tersedia.")}</p><p>Gunakan browser modern dan buka aplikasi melalui server lokal.</p></main>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
