import app from "./app.js";
import prisma from "./config/prisma.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await prisma.$connect();
        console.log("DB connected");

        app.listen(PORT,()=>{
            console.log(`API Lens server running on port ${PORT}`);
        });
    } catch(error) {
        console.error("DB connection failed: ",error);
        process.exit(1);
    }
}

startServer();