# FlowAqua Backend

Backend Express dengan TypeScript strict dan ES modules. Memerlukan Node.js 22+ dan npm.
Data TDS dan suhu air disimpan di PostgreSQL Supabase melalui TypeORM.

## Menjalankan development

Dari direktori project:

```sh
npm install
cp .env.example .env
# Isi DATABASE_URL di .env sebelum menjalankan perintah berikut.
npm run migration:run
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
| `npm run migration:run` | Menerapkan migration dari source TypeScript |
| `npm run migration:show` | Menampilkan status migration: `[X]` sudah diterapkan, `[ ]` belum diterapkan |
| `npm run migration:revert` | Membatalkan migration terakhir; migration awal menghapus tabel beserta datanya |
| `npm run migration:run:prod` | Menerapkan migration dari hasil build |
| `npm run migration:revert:prod` | Membatalkan migration terakhir dari hasil build |

## Endpoint

| Method | Path | Status | Respons JSON |
| --- | --- | --- | --- |
| GET | `/` | 200 | `{"message":"FlowAqua API"}` |
| GET | `/health` | 200 | `{"status":"ok"}` |
| POST | `/readings` | 201 | Pembacaan yang disimpan, termasuk `id` dan `recordedAt` |
| GET | `/readings?limit=100` | 200 | Array pembacaan terbaru, diurutkan dari waktu terbaru |
| Semua | Route yang tidak terdaftar | 404 | `{"message":"Route not found"}` |

Health check hanya menunjukkan server dapat menerima request; belum memeriksa layanan eksternal.

### Menyimpan dan membaca data sensor

Untuk satu ESP32, body cukup berisi TDS dalam ppm dan suhu dalam Celsius:

```sh
curl -i http://localhost:3000/readings \
  -H 'Content-Type: application/json' \
  -d '{"tdsPpm":450.25,"temperatureC":28.5}'

curl 'http://localhost:3000/readings?limit=100'
```

Contoh respons POST (GET mengembalikan array objek dengan bentuk yang sama):

```json
{
  "id": "991698b1-e433-4d72-b208-6152addc0d0a",
  "tdsPpm": 450.25,
  "temperatureC": 28.5,
  "recordedAt": "2026-10-29T00:00:00.000Z"
}
```

`recordedAt` dibuat database saat data diterima, bukan waktu pengukuran ESP32.
Field tambahan tidak disimpan. TDS harus angka finite >= 0; suhu harus angka finite
>= -273.15. Angka dalam bentuk string, field wajib yang hilang, dan JSON rusak
menghasilkan HTTP 400. `limit` default 100, minimum 1, maksimum 1000;
nilai tidak valid menghasilkan HTTP 400. GET mengambil data terbaru, bukan seluruh
histori. Kegagalan internal menghasilkan JSON HTTP 500 tanpa detail database.

Endpoint belum memakai autentikasi. Jangan membuka POST ke internet tanpa
proteksi akses; RLS Supabase tidak mengautentikasi request ke backend ini.

## Koneksi Supabase

1. Buka **Connect** di dashboard Supabase dan salin URI PostgreSQL, bukan project
   URL HTTPS, anon key, atau service-role key.
2. Gunakan **Session pooler**, port **5432**, untuk server IPv4. Direct connection
   juga bisa jika host mendukung jaringan database tersebut. Gunakan koneksi yang
   sama untuk backend dan migration; hindari transaction pooler untuk setup ini.
3. Isi `DATABASE_URL` di `.env`. URL-encode karakter khusus pada password.
   Jangan tambahkan parameter `sslmode`, `sslcert`, `sslkey`, atau `sslrootcert`
   pada URI karena driver PostgreSQL dapat menimpa konfigurasi koneksi.
4. Koneksi database menggunakan `ssl: false`, tanpa konfigurasi sertifikat atau
   variabel `DATABASE_SSL`. Trafik database tidak dienkripsi; gunakan hanya jika
   jaringan dan pengaturan Supabase mengizinkan koneksi tanpa TLS. Jika Supabase
   mewajibkan SSL, koneksi ini akan ditolak.
5. Jalankan `npm run migration:run`, lalu `npm run dev`.

Migration membuat tabel `public.sensor_readings` dengan UUID, `tds_ppm`,
`temperature_c`, `recorded_at` (`timestamptz`), constraint nilai, dan indeks waktu/ID.
RLS diaktifkan tanpa policy publik untuk mencegah akses lewat Supabase Data API
sebagai anon/authenticated. Koneksi backend harus memakai database owner dari
URI Supabase, yang dapat mengakses tabel tersebut.

`synchronize` dan migration otomatis TypeORM saat inisialisasi dinonaktifkan.
Saat container Docker start, perintah startup menjalankan migration produksi
terlebih dahulu, lalu menjalankan server hanya jika migration berhasil. Di luar
Docker, jalankan migration secara eksplisit sebelum menjalankan server.
Backend baru membuka HTTP listener setelah koneksi database berhasil.
Tidak ada kredensial Supabase yang disimpan di source code.


## Struktur

- `src/app.ts`: konfigurasi Express dan route.
- `src/server.ts`: pemuatan environment dan HTTP listener.
- `src/data-source.ts`: koneksi PostgreSQL dan registrasi entity/migration.
- `src/entities/sensor-reading.ts`: pemetaan tabel sensor.
- `src/migrations/`: perubahan skema database.
- `src/routes/readings.ts`: validasi input dan route sensor.
- `.env.example`: contoh konfigurasi port, deployment, dan database.

## Produksi

```sh
npm ci
npm run build
npm run migration:run:prod
npm start
```

Atur `PORT` dan `DATABASE_URL` melalui environment atau `.env`.
Autentikasi endpoint belum disertakan.

## Docker dan GHCR

File yang tersedia: `Dockerfile` (multi-stage, runtime non-root), `compose.yaml`,
`.dockerignore`, `docker-build.sh`, `docker-push.sh`, dan `Caddyfile`.

Isi `.env` sebelum menjalankan Docker:

```dotenv
PORT=3000
VERSION=1.0.0
GHCR_OWNER=nama-user-atau-organisasi
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres
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
Startup container menjalankan `npm run migration:run:prod` sebelum server.
Migration yang sudah tercatat tidak dijalankan ulang. Jika migration gagal,
container keluar dengan status nonzero dan server tidak dijalankan.
Migration berjalan saat startup, bukan saat build image; kredensial database
tidak dibutuhkan saat build. Gunakan pola ini untuk satu instance backend;
untuk beberapa replica, jalankan migration sebagai job deployment terpisah
agar tidak berlomba menjalankan perubahan skema.
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

`./deploy.sh` tidak memanggil migration secara terpisah: container backend yang
baru menjalankannya otomatis sebelum membuka server. Pastikan `DATABASE_URL`
tersedia di `.env` server sebelum deploy.

Migration memakai URI database dari environment container. Backup sebelum perubahan
skema; rollback tetap manual dan migration awal menghapus seluruh tabel pembacaan.


`--force-recreate` membuat ulang backend dan Caddy pada setiap deploy, sehingga
ada jeda layanan singkat. Volume sertifikat tetap dipertahankan. `--wait` menunggu
backend healthy dan Caddy berjalan; tetap periksa HTTPS publik secara terpisah.
Untuk rilis baru, ubah `VERSION` di `.env` server lalu jalankan `./deploy.sh` lagi.

Untuk menghentikan container project:

```sh
docker compose down
```
