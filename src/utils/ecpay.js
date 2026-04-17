// Source: guides/13-checkmacvalue.md Node.js section + guides/01-payment-aio.md
const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '3002607';
const HASH_KEY    = process.env.ECPAY_HASH_KEY    || 'pwFHCqoQZGmho4w6';
const HASH_IV     = process.env.ECPAY_HASH_IV     || 'EkRm7iFT261dpevs';
const IS_STAGE    = process.env.ECPAY_ENV !== 'production';

const PAYMENT_URL = IS_STAGE
  ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
  : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

const QUERY_URL = IS_STAGE
  ? 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
  : 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

// ECPay URL encode: encodeURIComponent → %20→+ → ~→%7e → '→%27 → toLowerCase → .NET replacements
function ecpayUrlEncode(source) {
  return encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g,   '%7e')
    .replace(/'/g,   '%27')
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

function generateCheckMacValue(params) {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = `HashKey=${HASH_KEY}&${sorted.map(([k, v]) => `${k}=${v}`).join('&')}&HashIV=${HASH_IV}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

function verifyCheckMacValue(params) {
  const received = (params.CheckMacValue || '').toUpperCase();
  const computed = generateCheckMacValue(params);
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(received);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Taiwan time (UTC+8) in ECPay format: yyyy/MM/dd HH:mm:ss
function getTaiwanTime() {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '/');
}

// Strip hyphens from order_no for MerchantTradeNo (max 20 chars, alphanumeric)
function getMerchantTradeNo(orderNo) {
  return orderNo.replace(/-/g, '');
}

function buildPaymentParams(order, baseUrl) {
  const merchantTradeNo = getMerchantTradeNo(order.order_no);
  const itemName = order.items
    .map(i => `${i.product_name} x${i.quantity}`)
    .join('#')
    .slice(0, 200);

  const params = {
    MerchantID:        MERCHANT_ID,
    MerchantTradeNo:   merchantTradeNo,
    MerchantTradeDate: getTaiwanTime(),
    PaymentType:       'aio',
    TotalAmount:       String(order.total_amount),
    TradeDesc:         '花卉電商訂單',
    ItemName:          itemName,
    ReturnURL:         `${baseUrl}/api/ecpay/notify`,
    OrderResultURL:    `${baseUrl}/ecpay/result`,
    ClientBackURL:     `${baseUrl}/orders/${order.id}`,
    ChoosePayment:     'Credit',
    EncryptType:       '1',
    CustomField1:      order.id,
  };
  params.CheckMacValue = generateCheckMacValue(params);
  return params;
}

function queryTradeInfo(merchantTradeNo) {
  return new Promise((resolve, reject) => {
    const params = {
      MerchantID:      MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp:       String(Math.floor(Date.now() / 1000)),
      PlatformID:      '',
    };
    params.CheckMacValue = generateCheckMacValue(params);

    const data = qs.stringify(params);
    const target = new URL(QUERY_URL);
    const options = {
      hostname: target.hostname,
      path:     target.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(qs.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = {
  generateCheckMacValue,
  verifyCheckMacValue,
  buildPaymentParams,
  queryTradeInfo,
  getMerchantTradeNo,
  PAYMENT_URL,
};
