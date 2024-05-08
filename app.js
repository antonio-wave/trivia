const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  return res.render("home");
});

// GAME \\
const players = {};
let dateStarted = null;

const game = [
  {
    question: "",
    image: "",
    options: ["", "", "", ""],
    answer: 0,
  },
];

// PLAYER \\
app.get("/player", (req, res) => {
  if (req.cookies?.player && players[req.cookies.player]) {
    return res.redirect("/player/game");
  }
  return res.render("player/auth");
});
app.get("/player/game", (req, res) => {
  if (!req.cookies?.player || !players[req.cookies.player]) {
    return res.redirect("/player");
  }
  return res.render("player/game", { player: players[req.cookies.player] });
});
app.get("/player/answers", (req, res) => {
  if (!req.cookies?.player || !players[req.cookies.player]) {
    return res.redirect("/player");
  }

  if (!players[req.cookies.player]?.answers) {
    return res.redirect("/player/game");
  }

  return res.render("player/answers", {
    player: players[req.cookies.player],
    scores: Object.values(players)
      .map(({ name, score }) => ({ name, score }))
      .sort((a, b) => b.score - a.score),
    game: game.map(({ question, options, answer }, i) => ({
      question,
      answers: options.map((option, j) => ({
        option,
        correct: j == answer,
        players: Object.values(players)
          .filter((player) => player?.answers?.[i] == j)
          .map((player) => ({ name: player?.name })),
      })),
    })),
  });
});
app.post("/api/player/auth", (req, res) => {
  if (req.body?.name) {
    const token = Math.random().toString(36).substring(7);
    players[token] = { name: req.body.name, token };
    res.cookie("player", token, { httpOnly: true });
    sendToAdmin({
      type: "players",
      players: Object.values(players).map(({ name }) => name),
    });
    return res.redirect("/player/game");
  }
});
app.post("/api/player/answer", (req, res) => {
  const player = players[req.cookies.player];
  if (!player) {
    return res.status(401).send("Unauthorized");
  }

  player.answers = req.body;
  player.score = 0;

  Object.entries(req.body).forEach(([question, answer]) => {
    if (game[question].answer == answer) {
      player.score++;
    }
  });

  res.redirect("/player/answers");
});

// ADMIN \\
app.get("/admin", (req, res) => {
  if (req.cookies?.admin === process.env.ADMIN_TOKEN) {
    return res.redirect("/admin/dashboard");
  }
  return res.render("admin/auth");
});
app.get("/admin/dashboard", (req, res) => {
  if (req.cookies?.admin !== process.env.ADMIN_TOKEN) {
    return res.redirect("/admin");
  }
  return res.render("admin/dashboard");
});
app.get("/admin/started", (req, res) => {
  if (req.cookies?.admin !== process.env.ADMIN_TOKEN) {
    return res.redirect("/admin");
  }
  return res.render("admin/started", { date: dateStarted });
});
app.get("/admin/answers", (req, res) => {
  if (req.cookies?.admin !== process.env.ADMIN_TOKEN) {
    return res.redirect("/admin");
  }
  return res.render("player/answers", {
    player: "admin",
    scores: Object.values(players)
      .map(({ name, score }) => ({ name, score }))
      .sort((a, b) => b.score - a.score),
    game: game.map(({ question, options, answer }, i) => ({
      question,
      answers: options.map((option, j) => ({
        option,
        correct: j == answer,
        players: Object.values(players)
          .filter((player) => player.answers[i] == j)
          .map(({ name }) => ({ name })),
      })),
    })),
  });
});
app.post("/api/admin/auth", (req, res) => {
  if (req.body?.token === process.env.ADMIN_TOKEN) {
    res.cookie("admin", req.body.token, { httpOnly: true });
    return res.redirect("/admin/dashboard");
  }
});
app.post("/api/admin/game/start", (req, res) => {
  broadcast({
    type: "start",
    game: game.map(({ question, image, options }) => ({
      question,
      image,
      options,
    })),
  });
  dateStarted = new Date();
  return res.redirect("/admin/started");
});

// SSE \\
let clients = [];
let adminClientRes = null;

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const player = players[req.cookies.player];
  if (!player) {
    return res.status(401).send("Unauthorized");
  }

  clients.push({
    id: player.token,
    name: player.name,
    res,
  });

  res.on("close", () => {
    console.log(`${player.name} Connection closed`);
    clients = clients.filter((client) => client.id !== player.token);
  });
});
function broadcast(data) {
  clients.forEach((client) =>
    client.res.write(`data: ${JSON.stringify(data)}\n\n`)
  );
}

app.get("/api/admin/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (req.cookies.admin !== process.env.ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }

  adminClientRes = res;

  res.on("close", () => {
    console.log("Admin Connection closed");
    adminClientRes = null;
  });
});
function sendToAdmin(data) {
  if (adminClientRes) {
    adminClientRes.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// START \\
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
