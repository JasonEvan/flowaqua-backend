# FlowAqua Backend

Backend Express dengan TypeScript strict dan ES modules. Memerlukan Node.js 22+ dan npm.

## Menjalankan development

Dari direktori project:

```sh
npm install
cp .env.example .env
npm run dev
```

Server default: `http://localhost:3000`. Ubah `PORT` di `.env` bila diperlukan. Mode development otomatis restart ketika file sumber berubah. `.env` tidak disimpan ke Git.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan server dengan auto-reload |
| `npm run typecheck` | Memeriksa tipe tanpa menghasilkan build |
| `npm run build` | Mengompilasi `src/` ke `dist/` |
| `npm start` | Menjalankan hasil build; jalankan build terlebih dahulu |

## Endpoint

| Method | Path | Status | Respons JSON |
| --- | --- | --- | --- |
| GET | `/` | 200 | `{"message":"FlowAqua API"}` |
| GET | `/health` | 200 | `{"status":"ok"}` |
| Semua | Route yang tidak terdaftar | 404 | `{"message":"Route not found"}` |

Health check hanya menunjukkan server dapat menerima request; belum memeriksa layanan eksternal.

## Struktur

- `src/app.ts`: konfigurasi Express dan route.
- `src/server.ts`: pemuatan environment dan HTTP listener.
- `.env.example`: contoh konfigurasi port.

## Produksi

```sh
npm ci
npm run build
npm start
```

Atur `PORT` melalui environment atau `.env`. Project ini belum menyertakan database, autentikasi, atau endpoint bisnis.

## Docker dan GHCR

File yang tersedia: `Dockerfile` (multi-stage, runtime non-root), `compose.yaml`,
`.dockerignore`, `docker-build.sh`, `docker-push.sh`, dan `Caddyfile`.

Isi `.env` sebelum menjalankan Docker:

```dotenv
PORT=3000
VERSION=1.0.0
GHCR_OWNER=nama-user-atau-organisasi
```

`GHCR_OWNER` harus memakai huruf kecil. Image yang dihasilkan:
`ghcr.io/<GHCR_OWNER>/flowaqua-backend:<VERSION>`.
`VERSION` adalah tag image, terpisah dari versi di `package.json`.
Compose membaca `.env`; variabel yang diekspor di shell memiliki prioritas lebih tinggi.
Token GHCR tidak perlu ditulis ke `.env` dan `.env` tidak disalin ke image.

### Build dan jalankan

Untuk development lokal tanpa sertifikat publik, gunakan `npm run dev`.
Compose ditujukan untuk deployment server dengan domain dan HTTPS.

```sh
./docker-build.sh
docker compose up -d --no-build --wait
curl --fail https://api.aqua.flow-app.my.id/health
docker compose logs -f backend caddy
```

`PORT` di `.env` hanya dipakai saat menjalankan Node.js di luar Docker. Backend
container tetap memakai port 3000 dan tidak mempublikasikan port ke host.
Caddy mengakses `backend:3000` melalui jaringan internal Compose.
Health check backend mengakses `/health`. Runtime hanya berisi dependensi produksi.
Script build dapat dijalankan dari direktori mana pun dan meneruskan opsi tambahan,
misalnya `./docker-build.sh --no-cache`.

### Batas resource server

Compose membatasi tiap container backend:

| Pengaturan | Batas |
| --- | --- |
| RAM container (`mem_limit`) | 384 MiB |
| Heap old-space Node.js (`NODE_OPTIONS`) | 256 MiB |
| CPU (`cpus`) | 1.5 CPU |
| Proses/thread (`pids_limit`) | 128 |
| Log `json-file` | 2 file, masing-masing maksimal 5 MiB |

Batas CPU adalah maksimum, bukan reservasi. Heap bukan total RAM Node.js;
buffer, native memory, dan thread juga memakai RAM. Container dapat dihentikan
OOM killer jika mencapai batas RAM. Sesuaikan batas berdasarkan beban aktual.
`init: true` tetap digunakan untuk menangani proses anak.

Perubahan batas cukup diterapkan dengan `docker compose up -d --wait`
(Compose akan membuat ulang container); tidak perlu build image ulang.

### HTTPS dengan Caddy

`Caddyfile` menetapkan domain `api.aqua.flow-app.my.id`. Caddy meneruskan request
ke backend dan otomatis menerbitkan serta memperbarui sertifikat HTTPS publik.
HTTP dialihkan ke HTTPS. Port TCP publik hanya 80 dan 443; port backend 3000
tidak perlu dibuka di firewall.

Sebelum menjalankan di server:

1. Buat DNS record `A` untuk `api.aqua.flow-app.my.id` ke IP publik server.
2. Tambahkan record `AAAA` hanya jika konektivitas IPv6 server berfungsi.
3. Izinkan TCP 80/443 pada firewall server, firewall penyedia VPS, dan NAT jika ada.
4. Pastikan tidak ada service lain memakai port 80/443.
5. Jika menggunakan Cloudflare, gunakan DNS-only saat setup awal.

Jika mengaktifkan proxy Cloudflare setelah sertifikat terbit, gunakan mode SSL/TLS
Full (strict), bukan Flexible. Server di balik CGNAT tanpa akses inbound memerlukan
pendekatan lain, misalnya tunnel.

Volume `caddy_data` menyimpan sertifikat dan `caddy_config` menyimpan konfigurasi
persisten Caddy. Jangan gunakan `docker compose down -v` pada deployment produksi:
opsi tersebut menghapus volume, termasuk state sertifikat. Backup volume tersebut.
Tidak diperlukan mount Docker socket atau token DNS untuk setup ini.

Caddy dibatasi RAM 128 MiB, CPU 0.5, 128 proses/thread, dan rotasi log 2 × 5 MiB.
Gabungan batas maksimum backend dan Caddy adalah 512 MiB RAM; sistem operasi,
Docker, dan service lain tetap membutuhkan RAM tambahan.

`docker compose up --wait` tidak membuktikan sertifikat publik sudah diterbitkan.
Periksa `docker compose logs caddy` dan akses URL HTTPS setelah DNS aktif.
Jika mengubah `Caddyfile`, validasi dan reload tanpa build image:

```sh
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### Push ke GHCR

Buat GitHub Personal Access Token (classic) dengan scope `write:packages`
dan izin ke namespace tujuan. Jika organisasi mewajibkan SSO, otorisasi token.
`GHCR_USERNAME` adalah akun GitHub pemilik token, bukan harus sama dengan
`GHCR_OWNER` bila image dimiliki organisasi.

```sh
export GHCR_USERNAME=nama-akun-github
# Masukkan token secara interaktif, jangan simpan di history atau repository.
read -r -s -p "GHCR token: " GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
unset GHCR_TOKEN
./docker-build.sh
./docker-push.sh
```

Contoh login di atas untuk Bash. Script push hanya mengunggah image yang sudah
dibangun; setelah mengubah `VERSION`, build ulang sebelum push. Tidak ada tag
`latest` otomatis. Compose menetapkan `platform: linux/amd64` untuk build dan
runtime sesuai server AMD64, termasuk saat build dari mesin ARM64.

### Jalankan image dari registry

Di server tujuan, sediakan `compose.yaml`, `Caddyfile`, `deploy.sh`, dan `.env`
dengan owner dan versi yang sama. Login GHCR jika package private (token dengan
`read:packages`). Contoh salin dari direktori backend di komputer lokal:

```sh
scp compose.yaml Caddyfile deploy.sh USER@IP_SERVER:~/flowaqua-backend/
```

Buat folder tujuan terlebih dahulu dan buat `.env` di server. Kemudian jalankan:

```sh
chmod +x deploy.sh
./deploy.sh
```

Script membaca `.env` di direktori script, sehingga dapat dipanggil dari direktori
mana pun. Script melakukan `docker compose pull`, lalu
`docker compose up -d --no-build --force-recreate --wait`, dan menampilkan status
container. Jika pull gagal, langkah up tidak dijalankan. Script tidak login GHCR,
build image, atau menghapus volume.

`--force-recreate` membuat ulang backend dan Caddy pada setiap deploy, sehingga
ada jeda layanan singkat. Volume sertifikat tetap dipertahankan. `--wait` menunggu
backend healthy dan Caddy berjalan; tetap periksa HTTPS publik secara terpisah.
Untuk rilis baru, ubah `VERSION` di `.env` server lalu jalankan `./deploy.sh` lagi.

Untuk menghentikan container project:

```sh
docker compose down
```
