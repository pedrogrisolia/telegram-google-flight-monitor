import { Chart } from 'chart.js/auto';
import { format } from 'date-fns';
import { createCanvas } from 'canvas';
import { PriceHistory } from '../entities/PriceHistory';

export class ChartService {
    static async generatePriceHistoryChart(priceHistory: PriceHistory[]): Promise<Buffer> {
        // Sort price history by timestamp
        const sortedHistory = [...priceHistory].sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
        );

        // Create canvas
        const canvas = createCanvas(800, 400);
        

        // Create chart
        new Chart(canvas as unknown as HTMLCanvasElement, {
            type: 'line',
            data: {
                labels: sortedHistory.map(h => 
                    format(h.timestamp, 'dd/MM HH:mm')
                ),
                datasets: [{
                    label: 'Price (R$)',
                    data: sortedHistory.map(h => h.price),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(200, 200, 200, 0.2)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Price History',
                        color: 'rgb(100, 100, 100)'
                    }
                }
            }
        });

        // Convert canvas to buffer
        return canvas.toBuffer('image/png');
    }
}
