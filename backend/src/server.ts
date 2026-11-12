import app from "./app.js";
import prisma from "./config/prisma.js";
import { env } from "./config/env.js";

async function startServer() {
    try {
        await prisma.$connect();
        console.log("DB connected");

        app.listen(env.PORT,()=>{
            console.log(`API Lens server running on port ${env.PORT}`);
        });
    } catch(error) {
        console.error("DB connection failed: ",error);
        process.exit(1);
    }
}

startServer();
