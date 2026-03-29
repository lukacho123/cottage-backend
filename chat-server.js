// chat-server.js — Chat Backend Socket.io + WhatsApp
// npm install socket.io twilio
// დაამატე server.js-ში: require('./chat-server')(server);

const { Server } = require("socket.io");
const twilio = require("twilio");

// ── TWILIO (WhatsApp) CONFIG ──────────────────────────────────────────────────
// გაიარე რეგისტრაცია: https://twilio.com (უფასოა)
// მიიღე: Account SID, Auth Token, WhatsApp Sandbox Number
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendWhatsApp(message) {
  if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID === "შეავსე") {
    console.log("📱 WhatsApp (mock):", message);
    return;
  }
  try {
    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${process.env.ADMIN_WHATSAPP}`,
      body: message,
    });
    console.log("✅ WhatsApp გაიგზავნა");
  } catch (err) {
    console.error("❌ WhatsApp შეცდომა:", err.message);
  }
}

// ── CHAT STATE (მეხსიერება) ───────────────────────────────────────────────────
const chats = {}; // { sessionId: { messages: [], name: "" } }
const adminSockets = new Set();
const userSockets = {}; // { sessionId: socketId }

module.exports = function setupChat(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    const { role, sessionId } = socket.handshake.query;

    // ── ADMIN ──
    if (role === "admin") {
      adminSockets.add(socket.id);
      console.log("👨‍💼 ადმინი დაუკავშირდა");

      // გაუგზავნე ყველა არსებული ჩატი
      socket.emit("all_chats", chats);

      // ადმინის პასუხი მომხმარებელს
      socket.on("admin_message", ({ sessionId, text, time }) => {
        if (!chats[sessionId]) return;

        const msg = { text, from: "admin", time: time || new Date().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" }) };
        chats[sessionId].messages.push(msg);

        // გაუგზავნე მომხმარებელს
        const userSocketId = userSockets[sessionId];
        if (userSocketId) {
          io.to(userSocketId).emit("message", msg);
        }
      });

      socket.on("disconnect", () => {
        adminSockets.delete(socket.id);
      });
    }

    // ── USER ──
    if (role === "user" && sessionId) {
      userSockets[sessionId] = socket.id;

      if (!chats[sessionId]) {
        chats[sessionId] = { messages: [], name: sessionId, unread: 0, lastMsg: "", lastTime: "" };
      }

      // მომხმარებლის შეტყობინება
      socket.on("user_message", async ({ text }) => {
        const time = new Date().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" });
        const msg = { text, from: "user", time };

        chats[sessionId].messages.push(msg);
        chats[sessionId].lastMsg = text;
        chats[sessionId].lastTime = time;
        chats[sessionId].unread = (chats[sessionId].unread || 0) + 1;

        // ყველა ადმინს გაუგზავნე
        adminSockets.forEach(adminId => {
          io.to(adminId).emit("new_user_message", {
            sessionId,
            text,
            time,
            name: chats[sessionId].name,
          });
        });

        // WhatsApp შეტყობინება
        const isFirstMessage = chats[sessionId].messages.filter(m => m.from === "user").length === 1;
        if (isFirstMessage) {
          await sendWhatsApp(
            `🏡 *ციხისძირი კოტეჯები — ახალი ჩატი*\n\n` +
            `👤 Session: ${sessionId}\n` +
            `💬 შეტყობინება: ${text}\n` +
            `🕐 დრო: ${time}\n\n` +
            `პასუხი: http://localhost:3000/admin`
          );
        }

        console.log(`💬 [${sessionId}]: ${text}`);
      });

      socket.on("disconnect", () => {
        delete userSockets[sessionId];
      });
    }
  });

  console.log("✅ Chat server მზადაა");
};
