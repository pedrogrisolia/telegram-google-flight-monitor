import * as fs from 'fs';
import * as path from 'path';
import schedule from 'node-schedule';

export class BackupService {
    private static readonly BACKUP_DIR = process.env.BACKUP_PATH || path.join(__dirname, '../../data/backups');
    private static readonly DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/flights.db');

    static initialize() {
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(this.BACKUP_DIR)) {
            fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
        }

        // Schedule daily backup at midnight
        schedule.scheduleJob('0 0 * * *', () => {
            this.createBackup();
        });
    }

    static async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.BACKUP_DIR, `flights-${timestamp}.db`);
            
            // Copy the database file
            fs.copyFileSync(this.DB_PATH, backupPath);
            
            // Keep only last 7 backups
            const files = fs.readdirSync(this.BACKUP_DIR);
            if (files.length > 7) {
                files
                    .map(file => path.join(this.BACKUP_DIR, file))
                    .sort((a, b) => fs.statSync(a).mtime.getTime() - fs.statSync(b).mtime.getTime())
                    .slice(0, files.length - 7)
                    .forEach(file => fs.unlinkSync(file));
            }

            console.log(`Backup created: ${backupPath}`);
        } catch (error) {
            console.error('Backup failed:', error);
        }
    }
} 