const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');

// register user
router.post('/register', authcontroller.register);

// login user en JWT genereren
router.post('/login', authcontroller.login);

module.exports = router;