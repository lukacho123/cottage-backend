// ─── routes/tbc.js ───────────────────────────────────────────────────────────
// TBC Pay ინტეგრაცია
// დოკუმენტაცია: https://developers.tbcbank.ge
//
// .env-ში საჭირო ცვლადები:
//   TBC_CLIENT_ID=...
//   TBC_CLIENT_SECRET=...
//   TBC_BASE_URL=https://api.tbcbank.ge/v1   (production)
//               https://api.tbcbank.ge/v1    (sandbox - testing)

const router = require("express").Router();
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const TBC_BASE = process.env.TBC_BASE_URL || "https://api.tbcbank.ge/v1";
const CLIENT_ID = process.env.TBC_CLIENT_ID;
const CLIENT_SECRET = process.env.TBC_CLIENT_SECRET;

// ── 1. ACCESS TOKEN მიღება ────────────────────────────────────────────────────
async function getTbcToken() {
  const response = await axios.post(
    `${TBC_BASE}/tpay/access-token`,
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  return response.data.access_token;
}

// ── 2. გადახდის შექმნა ────────────────────────────────────────────────────────
// POST /api/tbc/create
// body: { orderId, amount, description }
router.post("/create", async (req, res) => {
  try {
    const { orderId, amount, description } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: "orderId და amount სავალდებულოა" });
    }

    const token = await getTbcToken();

    const response = await axios.post(
      `${TBC_BASE}/tpay/payments`,
      {
        amount: {
          currency: "GEL",
          total: amount,
          subtotal: amount,
          tax: 0,
          shipping: 0,
        },
        returnurl: `${process.env.FRONTEND_URL}/success?order=${orderId}`,
        extra: orderId,
        expirationMinutes: 30,
        methods: [0], // 0 = ბარათით გადახდა
        installmentProducts: [],
        callbackUrl: `${process.env.BACKEND_URL}/api/tbc/callback`,
        preAuth: false,
        language: "KA",
        merchantPaymentId: orderId,
        skipInfoMessage: false,
        saveCard: false,
        saveCardToDate: null,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // TBC გვაბრუნებს გადახდის URL-ს
    res.json({
      success: true,
      paymentUrl: response.data.links?.find(l => l.rel === "approve")?.href,
      payId: response.data.payId,
    });
  } catch (err) {
    console.error("TBC Create Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "გადახდის შექმნა ვერ მოხერხდა",
      details: err.response?.data || err.message,
    });
  }
});

// ── 3. CALLBACK ───────────────────────────────────────────────────────────────
// POST /api/tbc/callback
router.post("/callback", async (req, res) => {
  try {
    const { PaymentId, Status } = req.body;

    console.log("TBC Callback:", { PaymentId, Status });

    if (Status === "Succeeded") {
      // ✅ გადახდა წარმატებულია
      console.log(`✅ TBC გადახდა დასრულდა: ${PaymentId}`);
      // აქ შეგიძლია database-ში შეინახო ან email გაუგზავნო
    } else if (Status === "Failed" || Status === "Expired") {
      // ❌ გადახდა ვერ მოხერხდა
      console.log(`❌ TBC გადახდა ვერ მოხერხდა: ${PaymentId} - ${Status}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("TBC Callback Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 4. გადახდის სტატუსის შემოწმება ──────────────────────────────────────────
// GET /api/tbc/status/:payId
router.get("/status/:payId", async (req, res) => {
  try {
    const token = await getTbcToken();

    const response = await axios.get(
      `${TBC_BASE}/tpay/payments/${req.params.payId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    res.json({
      payId: req.params.payId,
      status: response.data.status,
      amount: response.data.amount?.total,
    });
  } catch (err) {
    console.error("TBC Status Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
