const express = require("express");
const translateController = require("../controllers/Translations");
const checkoutController = require('../controllers/Checkout');
const authController = require('../controllers/Auth');

let router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: false }));

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/user/:id', authController.getUser);
router.delete('/user/:id', authController.deActiveUser);

router.post('/upload', translateController.uploadFile);
router.get('/saved_data', translateController.getSavedData);
router.post('/translate', translateController.translate);

router.get('/current_subscription/:userId', checkoutController.getCurrentSubscription);
router.get('/subscriptions/:userId', checkoutController.getSubscriptions);
router.post('/create_product', checkoutController.createProduct);
router.post('/create_checkout_session', checkoutController.createCheckoutSession);

module.exports = router;