import puppeteer, { Browser, TimeoutError } from "puppeteer";
import { browserManager } from "./BrowserManager";

export interface CarRentalDetails {
  title: string;
  price: number;
  url: string;
}

interface KayakProxyConfig {
  proxyServer: string;
  username?: string;
  password?: string;
}

export class KayakCarService {
  private static readonly BLOCKED_RESOURCE_TYPES = new Set([
    "image",
    "media",
    "font",
    "stylesheet",
  ]);

  private static readonly DEFAULT_BLOCKED_DOMAINS = ["content.r9cdn.net"];

  private static getBlockedDomains(): string[] {
    const envBlockedDomains = (process.env.KAYAK_BLOCKED_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);

    return [
      ...new Set([...this.DEFAULT_BLOCKED_DOMAINS, ...envBlockedDomains]),
    ];
  }

  private static shouldBlockDomain(hostname: string, blockedDomains: string[]) {
    return blockedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  }

  private static async optimizeProxyTraffic(page: any): Promise<void> {
    const blockedDomains = this.getBlockedDomains();
    await page.setRequestInterception(true);

    page.on("request", (request: any) => {
      const resourceType = request.resourceType();
      if (this.BLOCKED_RESOURCE_TYPES.has(resourceType)) {
        request.abort().catch(() => {});
        return;
      }

      try {
        const { hostname } = new URL(request.url());
        if (this.shouldBlockDomain(hostname.toLowerCase(), blockedDomains)) {
          request.abort().catch(() => {});
          return;
        }
      } catch {
        // If URL parsing fails, allow request to avoid breaking navigation.
      }

      request.continue().catch(() => {});
    });
  }

  private static getKayakProxyConfig(): KayakProxyConfig | null {
    const rawProxy = process.env.KAYAK_PROXY_URL?.trim();
    if (!rawProxy) {
      return null;
    }

    const normalizedProxy = rawProxy.includes("://")
      ? rawProxy
      : `http://${rawProxy}`;

    let parsedProxy: URL;
    try {
      parsedProxy = new URL(normalizedProxy);
    } catch {
      throw new Error(
        "Invalid KAYAK_PROXY_URL format. Use: http://user:pass@host:port",
      );
    }

    const proxyServer = `${parsedProxy.protocol}//${parsedProxy.hostname}${
      parsedProxy.port ? `:${parsedProxy.port}` : ""
    }`;

    return {
      proxyServer,
      username: parsedProxy.username
        ? decodeURIComponent(parsedProxy.username)
        : undefined,
      password: parsedProxy.password
        ? decodeURIComponent(parsedProxy.password)
        : undefined,
    };
  }

  private static async launchProxyBrowser(
    proxyConfig: KayakProxyConfig,
  ): Promise<Browser> {
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
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
        `--proxy-server=${proxyConfig.proxyServer}`,
      ],
    };

    const chromeExecutable =
      process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;

    if (chromeExecutable) {
      launchOptions.executablePath = chromeExecutable;
    }

    return puppeteer.launch(launchOptions);
  }

  static async getMinCarPrice(
    airportCode: string,
    startDate: string,
    endDate: string,
    onTimeout?: (screenshot: Buffer) => Promise<void>,
  ): Promise<CarRentalDetails> {
    const url = `https://www.kayak.com.br/cars/${airportCode}/${startDate}/${endDate}?sort=price_a`;
    const proxyConfig = this.getKayakProxyConfig();
    const usingProxyBrowser = Boolean(proxyConfig);
    let browser: Browser | null = null;
    let page: any = null;

    try {
      browser = usingProxyBrowser
        ? await this.launchProxyBrowser(proxyConfig!)
        : await browserManager.getBrowser();
      page = await browser.newPage();

      if (proxyConfig?.username) {
        await page.authenticate({
          username: proxyConfig.username,
          password: proxyConfig.password || "",
        });
      }

      if (usingProxyBrowser) {
        await this.optimizeProxyTraffic(page);
      }

      // set human-like headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      );
      await page.setViewport({ width: 1280, height: 800 });
      await page.evaluateOnNewDocument(() => {
        // evade webdriver detection
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "languages", {
          get: () => ["pt-BR", "en-US"],
        });
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });
        // fake chrome runtime
        (window as any).chrome = { runtime: {} };
        // fake platform
        Object.defineProperty(navigator, "platform", { get: () => "Win32" });
        // fake WebGL vendor and renderer
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
          if (parameter === 37445) return "Intel Inc."; // UNMASKED_VENDOR_WEBGL
          if (parameter === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
          return getParameter(parameter);
        };
      });

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
      if (!result) throw new Error("Nenhum resultado encontrado");
      return result;
    } catch (error) {
      if (onTimeout && page && error instanceof TimeoutError) {
        try {
          const screenshot = await page.screenshot();
          await onTimeout(screenshot);
        } catch {}
      }
      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      if (usingProxyBrowser && browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
