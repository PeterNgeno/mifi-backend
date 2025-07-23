const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const moment = require('moment');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ENV variables
const {
  SHORTCODE,
  PASSKEY,
  CONSUMER_KEY,
  CONSUMER_SECRET,
  TILL_NUMBER,
  CALLBACK_URL,
  GSCRIPT_WEB_APP_URL, // Your Apps Script Web App URL
} = process.env;

// Base64 password
function generatePassword(timestamp) {
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
}

// Generate timestamp
function getTimestamp() {
  return moment().format('YYYYMMDDHHmmss');
}

// Get Safaricom access token
async function getAccessToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.data.access_token;
}

// STK Push request
async function stkPush(phone, amount) {
  const timestamp = getTimestamp();
  const password = generatePassword(timestamp);
  const token = await getAccessToken();

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuygoodsOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: TILL_NUMBER,
    PhoneNumber: phone,
    CallBackURL: CALLBACK_URL,
    AccountReference: 'WiFiAccess',
    TransactionDesc: 'WiFi Access Payment',
  };

  const res = await axios.post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data;
}

// Record to Google Sheet via Apps Script
async function recordAccessToSheet(phone, amount) {
  const now = moment();
  let duration = 0;

  if (amount == 20) {
    duration = 5; // hours
  } else if (amount == 100) {
    duration = 168; // 7 days = 168 hours
  }

  const expiry = now.add(duration, 'hours').format('YYYY-MM-DD HH:mm:ss');

  await axios.post(GSCRIPT_WEB_APP_URL, {
    phone,
    amount,
    expires_at: expiry,
    timestamp: now.format('YYYY-MM-DD HH:mm:ss'),
  });
}

// POST /pay
app.post('/pay', async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (![20, 100].includes(amount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const response = await stkPush(phone, amount);

    if (response.ResponseCode === '0') {
      await recordAccessToSheet(phone, amount);
      return res.json({ success: true, message: 'STK Push Sent', checkoutRequestID: response.CheckoutRequestID });
    } else {
      return res.status(500).json({ success: false, error: response.ResponseDescription });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
