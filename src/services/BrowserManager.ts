import {
  Browser,
  Page,
  DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
} from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUAPlugin from "puppeteer-extra-plugin-anonymize-ua";
import BlockResourcesPlugin from "puppeteer-extra-plugin-block-resources";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

class BrowserManager {
  private browser: Browser | null = null;
  private isLaunching = false;

  constructor() {
    puppeteerExtra.use(StealthPlugin());
    puppeteerExtra.use(AnonymizeUAPlugin());
    puppeteerExtra.use(
      AdblockerPlugin({
        blockTrackers: true,
        blockTrackersAndAnnoyances: true,
        useCache: true,
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
      }),
    );
    puppeteerExtra.use(
      BlockResourcesPlugin({
        blockedTypes: new Set(["image", "media", "font", "stylesheet"]),
      }),
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
        headless: "new",
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

  public async closeBrowserIfIdle() {
    if (!this.browser) {
      return;
    }

    try {
      const pages = await this.browser.pages();
      const hasOpenPages = pages.some((page) => !page.isClosed());

      if (!hasOpenPages) {
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      console.error("Failed to close idle browser:", error);
    }
  }
}

export const browserManager = new BrowserManager();
