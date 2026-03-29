// ─── server.js ───────────────────────────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

// Routes
app.use("/api/bog", require("./routes/bog"));
app.use("/api/tbc", require("./routes/tbc"));

// Chat (Socket.io)
require("./chat-server")(server);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
