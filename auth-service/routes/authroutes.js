const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');
const adminController = require('../controllers/adminController');
const { verifyServiceToken, requireRole } = require('../middleware/serviceAuth');

// Public routes - no auth required
router.post('/register', authcontroller.register);
router.post('/login', authcontroller.login);

// Admin routes - require admin role
router.use(verifyServiceToken);
router.post('/admin/assign-role', requireRole(['admin']), adminController.assignRole);
router.post('/admin/assign-permissions', requireRole(['admin']), adminController.assignPermissions);
router.get('/user/:userId', adminController.getUserInfo);

module.exports = router;