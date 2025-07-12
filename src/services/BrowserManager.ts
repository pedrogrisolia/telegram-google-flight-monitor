import { Browser, Page } from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUAPlugin from "puppeteer-extra-plugin-anonymize-ua";
import BlockResourcesPlugin from "puppeteer-extra-plugin-block-resources";

class BrowserManager {
  private browser: Browser | null = null;
  private isLaunching = false;

  constructor() {
    puppeteerExtra.use(StealthPlugin());
    puppeteerExtra.use(AnonymizeUAPlugin());
    puppeteerExtra.use(
      BlockResourcesPlugin({
        blockedTypes: new Set(["image", "media", "font", "stylesheet"]),
      })
    );
  }

  public async getBrowser(): Promise<Browser> {
    while (this.isLaunching) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    this.isLaunching = true;
    try {
      const chromeExecutable =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_PATH ||
        "/usr/bin/google-chrome-stable";

      this.browser = await puppeteerExtra.launch({
        executablePath: chromeExecutable,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-infobars",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-extensions",
          "--lang=pt-BR",
        ],
      });

      if (this.browser) {
        this.browser.on("disconnected", () => {
          this.browser = null;
        });
      }
    } finally {
      this.isLaunching = false;
    }
    return this.browser!;
  }

  public async getNewPage(): Promise<Page> {
    let browser = await this.getBrowser();
    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "Accept-Language": "pt-BR,pt;q=0.9",
      });
      await page.setGeolocation({
        latitude: -23.5505,
        longitude: -46.6333,
      });
      // Força idioma do navegador para pt-BR
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "language", { get: () => "pt-BR" });
        Object.defineProperty(navigator, "languages", {
          get: () => ["pt-BR", "pt"],
        });
        Object.defineProperty(navigator, "userLanguage", {
          get: () => "pt-BR",
        });
      });
      return page;
    } catch (err) {
      // Se falhar, relance o browser e tente novamente
      await this.closeBrowser();
      browser = await this.getBrowser();
      return browser.newPage();
    }
  }

  public async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserManager = new BrowserManager();
