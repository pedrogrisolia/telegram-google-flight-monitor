import puppeteer from "puppeteer";

export interface CarRentalDetails {
  title: string;
  price: number;
  url: string;
}

export class KayakCarService {
  static async getMinCarPrice(
    airportCode: string,
    startDate: string,
    endDate: string
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
      await page.close();
      await browser.close();
      throw error;
    }
  }
}
