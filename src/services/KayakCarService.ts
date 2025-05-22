import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { TimeoutError } from "puppeteer";

// apply stealth plugin to evade detection
puppeteer.use(StealthPlugin());

export interface CarRentalDetails {
  title: string;
  price: number;
  url: string;
}

export class KayakCarService {
  static async getMinCarPrice(
    airportCode: string,
    startDate: string,
    endDate: string,
    onTimeout?: (screenshot: Buffer) => Promise<void>
  ): Promise<CarRentalDetails> {
    const url = `https://www.kayak.com.br/cars/${airportCode}/${startDate}/${endDate}?sort=price_a`;
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
        "--lang=pt-BR",
      ],
    });
    const page = await browser.newPage();
    // set human-like headers and viewport
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "languages", {
        get: () => ["pt-BR", "en-US"],
      });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    try {
      await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9" });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForSelector(".QYm5", {
        timeout: 30000,
      });
      const result = await page.evaluate((pageUrl: string) => {
        const el = document.querySelector(".QYm5");
        if (!el) return null;
        const img = el.querySelector("img.js-image.TbiT-pres-default");
        const title =
          img
            ?.getAttribute("alt")
            ?.replace(/^(Vehicle type:|Tipo de veículo:)\s*/, "")
            .trim() || "";
        const text = el.textContent || "";
        const priceMatch = text.match(/R\$\s?[0-9\.,]+/);
        const priceText = priceMatch
          ? priceMatch[0].replace(/[^0-9,]/g, "").replace(",", ".")
          : "0";
        console.log(title, priceText, pageUrl, text);
        return { title, price: parseFloat(priceText), url: pageUrl };
      }, url);
      await page.close();
      await browser.close();
      if (!result) throw new Error("Nenhum resultado encontrado");
      return result;
    } catch (error) {
      if (onTimeout && error instanceof TimeoutError) {
        const screenshot = await page.screenshot({ fullPage: true });
        await onTimeout(screenshot);
      }
      await page.close();
      await browser.close();
      throw error;
    }
  }
}
