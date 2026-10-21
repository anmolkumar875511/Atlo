import express from 'express';

const app = express();

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running: http://localhost:${PORT}`);
    });
});