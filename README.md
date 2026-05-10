# uas-pemweb

🔗 **Live Demo:** [typerush.up.railway.app](https://typerush.up.railway.app)

## Deskripsi

TypeRush adalah aplikasi game multiplayer real-time berbasis web di mana pemain berlomba mengetik kata yang diacak hurufnya (scramble) dengan cepat dan benar. Setiap pemain memiliki 3 nyawa — jika jawaban salah atau waktu habis, nyawa berkurang. Pemain yang nyawanya habis akan tereliminasi. Pemenang adalah pemain yang bertahan paling lama.

---

## Fitur Utama

- **Sistem Room** — Buat room dengan kode unik 5 karakter, pemain lain bisa join menggunakan kode tersebut
- **Multiplayer Real-time** — Mendukung 2–8 pemain dalam satu room secara bersamaan
- **Kata Acak (Scramble)** — Sistem men-scramble huruf kata Bahasa Indonesia secara acak
- **Sistem Nyawa** — Setiap pemain punya 3 nyawa, berkurang jika salah atau timeout
- **Timer Per Kata** — Setiap kata memiliki batas waktu 30 detik
- **Sistem Eliminasi** — Pemain dengan nyawa habis tereliminasi, notifikasi dikirim ke semua pemain
- **Leaderboard** — Ranking akhir game berdasarkan kata benar terbanyak
- **Sound Effect** — Efek suara untuk jawaban benar, salah, eliminasi, dan menang
- **Responsif** — Tampilan menyesuaikan di desktop, tablet, dan smartphone
- **Host Management** — Host bisa mulai game, jika host disconnect host berpindah otomatis


## Cara Menjalankan di Localhost

### Prasyarat
- [Bun](https://bun.sh) versi 1.0 ke atas sudah terinstall

### Langkah-langkah

**1. Clone repository**
```bash
git clone https://github.com/UlfiLuthfiani/uas-pemweb.git
cd uas-pemweb
```

**2. Install dependencies**
```bash
bun install
```

**3. Jalankan server**
```bash
bun run index.js
```

**4. Buka browser**
```
http://localhost:3000
```
### Membuat Room
1. Masukkan nama kamu
2. Klik **"Buat Room"**
3. Pilih kapasitas pemain (2–8 orang)
4. Klik **"Buat Room Sekarang!"**
5. Bagikan kode room yang muncul ke temanmu

### Bergabung ke Room
1. Masukkan nama kamu
2. Klik **"Masuk Room"**
3. Masukkan kode room 5 karakter
4. Klik **"Masuk Room!"**

### Memulai Game
1. Tunggu semua pemain bergabung
2. Host klik **"Mulai Game!"**
3. Countdown 3 detik akan muncul
4. Kata acak akan ditampilkan — ketik jawaban yang benar!

### Aturan Permainan
- Setiap pemain mendapat kata berbeda yang sudah diacak hurufnya
- Ketik kata yang benar (bukan kata yang diacak) lalu tekan **Enter**
- Jawaban benar → kata baru
- Jawaban salah → nyawa berkurang 1 → kata baru
- Waktu habis (30 detik) → nyawa berkurang 1 → kata baru
- Nyawa habis → tereliminasi
- Pemain terakhir yang bertahan = **MENANG!**

## 🌐 WebSocket Events

### Client → Server
| `create_room` | `{ username, capacity }` | Buat room baru |
| `join_room` | `{ username, roomCode }` | Masuk ke room |
| `start_game` | `{ roomCode }` | Mulai game (host only) |
| `submit_answer` | `{ answer, roomCode }` | Kirim jawaban |
| `play_again` | `{ roomCode }` | Main lagi |
| `leave_room` | `{ roomCode }` | Keluar dari room |

### Server → Client
| `room_created`  Konfirmasi room dibuat |
| `room_joined` | Konfirmasi berhasil join |
| `player_joined` | Notifikasi pemain baru masuk |
| `room_ready` | Room sudah penuh |
| `game_started` | Game dimulai |
| `new_word` | Kata baru untuk pemain |
| `answer_result` | Hasil jawaban benar/salah |
| `update_lives` | Update nyawa pemain |
| `player_eliminated` | Notifikasi pemain tereliminasi |
| `game_over` | Game selesai + leaderboard |
| `host_changed` | Host berpindah |
| `room_disbanded` | Room dibubarkan |


This project was created using `bun init` in bun v1.3.12. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
