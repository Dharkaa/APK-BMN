/* Penyimpanan lokal prototipe menggunakan IndexedDB, tanpa layanan eksternal. */
(function () {
  "use strict";

  const DB_NAME = "satria-bmn-lokal";
  const DB_VERSION = 1;
  const STORES = { assets: "assets", inspections: "inspections", audit: "audit", settings: "settings" };
  let database;

  function id(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Operasi basis data gagal."));
    });
  }

  function open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("Browser ini tidak mendukung penyimpanan lokal IndexedDB."));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.assets)) db.createObjectStore(STORES.assets, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.inspections)) db.createObjectStore(STORES.inspections, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.audit)) db.createObjectStore(STORES.audit, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Tidak dapat membuka basis data lokal."));
    });
  }

  function store(name, mode) {
    return database.transaction(name, mode || "readonly").objectStore(name);
  }

  async function getAll(name) {
    return requestToPromise(store(name).getAll());
  }

  async function getOne(name, key) {
    return requestToPromise(store(name).get(key));
  }

  async function put(name, value) {
    return requestToPromise(store(name, "readwrite").put(clone(value)));
  }

  function normalizeAsset(source) {
    const now = new Date().toISOString();
    return {
      id: source.id || id("asset"),
      code: String(source.code || "").trim(),
      register: String(source.register || "").trim(),
      name: String(source.name || "").trim(),
      category: String(source.category || "Lainnya").trim() || "Lainnya",
      brand: String(source.brand || "-").trim() || "-",
      serialNumber: String(source.serialNumber || "-").trim() || "-",
      acquisitionYear: Number(source.acquisitionYear) || new Date().getFullYear(),
      acquiredValue: Number(source.acquiredValue) || 0,
      location: String(source.location || "").trim(),
      responsible: String(source.responsible || "-").trim() || "-",
      condition: SATRIA_CONFIG.conditions.includes(source.condition) ? source.condition : "Baik",
      status: SATRIA_CONFIG.statuses.includes(source.status) ? source.status : "Aktif",
      lastInspection: source.lastInspection || "",
      notes: String(source.notes || "").trim(),
      qrToken: String(source.qrToken || "").trim() || makeQrToken(),
      verifiedAt: source.verifiedAt || now,
      updatedAt: now
    };
  }

  function makeQrToken() {
    // Aman untuk QR versi 1-L dan tidak mengandung kode register/nilai aset.
    const random = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "0");
    return `SATRIA:${random}`;
  }

  async function addAudit(action, detail, assetId) {
    const event = {
      id: id("audit"),
      action,
      detail,
      assetId: assetId || null,
      actor: "Operator BMN (prototipe)",
      createdAt: new Date().toISOString()
    };
    await put(STORES.audit, event);
    return event;
  }

  async function seedDefault() {
    const assets = SATRIA_CONFIG.defaultAssets.map((item) => normalizeAsset(item));
    // Pertahankan tanggal contoh agar dashboard dapat memperagakan jatuh tempo pemeriksaan.
    assets.forEach((asset, index) => {
      asset.updatedAt = SATRIA_CONFIG.defaultAssets[index].updatedAt;
      asset.verifiedAt = SATRIA_CONFIG.defaultAssets[index].verifiedAt;
    });
    for (const asset of assets) {
      await put(STORES.assets, asset);
      await put(STORES.inspections, {
        id: id("inspection"),
        assetId: asset.id,
        condition: asset.condition,
        date: asset.lastInspection,
        inspector: "Operator BMN (data contoh)",
        note: asset.notes || "Pemeriksaan data contoh.",
        recommendation: asset.condition === "Baik" ? "Tidak ada tindak lanjut." : "Tinjau dan verifikasi tindak lanjut.",
        createdAt: asset.verifiedAt
      });
    }
    await put(STORES.settings, { key: "seeded", value: true });
    await addAudit("Data contoh dimuat", "7 aset sintetis tersedia untuk uji alur SATRIA BMN.");
  }

  async function initialize() {
    database = await open();
    const assets = await getAll(STORES.assets);
    if (assets.length === 0) await seedDefault();
  }

  async function listAssets() {
    const assets = await getAll(STORES.assets);
    return assets.sort((a, b) => a.name.localeCompare(b.name, "id"));
  }

  async function findAsset(idValue) {
    return getOne(STORES.assets, idValue);
  }

  async function findAssetByQr(token) {
    const target = String(token || "").trim().toUpperCase();
    const assets = await getAll(STORES.assets);
    return assets.find((asset) => String(asset.qrToken || "").toUpperCase() === target) || null;
  }

  async function saveAsset(source, isNew) {
    const asset = normalizeAsset(source);
    await put(STORES.assets, asset);
    await addAudit(isNew ? "Aset ditambahkan" : "Data aset diperbarui", `${asset.name} · ${asset.code}/${asset.register}`, asset.id);
    return asset;
  }

  async function listInspections(assetId) {
    const items = await getAll(STORES.inspections);
    return items
      .filter((item) => !assetId || item.assetId === assetId)
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }

  async function addInspection(source) {
    const item = {
      id: id("inspection"),
      assetId: source.assetId,
      condition: SATRIA_CONFIG.conditions.includes(source.condition) ? source.condition : "Baik",
      date: source.date || new Date().toISOString().slice(0, 10),
      inspector: String(source.inspector || "Operator BMN (prototipe)").trim(),
      note: String(source.note || "").trim(),
      recommendation: String(source.recommendation || "").trim(),
      createdAt: new Date().toISOString()
    };
    const asset = await findAsset(source.assetId);
    if (!asset) throw new Error("Aset tidak ditemukan.");
    asset.condition = item.condition;
    asset.lastInspection = item.date;
    asset.updatedAt = new Date().toISOString();
    await put(STORES.inspections, item);
    await put(STORES.assets, asset);
    await addAudit("Kondisi aset diperiksa", `${asset.name}: ${item.condition}. ${item.recommendation || ""}`.trim(), asset.id);
    return item;
  }

  async function listAudit(limit) {
    const events = await getAll(STORES.audit);
    return events
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit || events.length);
  }

  async function importAssets(records) {
    const existing = await listAssets();
    const seen = new Set(existing.map((asset) => `${asset.code}|${asset.register}`.toUpperCase()));
    const imported = [];
    for (const record of records) {
      const key = `${record.code}|${record.register}`.toUpperCase();
      if (seen.has(key)) throw new Error(`Duplikasi ditemukan untuk ${record.code}/${record.register}.`);
      const asset = normalizeAsset(record);
      seen.add(key);
      await put(STORES.assets, asset);
      imported.push(asset);
    }
    await addAudit("Impor inventaris", `${imported.length} aset baru berhasil ditambahkan dari berkas CSV.`);
    return imported;
  }

  async function resetDemo() {
    const transaction = database.transaction(Object.values(STORES), "readwrite");
    Object.values(STORES).forEach((name) => transaction.objectStore(name).clear());
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Tidak dapat memulihkan data contoh."));
      transaction.onabort = () => reject(transaction.error || new Error("Pemulihan data contoh dibatalkan."));
    });
    await seedDefault();
  }

  window.SATRIA_DB = {
    initialize,
    listAssets,
    findAsset,
    findAssetByQr,
    saveAsset,
    listInspections,
    addInspection,
    listAudit,
    importAssets,
    resetDemo,
    makeQrToken
  };
})();
