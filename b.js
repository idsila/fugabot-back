require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const crypto = require('crypto');

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;

async function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  urlParams.delete("hash");
  const dataCheckString = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return hmac === hash;
}





//console.log(BOT_TOKEN);
app.post("/login", async (req, res) => {
  const { id, username, initData } = req.body;
  const result = await verifyTelegramInitData(initData);
  console.log(result);
  res.json({ type: 200 });
});

app.listen(3055, (err) => {
  err ? err : console.log("STARTED SERVER");
});
