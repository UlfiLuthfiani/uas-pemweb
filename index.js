import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const WORDS = [
  "kucing","anjing","burung","ikan","kelinci","harimau","gajah","kuda","sapi","ayam",
  "pohon","bunga","daun","batu","sungai","gunung","laut","pantai","hutan","sawah",
  "makan","minum","tidur","jalan","lari","loncat","renang","baca","tulis","dengar",
  "rumah","meja","kursi","pintu","jendela","lantai","atap","tembok","tangga","kamar",
  "buku","pensil","kertas","penggaris","tas","sepatu","baju","celana","topi","jam",
  "apel","mangga","pisang","jeruk","anggur","semangka","nanas","pepaya","rambutan","durian",
  "nasi","roti","mie","soto","bakso","rendang","gado","sate","tempe","tahu",
  "merah","biru","hijau","kuning","hitam","putih","ungu","oranye","coklat","abu",
  "satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan","sepuluh",
  "pagi","siang","sore","malam","kemarin","hari","minggu","bulan","tahun","waktu",
  "cepat","lambat","besar","kecil","tinggi","pendek","panjang","lebar","berat","ringan",
  "senang","sedih","marah","takut","berani","malu","bangga","kaget","bosan","capek",
  "teman","keluarga","ibu","ayah","kakak","adik","nenek","kakek","paman","bibi",
  "sekolah","kantor","pasar","toko","masjid","gereja","rumah sakit","hotel","bandara","stasiun",
  "mobil","motor","sepeda","pesawat","kapal","kereta","bus","truk","becak","bajaj",
];

function getRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function scrambleWord(word) {
  const chars = word.split("");
  let scrambled;
  let attempts = 0;
  do {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    scrambled = chars.join("");
    attempts++;
  } while (scrambled === word && attempts < 10);
  return scrambled;
}


function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
//  IN-MEMORY STORE
// ============================================================
/**
 * rooms: {
 *   [roomCode]: {
 *     capacity: number,
 *     gameStarted: boolean,
 *     players: [
 *       { id, username, ws, lives, wordCount, correctCount, wrongCount, eliminated }
 *     ]
 *     timers: { [playerId]: TimeoutId }
 *   }
 * }
 */
const rooms = {};

// ============================================================
//  HELPERS
// ============================================================
function send(ws, type, payload = {}) {
  try {
    ws.send(JSON.stringify({ type, payload }));
  } catch (_) {}
}

function broadcast(room, type, payload = {}, excludeId = null) {
  for (const p of room.players) {
    if (p.id !== excludeId) send(p.ws, type, payload);
  }
}

function broadcastAll(room, type, payload = {}) {
  for (const p of room.players) send(p.ws, type, payload);
}

/** Build opponent info list for a given player */
function buildOpponents(room, forPlayerId) {
  return room.players
    .filter((p) => p.id !== forPlayerId)
    .map((p) => ({
      id: p.id,
      username: p.username,
      lives: p.lives,
      wordCount: p.wordCount,
      eliminated: p.eliminated,
    }));
}

/** Broadcast updated opponent info to every active player */
function broadcastOpponents(room) {
  for (const p of room.players) {
    if (!p.eliminated) {
      send(p.ws, "opponent_update", { opponents: buildOpponents(room, p.id) });
    }
  }
}

function clearPlayerTimer(room, playerId) {
  if (room.timers[playerId]) {
    clearTimeout(room.timers[playerId]);
    delete room.timers[playerId];
  }
}

function startWordTimer(room, player) {
  clearPlayerTimer(room, player.id);

  room.timers[player.id] = setTimeout(() => {
    if (player.eliminated || !rooms[room.code]) return;

    player.lives -= 1;
    send(player.ws, "update_lives", {
      playerId: player.id,
      lives: player.lives,
      reason: "timeout",
    });

    // Broadcast updated lives to opponents
    broadcast(room, "update_lives", {
      playerId: player.id,
      lives: player.lives,
      reason: "timeout",
    }, player.id);

    broadcastOpponents(room);

    if (player.lives <= 0) {
      eliminatePlayer(room, player);
    } else {
      giveNewWord(room, player);
    }
  }, 30_000); // 30 seconds
}

function giveNewWord(room, player) {
  const word = getRandomWord();
  const scrambled = scrambleWord(word);
  player.currentWord = word; // simpan kata asli untuk validasi
  send(player.ws, "new_word", { word: scrambled, originalLength: word.length, timeLimit: 30 });
  startWordTimer(room, player);
}

function eliminatePlayer(room, player) {
  player.eliminated = true;
  clearPlayerTimer(room, player.id);

  send(player.ws, "player_eliminated", {
    playerId: player.id,
    username: player.username,
  });

  broadcast(room, "player_eliminated", {
    playerId: player.id,
    username: player.username,
  }, player.id);

  broadcastOpponents(room);
  checkGameOver(room);
}

function checkGameOver(room) {
  const alive = room.players.filter((p) => !p.eliminated);

  if (alive.length <= 1) {
    // Stop all timers
    for (const p of room.players) clearPlayerTimer(room, p.id);

    // Build leaderboard: sort by correctCount desc, eliminated last
    const leaderboard = [...room.players]
      .sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        return b.correctCount - a.correctCount;
      })
      .map((p) => ({
        id: p.id,
        username: p.username,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        wordCount: p.wordCount,
        eliminated: p.eliminated,
        lives: p.lives,
      }));

    if (alive.length === 1) {
      const winner = alive[0];
      broadcastAll(room, "game_over", {
        winnerId: winner.id,
        winnerName: winner.username,
        isDraw: false,
        leaderboard,
      });
    } else {
      broadcastAll(room, "game_over", {
        winnerId: null,
        winnerName: null,
        isDraw: true,
        leaderboard,
      });
    }

    room.gameStarted = false;
  }
}

function findRoomByPlayerId(playerId) {
  for (const code of Object.keys(rooms)) {
    const player = rooms[code].players.find((p) => p.id === playerId);
    if (player) return { room: rooms[code], player };
  }
  return null;
}

// ============================================================
//  WEBSOCKET MESSAGE HANDLER
// ============================================================
function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return send(ws, "error", { message: "Format pesan tidak valid." });
  }

  const { type, payload = {} } = msg;

  switch (type) {
    // ----------------------------------------------------------
    case "create_room": {
      const { username, capacity = 2 } = payload;
      if (!username?.trim()) return send(ws, "error", { message: "Username tidak boleh kosong." });

      const cap = Math.max(2, Math.min(8, parseInt(capacity) || 2));

      // Generate unique room code
      let code;
      do { code = generateRoomCode(); } while (rooms[code]);

      const playerId = generatePlayerId();
      ws.__playerId = playerId;
      ws.__roomCode = code;

      const player = {
        id: playerId,
        username: username.trim(),
        ws,
        lives: 3,
        wordCount: 0,
        correctCount: 0,
        wrongCount: 0,
        eliminated: false,
        currentWord: null,
        isHost: true,
      };

      rooms[code] = {
        code,
        capacity: cap,
        gameStarted: false,
        players: [player],
        timers: {},
      };

      send(ws, "room_created", {
        roomCode: code,
        capacity: cap,
        playerId,
        players: rooms[code].players.map((p) => ({
          id: p.id,
          username: p.username,
          isHost: p.isHost,
        })),
      });
      break;
    }

    // ----------------------------------------------------------
    case "join_room": {
      const { username, roomCode } = payload;
      if (!username?.trim()) return send(ws, "error", { message: "Username tidak boleh kosong." });
      if (!roomCode) return send(ws, "error", { message: "Kode room diperlukan." });

      const code = roomCode.toUpperCase();
      const room = rooms[code];

      if (!room) return send(ws, "error", { message: `Room "${code}" tidak ditemukan.` });
      if (room.gameStarted) return send(ws, "error", { message: "Game sudah berjalan, tidak bisa join." });
      if (room.players.length >= room.capacity) return send(ws, "error", { message: "Room sudah penuh!" });

      const playerId = generatePlayerId();
      ws.__playerId = playerId;
      ws.__roomCode = code;

      const player = {
        id: playerId,
        username: username.trim(),
        ws,
        lives: 3,
        wordCount: 0,
        correctCount: 0,
        wrongCount: 0,
        eliminated: false,
        currentWord: null,
        isHost: false,
      };

      room.players.push(player);

      const playersInfo = room.players.map((p) => ({
        id: p.id,
        username: p.username,
        isHost: p.isHost,
      }));

      // Confirm to joiner
      send(ws, "room_joined", {
        roomCode: code,
        capacity: room.capacity,
        playerId,
        players: playersInfo,
      });

      // Notify existing players
      broadcast(room, "player_joined", {
        username: player.username,
        players: playersInfo,
        capacity: room.capacity,
      }, playerId);

      // Check if room is now full
      if (room.players.length >= room.capacity) {
        broadcastAll(room, "room_ready", {
          players: playersInfo,
          capacity: room.capacity,
        });
      }
      break;
    }

    // ----------------------------------------------------------
    case "start_game": {
      const { roomCode } = payload;
      const code = (roomCode || ws.__roomCode || "").toUpperCase();
      const room = rooms[code];
      if (!room) return send(ws, "error", { message: "Room tidak ditemukan." });

      const caller = room.players.find((p) => p.id === ws.__playerId);
      if (!caller?.isHost) return send(ws, "error", { message: "Hanya host yang bisa memulai game." });
      if (room.players.length < 2) return send(ws, "error", { message: "Minimal 2 pemain untuk memulai." });
      if (room.gameStarted) return;

      room.gameStarted = true;

      // Reset all players
      for (const p of room.players) {
        p.lives = 3;
        p.wordCount = 0;
        p.correctCount = 0;
        p.wrongCount = 0;
        p.eliminated = false;
        p.currentWord = null;
      }

      broadcastAll(room, "game_started", {
        players: room.players.map((p) => ({
          id: p.id,
          username: p.username,
          lives: p.lives,
        })),
      });

      // Give each player their first word after 4s (countdown on client)
      setTimeout(() => {
        if (!rooms[code]) return;
        for (const p of room.players) {
          giveNewWord(room, p);
        }
      }, 4000);
      break;
    }

    // ----------------------------------------------------------
    case "submit_answer": {
      const { answer, roomCode } = payload;
      const code = (roomCode || ws.__roomCode || "").toUpperCase();
      const room = rooms[code];
      if (!room || !room.gameStarted) return;

      const player = room.players.find((p) => p.id === ws.__playerId);
      if (!player || player.eliminated) return;

      const isCorrect =
        answer?.trim().toLowerCase() === player.currentWord?.toLowerCase();

      player.wordCount++;

      if (isCorrect) {
        player.correctCount++;
        send(ws, "answer_result", { correct: true, correctWord: player.currentWord });
        giveNewWord(room, player);
      } else {
        player.wrongCount++;
        player.lives -= 1;

        send(ws, "answer_result", { correct: false, correctWord: player.currentWord });
        send(ws, "update_lives", {
          playerId: player.id,
          lives: player.lives,
          reason: "wrong",
        });

        broadcast(room, "update_lives", {
          playerId: player.id,
          lives: player.lives,
          reason: "wrong",
        }, player.id);

        broadcastOpponents(room);

        if (player.lives <= 0) {
          eliminatePlayer(room, player);
        } else {
          giveNewWord(room, player);
        }
      }
      break;
    }

    // ----------------------------------------------------------
    case "play_again": {
      // Player mau main lagi — kembali ke waiting room
      const code = (payload.roomCode || ws.__roomCode || "").toUpperCase();
      const room = rooms[code];
      if (!room) return send(ws, "error", { message: "Room tidak ditemukan." });

      const caller = room.players.find((p) => p.id === ws.__playerId);
      if (!caller) return;

      // Clear all timers & reset game state
      for (const p of room.players) {
        clearPlayerTimer(room, p.id);
        p.lives = 3;
        p.wordCount = 0;
        p.correctCount = 0;
        p.wrongCount = 0;
        p.eliminated = false;
        p.currentWord = null;
      }
      room.gameStarted = false;

      const playersInfo = room.players.map((p) => ({
        id: p.id,
        username: p.username,
        isHost: p.isHost,
      }));

      // Broadcast ke semua pemain di room → balik ke waiting room
      broadcastAll(room, "game_restarted", {
        players: playersInfo,
        capacity: room.capacity,
      });
      break;
    }

    // ----------------------------------------------------------
    case "leave_room": {
      // Player pilih kembali ke home → bubarkan dari sisi player ini
      const code = (payload.roomCode || ws.__roomCode || "").toUpperCase();
      const room = rooms[code];
      if (!room) return;

      const callerIdx = room.players.findIndex((p) => p.id === ws.__playerId);
      if (callerIdx === -1) return;

      const caller = room.players[callerIdx];
      const wasHost = caller.isHost;

      // Clear timer
      clearPlayerTimer(room, caller.id);

      // Remove from room
      room.players.splice(callerIdx, 1);

      // Jika room kosong → hapus
      if (room.players.length === 0) {
        delete rooms[code];
        ws.__roomCode = null;
        return;
      }

      // Jika yang keluar adalah host → pindah host + bubarkan room (host = pemilik room)
      if (wasHost) {
        // Host keluar = room dibubarkan, semua pemain dikembalikan ke home
        for (const p of room.players) clearPlayerTimer(room, p.id);
        broadcastAll(room, "room_disbanded", {
          reason: "Host membubarkan room.",
        });
        delete rooms[code];
      } else {
        // Bukan host yang keluar → update room
        if (room.gameStarted) {
          caller.eliminated = true;
          broadcastOpponents(room);
          checkGameOver(room);
        }
        const playersInfo = room.players.map((p) => ({
          id: p.id,
          username: p.username,
          isHost: p.isHost,
        }));
        broadcastAll(room, "room_player_update", {
          players: playersInfo,
          capacity: room.capacity,
        });
      }

      ws.__roomCode = null;
      break;
    }

    // ----------------------------------------------------------
    case "restart_game": {
      // Legacy — redirect ke play_again
      const code2 = (payload.roomCode || ws.__roomCode || "").toUpperCase();
      const room2 = rooms[code2];
      if (!room2) return;
      const caller2 = room2.players.find((p) => p.id === ws.__playerId);
      if (!caller2?.isHost) return send(ws, "error", { message: "Hanya host yang bisa restart." });
      for (const p of room2.players) clearPlayerTimer(room2, p.id);
      room2.gameStarted = false;
      broadcastAll(room2, "game_restarted", {
        players: room2.players.map((p) => ({ id: p.id, username: p.username, isHost: p.isHost })),
        capacity: room2.capacity,
      });
      break;
    }

    default:
      send(ws, "error", { message: `Event "${type}" tidak dikenal.` });
  }
}

// ============================================================
//  WEBSOCKET CLOSE HANDLER
// ============================================================
function handleClose(ws) {
  const playerId = ws.__playerId;
  const roomCode = ws.__roomCode;
  if (!playerId || !roomCode) return;

  const room = rooms[roomCode];
  if (!room) return;

  const playerIdx = room.players.findIndex((p) => p.id === playerId);
  if (playerIdx === -1) return;

  const player = room.players[playerIdx];
  const wasHost = player.isHost;
  const wasGameStarted = room.gameStarted;

  clearPlayerTimer(room, playerId);

  // Notify others player disconnected
  broadcast(room, "player_disconnected", {
    playerId,
    username: player.username,
  }, playerId);

  if (wasGameStarted) {
    // Treat disconnect as elimination — game tetap lanjut!
    player.eliminated = true;
    broadcastOpponents(room);
    checkGameOver(room);
  }

  // Remove player from room
  room.players.splice(playerIdx, 1);

  // Clean up empty rooms
  if (room.players.length === 0) {
    delete rooms[roomCode];
    return;
  }

  // If host left → pindahkan host ke pemain berikutnya
  if (wasHost) {
    room.players[0].isHost = true;
    broadcastAll(room, "host_changed", {
      newHostId: room.players[0].id,
      newHostName: room.players[0].username,
    });
  }

  // Update player list untuk semua yang masih di room
  const playersInfo = room.players.map((p) => ({
    id: p.id,
    username: p.username,
    isHost: p.isHost,
  }));

  if (!wasGameStarted) {
    // Di waiting room → update player list
    broadcastAll(room, "room_player_update", {
      players: playersInfo,
      capacity: room.capacity,
    });
  }
}

// ============================================================
//  HONO APP
// ============================================================
const app = new Hono();

// Serve static files from ./public
app.use("/*", serveStatic({ root: "./public" }));

// ============================================================
//  BUN SERVER (HTTP + WebSocket)
// ============================================================
const server = Bun.serve({
  port: process.env.PORT || 3000,

  // Hand off HTTP requests to Hono
  async fetch(req, server) {
    // Upgrade WebSocket connections
    if (server.upgrade(req)) return;
    return app.fetch(req);
  },

  websocket: {
    open(ws) {
      console.log(`[WS] Client connected`);
    },

    message(ws, message) {
      handleMessage(ws, message);
    },

    close(ws) {
      console.log(`[WS] Client disconnected: ${ws.__playerId ?? "unknown"}`);
      handleClose(ws);
    },
  },
});

console.log(`
 http://localhost:${server.port} 
`);