require('dotenv').config();
const express = require('express');

const app = express();

app.use(express.json());

const services = [] = [
    { name: 'Auth Service', url: process.env.AUTH_SERVICE_URL || 3001 },
];

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('API Gateway is running');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});
