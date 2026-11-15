# SATRIA BMN — Prototipe Lokal

**SATRIA BMN** adalah singkatan dari **Sistem Aset Terintegrasi untuk Registrasi, Inventarisasi, dan Analitik Barang Milik Negara**. Prototipe ini dibuat untuk mendukung Bidang Pembinaan Kejaksaan Negeri Indragiri Hulu dalam menata inventaris, pemeriksaan kondisi, QR Code, dan laporan aset.

> Status: purwarupa lokal. Data awal di aplikasi adalah **data sintetis**, bukan data inventaris Kejari Inhu.

## Menjalankan aplikasi

1. Buka PowerShell di folder ini.
2. Jalankan `node server.js`.
3. Buka `http://127.0.0.1:8787` pada browser di komputer yang sama.

Server hanya mendengarkan koneksi lokal perangkat. Data yang dimasukkan tersimpan di IndexedDB browser tersebut. Untuk memulai ulang data contoh, buka menu **Jejak aktivitas** lalu pilih **Pulihkan data contoh**.

## Alur uji cepat

1. Buka **Inventaris BMN**, cari aset contoh, kemudian tekan **QR**.
2. Dari menu **Pindai QR**, masukkan `SATRIA:BMN:001` untuk menguji pencarian QR tanpa kamera.
3. Buka **Monitoring kondisi**, pilih **Catat pemeriksaan**, ubah kondisi, lalu simpan. Dashboard dan riwayat akan berubah.
4. Buka **Impor data**, unduh template, isi CSV dengan data yang telah diverifikasi, lalu unggah. Sistem akan memeriksa kolom wajib dan duplikasi `kode_barang + nup` sebelum data valid ditambahkan.
5. Buka **Laporan**, pilih filter, lalu ekspor CSV atau pilih **Cetak / PDF**.

## Yang sudah berfungsi

- Dashboard metrik, distribusi kondisi, lokasi, dan aktivitas.
- Tambah/ubah/cari/filter inventaris.
- Penyimpanan inventaris lokal melalui IndexedDB.
- Penerbitan QR Code offline untuk token internal non-sensitif.
- Pemindaian QR lewat kamera bila browser mendukung `BarcodeDetector`, serta pencarian token manual sebagai fallback.
- Pencatatan pemeriksaan kondisi dan riwayatnya.
- Impor CSV dengan pratinjau, validasi, serta pencegahan duplikasi.
- Ekspor CSV inventaris, monitoring, dan laporan; cetak laporan ke PDF melalui browser.
- Jejak aktivitas lokal untuk memperagakan audit trail.

## Batasan prototipe yang penting

- Ini belum merupakan sistem produksi dan **bukan pengganti aplikasi BMN resmi**.
- Akses internal yang terlihat di antarmuka adalah simulasi; belum ada login, RBAC server, enkripsi server, atau sinkronisasi antarperangkat.
- Data hanya berada pada browser/perangkat yang digunakan. Jangan memasukkan data sensitif atau inventaris aktual sebelum lingkungan internal dan prosedur cadangan tersedia.
- Kamera dan pembacaan QR bergantung pada dukungan browser serta izin perangkat.

Rencana penerapan produksi, skema data, keamanan, dan langkah replikasi tersedia pada [RANCANGAN-TEKNIS.md](RANCANGAN-TEKNIS.md). Konsep inovasi dan indikator keberhasilan tersedia pada [KONSEP-INOVASI.md](KONSEP-INOVASI.md).

## Berkas data

- `data/template-inventaris.csv` — template impor CSV.
- `data/demo-inventaris.json` — contoh data sintetis; jangan diganti dengan data riil di repositori/paket publik.

## Langkah berikutnya sebelum produksi

1. Tetapkan pemilik data, klasifikasi informasi, dan SOP verifikasi inventaris.
2. Validasi serta bersihkan data sumber resmi sebelum impor awal.
3. Implementasikan backend internal, PostgreSQL/SQLite server, login SSO/akun internal, RBAC, HTTPS/VPN, audit log tidak dapat diubah, dan backup teruji.
4. Uji bersama Pengurus Barang, Kasubbag Pembinaan, operator ruangan, dan pimpinan pada satu lokasi pilot.
5. Setelah indikator pilot terpenuhi, kemas konfigurasi satuan kerja agar dapat direplikasi oleh Kejari lain.
