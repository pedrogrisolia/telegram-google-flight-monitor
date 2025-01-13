import puppeteer from 'puppeteer';

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
    successfulUrl?: string;
}

export class GoogleFlightsService {

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

    static cleanUrl(url: string, underscoreCount: number = 11): string {
        // Find the 'tfs=' parameter and ensure it has exactly the specified number of underscores
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (tfsMatch) {
            const tfsValue = tfsMatch[1];
            const cleanTfsValue = tfsValue.replace(/_+/g, '_'.repeat(underscoreCount));
            url = url.replace(tfsMatch[1], cleanTfsValue);
        }
        
        return url;
    }

    private static countUnderscores(url: string): number {
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (!tfsMatch) return 0;
        return (tfsMatch[1].match(/_/g) || []).length;
    }

    static changeDateInUrl(url: string, oldDate: string, newDate: string): string {
        // Extract the tfs parameter
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (!tfsMatch) return url;

        const tfsValue = tfsMatch[1];
        
        // Try to decode the base64
        try {
            const decoded = Buffer.from(tfsValue, 'base64').toString('binary');
            
            // Find the date in the decoded string
            const datePattern = new RegExp(oldDate.replace(/-/g, '[-]?'));
            const dateMatch = decoded.match(datePattern);
            
            if (dateMatch) {
                // Replace the date
                const newDecoded = decoded.replace(dateMatch[0], newDate);
                // Encode back to base64, remove padding and restore underscores
                const newTfsValue = Buffer.from(newDecoded, 'binary')
                    .toString('base64')
                    .replace(/=+$/, '')  // Remove padding
                    .replace(/\//g, '_'); // Replace forward slashes with underscores
                // Replace in URL
                return url.replace(tfsValue, newTfsValue);
            }
        } catch (e) {
            console.error('Error changing date in URL:', e);
        }
        
        return url;
    }

    static async getFlightPricesFromUrl(url: string): Promise<FlightDetails[]> {
        const underscoreCount = this.countUnderscores(url);
        console.log(`URL has ${underscoreCount} underscores`);

        // Case 1: Less than 11 underscores
        if (underscoreCount < 11) {
            try {
                const urlWith11 = this.cleanUrl(url, 11);
                if (!this.validateGoogleFlightsUrl(urlWith11)) {
                    throw new Error('Invalid Google Flights URL');
                }
                const results = await this.scrapeFlightPrices(urlWith11);
                return results.map(result => ({
                    ...result,
                    successfulUrl: urlWith11
                }));
            } catch (error11) {
                console.log("Failed with 11 underscores, trying with 12...");
                console.error(error11);
                try {
                    const urlWith12 = this.cleanUrl(url, 12);
                    if (!this.validateGoogleFlightsUrl(urlWith12)) {
                        throw new Error('Invalid Google Flights URL');
                    }
                    const results = await this.scrapeFlightPrices(urlWith12);
                    return results.map(result => ({
                        ...result,
                        successfulUrl: urlWith12
                    }));
                } catch (error12) {
                    throw error12;
                }
            }
        }
        
        // Case 2: Exactly 11 underscores
        if (underscoreCount === 11) {
            try {
                if (!this.validateGoogleFlightsUrl(url)) {
                    throw new Error('Invalid Google Flights URL');
                }
                const results = await this.scrapeFlightPrices(url);
                return results.map(result => ({
                    ...result,
                    successfulUrl: url
                }));
            } catch (error11) {
                console.log("Failed with original 11 underscores, trying with 12...");
                try {
                    const urlWith12 = this.cleanUrl(url, 12);
                    if (!this.validateGoogleFlightsUrl(urlWith12)) {
                        throw new Error('Invalid Google Flights URL');
                    }
                    const results = await this.scrapeFlightPrices(urlWith12);
                    return results.map(result => ({
                        ...result,
                        successfulUrl: urlWith12
                    }));
                } catch (error12) {
                    throw error11;
                }
            }
        }

        // Case 3: 12 or more underscores
        try {
            if (!this.validateGoogleFlightsUrl(url)) {
                throw new Error('Invalid Google Flights URL');
            }
            const results = await this.scrapeFlightPrices(url);
            return results.map(result => ({
                ...result,
                successfulUrl: url
            }));
        } catch (error12) {
            console.log("Failed with original 12 underscores, trying with 11...");
            try {
                const urlWith11 = this.cleanUrl(url, 11);
                if (!this.validateGoogleFlightsUrl(urlWith11)) {
                    throw new Error('Invalid Google Flights URL');
                }
                const results = await this.scrapeFlightPrices(urlWith11);
                return results.map(result => ({
                    ...result,
                    successfulUrl: urlWith11
                }));
            } catch (error11) {
                throw error12;
            }
        }
    }

    private static async scrapeFlightPrices(url: string): Promise<FlightDetails[]> {
        let lastError: Error | null = null;
        
        const browser = await puppeteer.launch({
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
        const page = await browser.newPage();
        try {
            
            
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
                        price: parseInt(row.querySelector('.YMlIz.FpEdX span')?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0'),
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
            await page.close();
            await browser.close();
            return flights.map(flight => ({
                ...flight,
                ...commonInfo
            }));

        } catch (error: any) {
            lastError = error;
            await page.close();
            await browser.close();
            
        } finally {
            await page.close();
            await browser.close();
        }

        throw new Error(`Failed to fetch flight prices. Last error: ${lastError?.message}
            url: ${url}`);
    }

}