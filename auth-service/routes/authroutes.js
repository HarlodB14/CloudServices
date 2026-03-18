const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');
const adminController = require('../controllers/adminController');
const { verifyServiceToken, requireRole } = require('../middleware/serviceAuth');
const { verifyTokenFromHeader } = require('@photo-prestige/auth-utils');

// Public routes - no auth required
router.post('/register', authcontroller.register);
router.post('/login', authcontroller.login);

// Authenticated user routes
router.post('/change-password', verifyTokenFromHeader(), authcontroller.changePassword);

// Admin routes - require admin role
router.post('/admin/assign-role', verifyServiceToken, requireRole(['admin']), adminController.assignRole);
router.post('/admin/assign-permissions', verifyServiceToken, requireRole(['admin']), adminController.assignPermissions);
router.get('/user/:userId', verifyServiceToken, adminController.getUserInfo);

module.exports = router;