const express = require('express');
const axios = require('axios');
const moment = require('moment');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// M-PESA credentials
const { CONSUMER_KEY, CONSUMER_SECRET, PASSKEY, SHORTCODE, TILL_NUMBER } = process.env;

// Google Sheet Web App endpoint
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbyN_1aBt73JjSlUXmBg2yrOQp0pkmZC9r6ITpzKI9fyATWaOxdAl3EwO_RvYHwd3BbO/exec";

// Get access token from Safaricom
async function getMpesaAccessToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
}

// STK Push function
async function sendSTKPush(phone, amount) {
  const accessToken = await getMpesaAccessToken();

  const timestamp = moment().format('YYYYMMDDHHmmss');
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: "https://your-callback-url.com/payment",
    AccountReference: "WIFI_ACCESS",
    TransactionDesc: "WiFi Login"
  };

  const response = await axios.post(
    'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    payload,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return response.data;
}

// Check if user has access in Google Sheet
async function checkAccess(phone) {
  const res = await axios.get(`${GOOGLE_SHEET_URL}?action=check&phone=${phone}`);
  return res.data; // { access: true/false, expires: timestamp }
}

// Store new user access in Google Sheet
async function saveAccess(phone, amount) {
  const duration = amount === 100 ? 7 : 1; // days
  const expires = moment().add(duration, 'days').format('YYYY-MM-DD HH:mm:ss');
  const payload = {
    action: 'save',
    phone,
    expires,
    amount
  };
  await axios.post(GOOGLE_SHEET_URL, payload);
}

// Entry point for login
app.post('/login', async (req, res) => {
  const { phone, amount } = req.body;

  if (![20, 100].includes(amount)) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  try {
    const existing = await checkAccess(phone);
    if (existing.access && moment().isBefore(moment(existing.expires))) {
      return res.json({ access: true, message: 'Already paid and access still valid.' });
    }

    const stkResponse = await sendSTKPush(phone, amount);

    if (stkResponse.ResponseCode === "0") {
      await saveAccess(phone, amount); // You may delay this until callback
      res.json({ access: true, message: 'STK Push sent. Complete on your phone.' });
    } else {
      res.status(500).json({ access: false, message: 'Failed to send STK push.' });
    }
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ access: false, message: 'Something went wrong' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
