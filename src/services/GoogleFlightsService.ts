import { browserManager } from "./BrowserManager";
import fs from "fs";

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
      return (
        parsedUrl.hostname === "www.google.com" &&
        parsedUrl.pathname.includes("/travel/flights") &&
        parsedUrl.searchParams.has("tfs")
      );
    } catch {
      return false;
    }
  }

  static cleanUrl(url: string, underscoreCount: number = 11): string {
    // Find the 'tfs=' parameter and ensure it has exactly the specified number of underscores
    const tfsMatch = url.match(/tfs=([^&]*)/);
    if (tfsMatch) {
      const tfsValue = tfsMatch[1];
      const cleanTfsValue = tfsValue.replace(
        /_+/g,
        "_".repeat(underscoreCount)
      );
      url = url.replace(tfsMatch[1], cleanTfsValue);
    }

    return url;
  }

  private static countUnderscores(url: string): number {
    const tfsMatch = url.match(/tfs=([^&]*)/);
    if (!tfsMatch) return 0;
    return (tfsMatch[1].match(/_/g) || []).length;
  }

  static changeDateInUrl(
    url: string,
    oldDate: string,
    newDate: string
  ): string {
    // Extract the tfs parameter
    const tfsMatch = url.match(/tfs=([^&]*)/);
    if (!tfsMatch) return url;

    const tfsValue = tfsMatch[1];

    // Try to decode the base64
    try {
      const decoded = Buffer.from(tfsValue, "base64").toString("binary");

      // Find the date in the decoded string
      const datePattern = new RegExp(oldDate.replace(/-/g, "[-]?"));
      const dateMatch = decoded.match(datePattern);

      if (dateMatch) {
        // Replace the date
        const newDecoded = decoded.replace(dateMatch[0], newDate);
        // Encode back to base64, remove padding and restore underscores
        const newTfsValue = Buffer.from(newDecoded, "binary")
          .toString("base64")
          .replace(/=+$/, "") // Remove padding
          .replace(/\//g, "_"); // Replace forward slashes with underscores
        // Replace in URL
        return url.replace(tfsValue, newTfsValue);
      }
    } catch (e) {
      console.error("Error changing date in URL:", e);
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
          throw new Error("Invalid Google Flights URL");
        }
        const results = await this.scrapeFlightPrices(urlWith11);
        return results.map((result) => ({
          ...result,
          successfulUrl: urlWith11,
        }));
      } catch (error11) {
        console.log("Failed with 11 underscores, trying with 12...");
        console.error(error11);
        try {
          const urlWith12 = this.cleanUrl(url, 12);
          if (!this.validateGoogleFlightsUrl(urlWith12)) {
            throw new Error("Invalid Google Flights URL");
          }
          const results = await this.scrapeFlightPrices(urlWith12);
          return results.map((result) => ({
            ...result,
            successfulUrl: urlWith12,
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
          throw new Error("Invalid Google Flights URL");
        }
        const results = await this.scrapeFlightPrices(url);
        return results.map((result) => ({
          ...result,
          successfulUrl: url,
        }));
      } catch (error11) {
        console.log("Failed with original 11 underscores, trying with 12...");
        try {
          const urlWith12 = this.cleanUrl(url, 12);
          if (!this.validateGoogleFlightsUrl(urlWith12)) {
            throw new Error("Invalid Google Flights URL");
          }
          const results = await this.scrapeFlightPrices(urlWith12);
          return results.map((result) => ({
            ...result,
            successfulUrl: urlWith12,
          }));
        } catch (error12) {
          throw error11;
        }
      }
    }

    // Case 3: 12 or more underscores
    try {
      if (!this.validateGoogleFlightsUrl(url)) {
        throw new Error("Invalid Google Flights URL");
      }
      const results = await this.scrapeFlightPrices(url);
      return results.map((result) => ({
        ...result,
        successfulUrl: url,
      }));
    } catch (error12) {
      console.log("Failed with original 12 underscores, trying with 11...");
      try {
        const urlWith11 = this.cleanUrl(url, 11);
        if (!this.validateGoogleFlightsUrl(urlWith11)) {
          throw new Error("Invalid Google Flights URL");
        }
        const results = await this.scrapeFlightPrices(urlWith11);
        return results.map((result) => ({
          ...result,
          successfulUrl: urlWith11,
        }));
      } catch (error11) {
        throw error12;
      }
    }
  }

  private static async scrapeFlightPrices(
    url: string
  ): Promise<FlightDetails[]> {
    let lastError: Error | null = null;

    const page = await browserManager.getNewPage();
    try {
      if (!url.includes("curr=BRL")) {
        url += (url.includes("?") ? "&" : "?") + "curr=BRL";
      }

      if (!url.includes("hl=pt-BR")) {
        url += (url.includes("?") ? "&" : "?") + "hl=pt-BR";
      }

      if (!url.includes("gl=BR")) {
        url += (url.includes("?") ? "&" : "?") + "gl=BR";
      }

      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

      const mainContent = await page.waitForXPath(
        '//*[text()="Todos os voos" or text()="Principais voos"]',
        {
          timeout: 10000,
        }
      );

      if (!mainContent) {
        throw new Error(`No flight results found for ${url}`);
      }

      // Refatoração: extração usando XPath robustos
      const flights = await page.evaluate(() => {
        function getTextByXPath(node: Node, xpath: string): string {
          const result = document.evaluate(
            xpath,
            node,
            null,
            XPathResult.STRING_TYPE,
            null
          );
          return result.stringValue.trim();
        }
        // function getNodeByXPath(node: Node, xpath: string): Node | null {
        //   const result = document.evaluate(
        //     xpath,
        //     node,
        //     null,
        //     XPathResult.FIRST_ORDERED_NODE_TYPE,
        //     null
        //   );
        //   return result.singleNodeValue;
        // }
        // function getAllNodesByXPath(node: Node, xpath: string): Node[] {
        //   const nodes: Node[] = [];
        //   const result = document.evaluate(
        //     xpath,
        //     node,
        //     null,
        //     XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        //     null
        //   );
        //   for (let i = 0; i < result.snapshotLength; i++) {
        //     nodes.push(result.snapshotItem(i)!);
        //   }
        //   return nodes;
        // }
        // Seletor base para cada voo
        const flightLis: Element[] = [];
        const xpathResult = document.evaluate(
          "//*[text()='Todos os voos' or text()='Principais voos']/following-sibling::ul[1]/li",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        for (let i = 0; i < xpathResult.snapshotLength && i < 4; i++) {
          const node = xpathResult.snapshotItem(i);
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            flightLis.push(node as Element);
          }
        }
        if (flightLis.length === 0) {
          return null;
        }
        return flightLis.map((li) => {
          // Preço
          let priceText = getTextByXPath(
            li,
            ".//span[contains(@aria-label, 'Reais brasileiros')]"
          );
          let price = 0;
          if (priceText) {
            const priceMatch = priceText.replace(/\D/g, "");
            if (priceMatch) price = parseInt(priceMatch, 10);
          }
          // Horário de partida
          const departureTime = getTextByXPath(
            li,
            ".//span[starts-with(@aria-label, 'Horário de partida')]/span"
          );
          // Horário de chegada
          const arrivalTime = getTextByXPath(
            li,
            ".//span[starts-with(@aria-label, 'Horário de chegada')]/span"
          );
          // Duração
          const duration = getTextByXPath(
            li,
            ".//div[starts-with(@aria-label, 'Duração total')]"
          );
          // Aeroportos
          const originAirport = getTextByXPath(
            li,
            "(.//div[starts-with(@aria-label, 'Duração total')]/following-sibling::span//span[@aria-describedby])[1]"
          );
          const destinationAirport = getTextByXPath(
            li,
            "(.//div[starts-with(@aria-label, 'Duração total')]/following-sibling::span//span[@aria-describedby])[2]"
          );
          // Paradas
          const stops = getTextByXPath(
            li,
            ".//span[@aria-label='Voo direto.' or contains(@aria-label, 'parada')]"
          );
          // Companhia aérea
          let airline = getTextByXPath(
            li,
            ".//span[contains(@class, 'h1fkLb')]/span[1]"
          );
          if (!airline)
            airline = getTextByXPath(
              li,
              ".//div[contains(@class, 'sSHqwe') and contains(@class, 'ogfYpf')]/span[1]"
            );
          // Emissões
          let emissions = getTextByXPath(
            li,
            ".//div[contains(@class, 'AdWm1c') and contains(@class, 'lc3qH')]"
          );
          if (!emissions)
            emissions = getTextByXPath(
              li,
              ".//div[contains(@class, 'AdWm1c') and contains(@class, 'lc3qH')]/span"
            );
          return {
            departureTime: departureTime || "N/A",
            arrivalTime: arrivalTime || "N/A",
            duration: duration || "N/A",
            origin: originAirport || "N/A",
            destination: destinationAirport || "N/A",
            airline: airline || "N/A",
            stops: stops || "N/A",
            stopDetails: [], // Não extraído por XPath robusto aqui
            price: price,
            emissions: emissions || "N/A",
          };
        });
      });

      if (!flights) {
        throw new Error(`Failed to extract flight information for ${url}`);
      }

      const commonInfo = await page.evaluate(() => {
        const originInput = document.querySelector(
          'input[aria-label="De onde?"]'
        ) as HTMLInputElement;
        const destinationInput = document.querySelector(
          'input[aria-label="Para onde?"]'
        ) as HTMLInputElement;
        const dateInput = document.querySelector(
          'input.TP4Lpb.eoY5cb.j0Ppje[aria-label="Partida"]'
        ) as HTMLInputElement;

        if (!originInput || !destinationInput || !dateInput) {
          return null;
        }

        return {
          origin: originInput.value || "N/A",
          destination: destinationInput.value || "N/A",
          date: dateInput.value || "N/A",
        };
      });

      if (!commonInfo) {
        throw new Error(`Failed to extract flight details for ${url}`);
      }
      await page.close();
      return flights.map((flight) => ({
        ...flight,
        ...commonInfo,
      }));
    } catch (error: any) {
      const screenshot = await page.screenshot({
        path: `error-${Date.now()}.png`,
      });
      const html = await page.content();
      fs.writeFileSync(`error-${Date.now()}.png`, screenshot);
      fs.writeFileSync(`error-${Date.now()}.html`, html);
      console.error("Error scraping flight prices:", error);
      lastError = error;
      if (!page.isClosed()) {
        await page.close();
      }
    } finally {
      if (!page.isClosed()) {
        await page.close();
      }
    }

    throw new Error(`Failed to fetch flight prices. Last error: ${lastError?.message}
            url: ${url}`);
  }
}
