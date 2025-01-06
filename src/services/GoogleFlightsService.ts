import puppeteer, { Page, ElementHandle } from 'puppeteer';

export interface StopDetails {
    airport: string;
    airportName: string;
    duration: string;
}

export interface FlightDetails {
    price: number;
    origin: string;
    destination: string;
    date: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    airline: string;
    stops: string;
    stopDetails?: StopDetails[];
    emissions: string;
}

export class GoogleFlightsService {
    private static async waitForClickable(page: Page, selector: string, timeout = 5000): Promise<ElementHandle | null> {
        const element = await page.waitForSelector(selector, { visible: true, timeout });
        if (!element) return null;

        // Wait for element to be clickable
        await page.evaluate((el) => {
            return new Promise<void>((resolve) => {
                const checkClickable = () => {
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.top >= 0 && rect.left >= 0 &&
                        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        rect.right <= (window.innerWidth || document.documentElement.clientWidth);
                    
                    if (isVisible) {
                        resolve();
                    } else {
                        requestAnimationFrame(checkClickable);
                    }
                };
                checkClickable();
            });
        }, element);

        return element;
    }

    private static validateGoogleFlightsUrl(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname === 'www.google.com' && 
                   parsedUrl.pathname.includes('/travel/flights') &&
                   parsedUrl.searchParams.has('tfs');
        } catch {
            return false;
        }
    }

    static cleanUrl(url: string): string {
        
        // Find the 'tfs=' parameter and ensure it has exactly 12 underscores
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (tfsMatch) {
            const tfsValue = tfsMatch[1];
            const cleanTfsValue = tfsValue.replace(/_+/g, '_'.repeat(12));
            url = url.replace(tfsMatch[1], cleanTfsValue);
        }
        
        return url;
    }

    static async getFlightPricesFromUrl(url: string, retries = 3): Promise<FlightDetails[]> {
        url = this.cleanUrl(url);
        
        if (!this.validateGoogleFlightsUrl(url)) {
            throw new Error('Invalid Google Flights URL');
        }

        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            const browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--lang=pt-BR'
                ]
            });

            try {
                console.log(`Attempt ${attempt} of ${retries} to fetch flight prices`);
                const page = await browser.newPage();
                
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'pt-BR,pt;q=0.9'
                });

                await page.setGeolocation({
                    latitude: -23.5505,
                    longitude: -46.6333
                });

                if (!url.includes('curr=BRL')) {
                    url += (url.includes('?') ? '&' : '?') + 'curr=BRL';
                }

                await page.goto(url, { waitUntil: 'networkidle0' });

                const mainContent = await page.waitForSelector('.OgQvJf.nKlB3b', { timeout: 10000 });
                
                if (!mainContent) {
                    throw new Error(`No flight results found for ${url}`);
                }

                // Extract information from the first 4 flights
                const flights = await page.evaluate(() => {
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
                            price: parseInt(row.querySelector('.YMlIz.FpEdX.jLMuyc span')?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0'),
                            emissions: row.querySelector('.AdWm1c.lc3qH')?.textContent?.trim() || 'N/A'
                        };
                    });
                });

                if (!flights) {
                    throw new Error(`Failed to extract flight information for ${url}`);
                }

                const commonInfo = await page.evaluate(() => {
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

                await browser.close();
                return flights.map(flight => ({
                    ...flight,
                    ...commonInfo
                }));

            } catch (error: any) {
                lastError = error;
                await browser.close();
                
                if (attempt < retries) {
                    console.log(`Attempt ${attempt} failed. Retrying...`);
                }
                continue;
            }
        }

        throw new Error(`Failed to fetch flight prices after ${retries} attempts. Last error: ${lastError?.message}
            url: ${url}`);
    }

    static async testRun(): Promise<void> {
        try {
            console.log("Testing Google Flights Search...");
            // Update test URL to include Brazilian parameters
            const testUrl = "https://www.google.com/travel/flights/search?tfs=CBwQAhotEgoyMDI1LTA0LTI1agwIAxIIL20vMDZnbXJyEQgDEg0vZy8xMWJjNnhscHBkQAFIAXABggELCP___________wGYAQI&tfu=EgoIABAAGAAgASgE&curr=BRL&hl=pt-BR";
            const results = await this.getFlightPricesFromUrl(testUrl);
            
            console.log("\nFlight Information:");
            results.forEach((flight, index) => {
                console.log(`\n=== Flight ${index + 1} ===`);
                console.log("Origin:", flight.origin);
                console.log("Destination:", flight.destination);
                console.log("Date:", flight.date);
                console.log("Departure Time:", flight.departureTime);
                console.log("Arrival Time:", flight.arrivalTime);
                console.log("Duration:", flight.duration);
                console.log("Airline:", flight.airline);
                console.log("Stops:", flight.stops);
                console.log("Price:", flight.price);
                console.log("Emissions:", flight.emissions);
            });
        } catch (error) {
            console.error("Test run failed:", error);
        }
    }
} 