require('dotenv').config();
const app = require('./app');
const port = Number(process.env.PORT || 8000);
app.listen(port, () => console.log(`E-Commerce API on http://localhost:${port}`));