const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Esto permite que el navegador encuentre tu CSS y tus scripts
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR AVANCE ACTIVO EN PUERTO ${PORT}`);
});