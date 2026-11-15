# Rancangan Teknis SATRIA BMN

## 1. Ruang lingkup prototipe

Prototipe lokal ini adalah SPA (single-page web application) tanpa dependensi eksternal. Browser menyimpan data uji di **IndexedDB** dan server Node bawaan hanya menyajikan berkas aplikasi di `127.0.0.1`. Pilihan ini memungkinkan demonstrasi pada komputer atau ponsel dalam jaringan lokal tanpa menentukan hosting lebih dahulu.

```
Browser desktop / ponsel
        │
        ├─ Antarmuka responsif (HTML, CSS, JavaScript)
        ├─ IndexedDB lokal: aset, pemeriksaan, audit
        └─ Pembuat QR offline + pemindai kamera browser

Node server lokal (hanya static file pada 127.0.0.1)
```

QR memuat token acak singkat, misalnya `SATRIA:BMN:001`; QR tidak boleh memuat NUP, nilai perolehan, data pegawai, atau detail aset yang sensitif.

## 2. Arsitektur target produksi

| Lapisan | Rekomendasi | Catatan |
|---|---|---|
| Frontend | React/TypeScript atau stack web yang ditetapkan instansi | Responsif/PWA, hanya mengonsumsi API internal. |
| API | Node.js dengan Fastify/Express atau layanan internal setara | REST/JSON dengan validasi server-side. |
| Basis data | PostgreSQL; SQLite server hanya untuk pilot satu lokasi | Backup, migrasi, dan kontrol akses dikelola server. |
| Berkas | Penyimpanan internal terpisah untuk foto/dokumen | Validasi jenis, ukuran, dan malware sesuai kebijakan. |
| Akses | HTTPS di jaringan internal/VPN, SSO atau akun internal | Cookie aman, RBAC, logout otomatis, pembatasan percobaan login. |
| Observabilitas | Audit log append-only, backup terenkripsi, monitoring | Audit tidak dapat diubah dari UI pengguna biasa. |

## 3. Model data inti

| Entitas | Atribut utama |
|---|---|
| `assets` | `id`, kode barang, NUP, nama, kategori, merek/model, serial, tahun/nilai perolehan, lokasi, penanggung jawab, kondisi, status, foto, waktu verifikasi. |
| `categories` | kode kategori, nama, masa manfaat. |
| `locations` | gedung, lantai, ruang, kode lokasi. |
| `condition_inspections` | aset, tanggal, kondisi, petugas, catatan, bukti foto, rekomendasi, jatuh tempo tindak lanjut. |
| `maintenance_records` | aset, tindakan, pelaksana/vendor, biaya, status, tanggal. |
| `asset_movements` | aset, lokasi asal/tujuan, tanggal, dasar perpindahan, petugas, verifikator. |
| `qr_labels` | aset, token unik, status, waktu terbit/cetak, waktu nonaktif. |
| `import_batches` | sumber, petugas, jumlah valid/gagal, hasil validasi, waktu impor. |
| `users`, `roles` | identitas pegawai, peran, unit, status akun. |
| `audit_logs` | pelaku, aksi, objek, nilai sebelum/sesudah, alasan, waktu, IP/perangkat bila sesuai kebijakan. |

Kunci bisnis untuk mencegah duplikasi inventaris adalah kombinasi **`kode_barang + nup`** per satuan kerja. Penghapusan sebaiknya berupa pengarsipan/soft delete dan memerlukan verifikasi sesuai SOP.

## 4. Aturan impor data aktual

Kolom wajib prototipe: `kode_barang`, `nup`, `nama_barang`, `lokasi`, `kondisi`, `tahun_perolehan`, dan `nilai_perolehan`.

Sebelum simpan, backend produksi harus:

1. Menampilkan pratinjau dan total per baris valid/gagal.
2. Menolak duplikasi `kode_barang + nup`, kondisi di luar daftar, nilai/tahun tidak valid, serta lokasi kosong.
3. Menyimpan batch impor dan daftar kesalahan per baris.
4. Tidak menimpa data lama tanpa jejak perubahan, alasan, dan hak verifikator.
5. Memastikan berkas aktual tidak masuk repositori Git, paket demo, atau log aplikasi.

## 5. Matriks hak akses minimum

| Aksi | Admin | Operator BMN | Verifikator | Pemeriksa | Pimpinan |
|---|---:|---:|---:|---:|---:|
| Kelola pengguna/konfigurasi | Ya | Tidak | Tidak | Tidak | Tidak |
| Impor/tambah inventaris | Ya | Ya | Terbatas | Tidak | Tidak |
| Cetak QR | Ya | Ya | Tidak | Tidak | Tidak |
| Catat pemeriksaan | Ya | Ya | Ya | Ya | Tidak |
| Setujui mutasi/temuan penting | Ya | Usul | Ya | Usul | Baca |
| Lihat dashboard/laporan | Ya | Ya | Ya | Terbatas | Ya |
| Lihat audit | Ya | Terbatas | Ya | Baca terbatas | Baca terbatas |

## 6. Pengamanan wajib sebelum go-live

- Login individual; tidak ada akun admin bersama.
- Password di-hash menggunakan Argon2id/bcrypt; sesi menggunakan cookie `HttpOnly`, `Secure`, dan `SameSite` yang tepat.
- HTTPS dan akses melalui jaringan internal/VPN yang disetujui.
- Pembatasan percobaan login, logout otomatis, dan pengelolaan akun pegawai pindah/berhenti.
- QR tetap memerlukan autentikasi untuk membuka profil aset.
- Validasi server untuk seluruh input, termasuk jenis/ukuran unggahan foto dan dokumen.
- Backup terjadwal, terenkripsi, diuji pemulihannya, serta SOP insiden dan retensi data.
- Audit trail append-only, pengawasan akses administratif, dan pemisahan lingkungan demo/pilot/produksi.

## 7. Kriteria penerimaan pilot

- Impor inventaris memvalidasi struktur dan duplikasi sebelum disimpan.
- Aset dapat dicari, difilter, dibuka dengan token QR, dan dicetak labelnya.
- Pembaruan pemeriksaan mengubah kondisi terkini serta membentuk riwayat.
- Dashboard dan laporan konsisten dengan data hasil impor.
- Laporan kondisi, lokasi, dan aset bermasalah dapat diekspor.
- Tampilan dapat digunakan pada layar komputer maupun ponsel.
- Pengujian pengguna dilakukan menggunakan data yang telah disetujui dan tanpa mengekspos data inventaris riil ke luar lingkungan internal.

## 8. Tahapan implementasi

1. **Pilot lokal:** validasi alur dan kamus data bersama Pengurus Barang dan Bidang Pembinaan.
2. **Penguatan backend:** autentikasi internal, database server, audit, backup, unggahan bukti, dan mutasi aset.
3. **Uji penerimaan:** uji data, keamanan, kinerja, SOP, serta pelatihan pengguna.
4. **Go-live internal:** penerapan terbatas pada Kejari Inhu dengan dukungan dan pemulihan yang jelas.
5. **Replikasi:** jadikan identitas satuan kerja, lokasi, kategori, dan laporan sebagai konfigurasi untuk Kejari lain.
