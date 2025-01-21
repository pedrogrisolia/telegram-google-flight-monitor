import { PriceHistory } from '../entities/PriceHistory';
import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';

export class ChartService {
  private static readonly CHART_WIDTH = 800;
  private static readonly CHART_HEIGHT = 400;

  static async generatePriceHistoryChart(priceHistory: PriceHistory[]): Promise<Buffer> {
    const canvas = createCanvas(this.CHART_WIDTH, this.CHART_HEIGHT);
    const labels = priceHistory.map(ph => 
      new Date(ph.timestamp).toLocaleDateString()
    );
    const data = priceHistory.map(ph => ph.price);

    new Chart(canvas as unknown as HTMLCanvasElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Price History',
          data,
          borderColor: '#3e95cd',
          fill: false
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            title: {
              display: true,
              text: 'Price'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        }
      }
    });

    return canvas.toBuffer('image/png');
  }
}
