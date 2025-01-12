import { exec } from 'child_process';

export class MemoryMonitorService {
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {}

  async getMemoryUsage() {
    return new Promise((resolve, reject) => {
      exec(
        `ps aux --sort=-%mem | head -n 10`,
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(`Failed to get memory usage: ${error.message} ${stderr}`)
            );
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  startMonitoring(interval: number = 15 * 60 * 1000) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(async () => {
      try {
        const memoryUsage = await this.getMemoryUsage();
        console.log('Memory Usage:\n', memoryUsage);
      } catch (error) {
        console.error('Error getting memory usage:', error);
      }
    }, interval);
    console.log('Memory monitoring started');
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Memory monitoring stopped');
    }
  }
}
