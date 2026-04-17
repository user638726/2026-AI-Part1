const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { buildPaymentParams, queryTradeInfo, PAYMENT_URL } = require('../utils/ecpay');

// Helper to render with front layout
function renderFront(res, page, locals = {}) {
  res.render('pages/' + page, { layout: 'front', ...locals }, function (err, body) {
    if (err) return res.status(500).send(err.message);
    res.render('layouts/front', { body, ...locals });
  });
}

// Helper to render with admin layout
function renderAdmin(res, page, locals = {}) {
  res.render('pages/admin/' + page, locals, function (err, body) {
    if (err) return res.status(500).send(err.message);
    res.render('layouts/admin', { body, ...locals });
  });
}

// Front pages
router.get('/', function (req, res) {
  renderFront(res, 'index', { title: '首頁', pageScript: 'index' });
});

router.get('/products/:id', function (req, res) {
  renderFront(res, 'product-detail', {
    title: '商品詳情',
    pageScript: 'product-detail',
    productId: req.params.id
  });
});

router.get('/cart', function (req, res) {
  renderFront(res, 'cart', { title: '購物車', pageScript: 'cart' });
});

router.get('/checkout', function (req, res) {
  renderFront(res, 'checkout', { title: '結帳', pageScript: 'checkout' });
});

router.get('/login', function (req, res) {
  renderFront(res, 'login', { title: '登入', pageScript: 'login' });
});

router.get('/orders', function (req, res) {
  renderFront(res, 'orders', { title: '我的訂單', pageScript: 'orders' });
});

router.get('/orders/:id', function (req, res) {
  renderFront(res, 'order-detail', {
    title: '訂單詳情',
    pageScript: 'order-detail',
    orderId: req.params.id,
    paymentResult: req.query.payment || ''
  });
});

// ECPay payment form page — generates CheckMacValue server-side and auto-submits to ECPay
router.get('/orders/:id/pay', function (req, res) {
  const order = db.prepare(`
    SELECT o.id, o.order_no, o.total_amount, o.status,
           json_group_array(json_object(
             'product_name', oi.product_name,
             'quantity', oi.quantity
           )) AS items_json
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.id = ?
    GROUP BY o.id
  `).get(req.params.id);

  if (!order || order.status !== 'pending') {
    return res.redirect('/orders/' + req.params.id);
  }

  order.items = JSON.parse(order.items_json);
  const port    = process.env.PORT || 3001;
  const baseUrl = `${req.protocol}://localhost:${port}`;
  const paymentParams = buildPaymentParams(order, baseUrl);

  renderFront(res, 'ecpay-payment', {
    title:         '前往付款',
    pageScript:    '',
    paymentParams,
    paymentUrl:    PAYMENT_URL,
  });
});

// ECPay OrderResultURL — client-side redirect after payment; verify via QueryTradeInfo
router.post('/ecpay/result', async function (req, res) {
  const { MerchantTradeNo, CustomField1: orderId } = req.body;

  if (!orderId) {
    return res.redirect('/orders');
  }

  try {
    const info      = await queryTradeInfo(MerchantTradeNo);
    const newStatus = info.TradeStatus === '1' ? 'paid' : 'failed';
    db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?')
      .run(newStatus, orderId, 'pending');
    const result = newStatus === 'paid' ? 'success' : 'failed';
    res.redirect('/orders/' + orderId + '?payment=' + result);
  } catch (err) {
    console.error('[ECPay result] QueryTradeInfo 錯誤:', err.message);
    res.redirect('/orders/' + orderId + '?payment=failed');
  }
});

// Admin pages
router.get('/admin/products', function (req, res) {
  renderAdmin(res, 'products', {
    title: '商品管理',
    pageScript: 'admin-products',
    currentPath: '/admin/products'
  });
});

router.get('/admin/orders', function (req, res) {
  renderAdmin(res, 'orders', {
    title: '訂單管理',
    pageScript: 'admin-orders',
    currentPath: '/admin/orders'
  });
});

module.exports = router;
