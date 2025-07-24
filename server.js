const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // where index.html lives

const PORT = process.env.PORT || 3000;

// ENV VARIABLES
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;
const shortcode = process.env.SHORTCODE; // Paybill
const tillNumber = process.env.TILL_NUMBER;
const passkey = process.env.PASSKEY;
const callbackURL = process.env.CALLBACK_URL;

const sheetScriptURL = "https://script.google.com/macros/s/AKfycbyN_1aBt73JjSlUXmBg2yrOQp0pkmZC9r6ITpzKI9fyATWaOxdAl3EwO_RvYHwd3BbO/exec";

const getAccessToken = async () => {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const res = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
};

const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
};

app.post('/pay', async (req, res) => {
  const { phone, amount } = req.body;
  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const token = await getAccessToken();

  try {
    const stkRes = await axios.post(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerBuyGoodsOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: tillNumber,
        PhoneNumber: phone,
        CallBackURL: callbackURL,
        AccountReference: 'WiFi Access',
        TransactionDesc: `${amount} payment for WiFi`
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    // Log to Google Sheets via Apps Script
    await axios.post(sheetScriptURL, {
      phone,
      amount,
      timestamp,
      access: amount == "20" ? "5 Hours" : "1 Week"
    });

    res.json({ success: true, message: 'STK push sent. Complete payment on your phone.' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Payment failed. Try again.' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
