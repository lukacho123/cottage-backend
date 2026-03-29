// ─── routes/bog.js ───────────────────────────────────────────────────────────
// BOG Pay (Bank of Georgia) ინტეგრაცია
// დოკუმენტაცია: https://developers.bog.ge
//
// .env-ში საჭირო ცვლადები:
//   BOG_CLIENT_ID=...
//   BOG_SECRET_KEY=...
//   BOG_BASE_URL=https://api.bog.ge   (production)
//               https://api.bog.ge/payments/v1  (sandbox - testing)

const router = require("express").Router();
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const BOG_BASE = process.env.BOG_BASE_URL || "https://api.bog.ge/payments/v1";
const CLIENT_ID = process.env.BOG_CLIENT_ID;
const SECRET_KEY = process.env.BOG_SECRET_KEY;

// ── 1. ACCESS TOKEN მიღება ────────────────────────────────────────────────────
async function getBogToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${SECRET_KEY}`).toString("base64");

  const response = await axios.post(
    `${BOG_BASE}/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

// ── 2. გადახდის შექმნა ────────────────────────────────────────────────────────
// POST /api/bog/create
// body: { orderId, amount, description, redirectUrl }
router.post("/create", async (req, res) => {
  try {
    const { orderId, amount, description, redirectUrl } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: "orderId და amount სავალდებულოა" });
    }

    const token = await getBogToken();

    const response = await axios.post(
      `${BOG_BASE}/payment`,
      {
        callback_url: `${process.env.BACKEND_URL}/api/bog/callback`,
        purchase_units: {
          currency: "GEL",
          total_amount: amount,
          basket: [
            {
              quantity: 1,
              unit_price: amount,
              product_id: orderId,
              description: description || "კოტეჯის დაჯავშნა",
            },
          ],
        },
        redirect_urls: {
          success: redirectUrl || `${process.env.FRONTEND_URL}/success`,
          fail: redirectUrl || `${process.env.FRONTEND_URL}/fail`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // BOG გვაბრუნებს გადახდის URL-ს
    res.json({
      success: true,
      paymentUrl: response.data._links.redirect.href,
      orderId: response.data.id,
    });
  } catch (err) {
    console.error("BOG Create Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "გადახდის შექმნა ვერ მოხერხდა",
      details: err.response?.data || err.message,
    });
  }
});

// ── 3. CALLBACK (BOG გვიბრუნებს გადახდის სტატუსს) ───────────────────────────
// POST /api/bog/callback
router.post("/callback", async (req, res) => {
  try {
    const { order_id, status } = req.body;

    console.log("BOG Callback:", { order_id, status });

    if (status === "completed") {
      // ✅ გადახდა წარმატებულია
      // აქ შეგიძლია:
      // - Database-ში შეინახო ჯავშანი
      // - Email გაუგზავნო მომხმარებელს
      // - სხვა ლოგიკა
      console.log(`✅ BOG გადახდა დასრულდა: Order #${order_id}`);
    } else if (status === "rejected" || status === "failed") {
      // ❌ გადახდა ვერ მოხერხდა
      console.log(`❌ BOG გადახდა ვერ მოხერხდა: Order #${order_id}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("BOG Callback Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 4. გადახდის სტატუსის შემოწმება ──────────────────────────────────────────
// GET /api/bog/status/:orderId
router.get("/status/:orderId", async (req, res) => {
  try {
    const token = await getBogToken();

    const response = await axios.get(
      `${BOG_BASE}/payment/${req.params.orderId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    res.json({
      orderId: req.params.orderId,
      status: response.data.status,
      amount: response.data.purchase_units?.total_amount,
    });
  } catch (err) {
    console.error("BOG Status Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
