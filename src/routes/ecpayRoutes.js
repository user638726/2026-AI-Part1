const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { verifyCheckMacValue, getMerchantTradeNo } = require('../utils/ecpay');

// ReturnURL — Server-to-Server callback from ECPay
// Won't be called in local development (non-standard port); implemented for production use.
router.post('/notify', (req, res) => {
  const params = req.body;

  if (!verifyCheckMacValue(params)) {
    console.error('[ECPay] ReturnURL CheckMacValue 驗證失敗');
    return res.type('text').send('1|OK');
  }

  // AIO RtnCode is a string '1', not integer
  if (params.RtnCode === '1') {
    const merchantTradeNo = params.MerchantTradeNo || '';
    // Reconstruct order_no from merchantTradeNo (e.g. "ORD20260418A3F2C" → "ORD-20260418-A3F2C")
    const orderNo = `${merchantTradeNo.slice(0, 3)}-${merchantTradeNo.slice(3, 11)}-${merchantTradeNo.slice(11)}`;
    const order = db.prepare('SELECT id, status FROM orders WHERE order_no = ?').get(orderNo);
    if (order && order.status === 'pending') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);
      console.log('[ECPay] ReturnURL 付款成功，訂單已更新:', orderNo);
    }
  }

  res.type('text').send('1|OK');
});

module.exports = router;
