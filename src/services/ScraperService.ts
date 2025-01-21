import puppeteer, { Browser, Page } from 'puppeteer';
import { StopDetails, FlightDetails } from './GoogleFlightsService';

export class ScraperService {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--lang=pt-BR'
            ],
            ignoreDefaultArgs: ['--disable-extensions'],
            timeout: 30000
        });
        this.page = await this.browser.newPage();
        
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9'
        });

        await this.page.setGeolocation({
            latitude: -23.5505,
            longitude: -46.6333
        });
    }

    async scrapeFlightPrices(url: string): Promise<FlightDetails[]> {
        if (!this.page || !this.browser) {
            throw new Error('Scraper not initialized');
        }

        try {
            if (!url.includes('curr=BRL')) {
                url += (url.includes('?') ? '&' : '?') + 'curr=BRL';
            }

            await this.page.goto(url, { waitUntil: 'networkidle0' });

            const mainContent = await this.page.waitForSelector('.OgQvJf.nKlB3b', { timeout: 10000 });
            
            if (!mainContent) {
                throw new Error(`No flight results found for ${url}`);
            }

            const flights = await this.page.evaluate(() => {
                const flightRows = Array.from(document.querySelectorAll('.OgQvJf.nKlB3b')).slice(0, 4);
                
                if (flightRows.length === 0) {
                    return null;
                }

                return flightRows.map(row => {
                    const stopDetails: StopDetails[] = [];
                    const stopInfo = row.querySelector('.sSHqwe.tPgKwe.ogfYpf[aria-label*="Parada"]');
                    
                    if (stopInfo) {
                        const stopMatch = stopInfo.getAttribute('aria-label')?.match(/Parada \(1 de 1\) de (.*?) no aeroporto (.*?), em/);
                        if (stopMatch) {
                            stopDetails.push({
                                airport: row.querySelector('.sSHqwe.tPgKwe.ogfYpf span[aria-label]')?.textContent?.trim() || 'N/A',
                                airportName: stopMatch[2] || 'N/A',
                                duration: stopMatch[1] || 'N/A'
                            });
                        }
                    }

                    return {
                        departureTime: row.querySelector('.mv1WYe span[aria-label*="Horário de partida"]')?.getAttribute('aria-label')?.match(/\d{2}:\d{2}/)?.[0] || 'N/A',
                        arrivalTime: row.querySelector('.mv1WYe span[aria-label*="Horário de chegada"]')?.getAttribute('aria-label')?.match(/\d{2}:\d{2}/)?.[0] || 'N/A',
                        duration: row.querySelector('.gvkrdb')?.textContent?.trim() || 'N/A',
                        airline: row.querySelector('.sSHqwe.tPgKwe span')?.textContent?.trim() || 'N/A',
                        stops: row.querySelector('.EfT7Ae span')?.textContent?.trim() || 'N/A',
                        stopDetails,
                        price: parseInt(row.querySelector('.YMlIz.FpEdX span')?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0'),
                        emissions: row.querySelector('.AdWm1c.lc3qH')?.textContent?.trim() || 'N/A'
                    };
                });
            });

            if (!flights) {
                throw new Error(`Failed to extract flight information for ${url}`);
            }

            const commonInfo = await this.page.evaluate(() => {
                const originInput = document.querySelector('input[aria-label="De onde?"]') as HTMLInputElement;
                const destinationInput = document.querySelector('input[aria-label="Para onde?"]') as HTMLInputElement;
                const dateInput = document.querySelector('input.TP4Lpb.eoY5cb.j0Ppje[aria-label="Partida"]') as HTMLInputElement;

                if (!originInput || !destinationInput || !dateInput) {
                    return null;
                }

                return {
                    origin: originInput.value || 'N/A',
                    destination: destinationInput.value || 'N/A',
                    date: dateInput.value || 'N/A'
                };
            });

            if (!commonInfo) {
                throw new Error(`Failed to extract flight details for ${url}`);
            }

            return flights.map(flight => ({
                ...flight,
                origin: commonInfo.origin,
                destination: commonInfo.destination,
                date: commonInfo.date
            } as FlightDetails));

        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        if (this.page && !this.page.isClosed()) {
            await this.page.close();
        }
        if (this.browser && this.browser.isConnected()) {
            await this.browser.close();
        }
    }
}
