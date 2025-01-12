import { AppDataSource } from "./config/database";
import { TelegramService } from "./services/TelegramService";
import { MemoryMonitorService } from "./services/MemoryMonitorService";
import * as schedule from "node-schedule";
import * as dotenv from "dotenv";
import * as http from 'http';
import { BackupService } from './services/BackupService';
import { Trip } from "./entities/Trip";

dotenv.config();

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || "30");

async function connectWithRetry(retries = 5, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            await AppDataSource.initialize();
            console.log("Database connection initialized");
            return true;
        } catch (error: any) {
            console.error(`Database connection attempt ${i + 1} failed:`, error.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
}

async function main() {
    try {
        // Create a basic HTTP server for health checks first
        const server = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200);
                res.end('OK');
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        
        const PORT = process.env.PORT || 3000;
        server.listen(PORT);
        console.log(`Health check server listening on port ${PORT}`);

        // Try to connect to database with retries
        const connected = await connectWithRetry();
        if (!connected) {
            throw new Error("Failed to connect to database after multiple retries");
        }

        const activeTrips = await AppDataSource.manager.count(Trip, {
            where: { isActive: true }
        });
        console.log(`Currently monitoring ${activeTrips} active trips`);

        // Initialize Telegram bot service
        const telegramService = new TelegramService();
        console.log("Telegram bot service initialized");

        // Run initial price check
        await telegramService.checkPriceUpdates();
        console.log("Initial price check completed");

        // Schedule price checks
        const job = schedule.scheduleJob(`*/${CHECK_INTERVAL} * * * *`, async () => {
            await telegramService.checkPriceUpdates();
        });

        const nextRun = job.nextInvocation();
        console.log(`Price checks scheduled to run every ${CHECK_INTERVAL} minutes`);
        console.log(`Next check scheduled for: ${nextRun.toLocaleString()}`);

        // Initialize backup service
        BackupService.initialize();

        // Initialize memory monitor service
        const memoryMonitorService = new MemoryMonitorService();
        memoryMonitorService.startMonitoring();
        console.log("Memory monitoring service initialized");
    } catch (error: any) {
        console.error("Error starting the application:", error.message);
        if (error.message !== "Failed to connect to database after multiple retries") {
            process.exit(1);
        }
    }
}

process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit(0);
});

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
