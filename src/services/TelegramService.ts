import TelegramBot from "node-telegram-bot-api";
import { AppDataSource } from "../config/database";
import { Flight } from "../entities/Flight";
import * as dotenv from "dotenv";
import { GoogleFlightsService } from "./GoogleFlightsService";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import en from "../i18n/en.json";
import ptBR from "../i18n/pt-BR.json";
import { PriceHistory } from "../entities/PriceHistory";
import { ChartService } from "./ChartService";
import { CarRental } from "../entities/CarRental";
import { CarPriceHistory } from "../entities/CarPriceHistory";
import { KayakCarService, CarRentalDetails } from "./KayakCarService";

dotenv.config();

interface I18n {
  en: typeof en;
  "pt-BR": typeof ptBR;
  [key: string]: any;
}

const i18n: I18n = {
  en,
  "pt-BR": ptBR,
};

function getTranslation(
  key: string,
  language: string,
  params?: { [key: string]: string | number }
): string {
  const translations = i18n[language] || i18n.en;
  let translation = translations[key] || key;
  if (!translations[key]) {
    console.warn(
      `Translation for key '${key}' not found in language '${language}'`
    );
    return key;
  }
  if (params) {
    for (const paramKey in params) {
      translation = translation.replace(
        `\${${paramKey}}`,
        String(params[paramKey])
      );
    }
  }
  return translation;
}

interface LinkPreviewOptions {
  url?: string;
  prefer_small_media?: boolean;
}

declare module "node-telegram-bot-api" {
  interface Message {
    link_preview_options?: LinkPreviewOptions;
  }
}

export class TelegramService {
  private bot: TelegramBot;
  private userStates: Map<
    number,
    {
      step: string;
      origin?: string;
      destination?: string;
      date?: string;
      passengers?: number;
      url?: string;
      price?: number;
      airportCode?: string;
      startDate?: string;
      endDate?: string;
    }
  > = new Map();

  private static BRAZIL_AIRPORTS = [
    { code: "BSB", label: "Brasília (DF)" },
    { code: "CGH", label: "São Paulo (SP)" },
    { code: "GIG", label: "Rio de Janeiro (RJ)" },
    { code: "SSA", label: "Salvador (BA)" },
    { code: "FLN", label: "Florianópolis (SC)" },
    { code: "POA", label: "Porto Alegre (RS)" },
    { code: "VCP", label: "Campinas (SP)" },
    { code: "REC", label: "Recife (PE)" },
    { code: "CWB", label: "Curitiba (PR)" },
    { code: "BEL", label: "Belém (PA)" },
    { code: "VIX", label: "Vitória (ES)" },
    { code: "SDU", label: "Rio de Janeiro (RJ)" },
    { code: "CGB", label: "Cuiabá (MT)" },
    { code: "CGR", label: "Campo Grande (MS)" },
    { code: "FOR", label: "Fortaleza (CE)" },
    { code: "MCP", label: "Macapá (AP)" },
    { code: "MGF", label: "Maringá (PR)" },
    { code: "GYN", label: "Goiânia (GO)" },
    { code: "NVT", label: "Navegantes (SC)" },
    { code: "MAO", label: "Manaus (AM)" },
    { code: "NAT", label: "Natal (RN)" },
    { code: "BPS", label: "Porto Seguro (BA)" },
    { code: "MCZ", label: "Maceió (AL)" },
    { code: "PMW", label: "Palmas (TO)" },
    { code: "SLZ", label: "São Luís (MA)" },
    { code: "GRU", label: "Guarulhos (SP)" },
    { code: "LDB", label: "Londrina (PR)" },
    { code: "PVH", label: "Porto Velho (RO)" },
    { code: "RBR", label: "Rio Branco (AC)" },
    { code: "JOI", label: "Joinville (SC)" },
    { code: "UDI", label: "Uberlândia (MG)" },
    { code: "CXJ", label: "Caxias do Sul (RS)" },
    { code: "IGU", label: "Foz do Iguaçu (PR)" },
    { code: "THE", label: "Teresina (PI)" },
    { code: "AJU", label: "Aracaju (SE)" },
    { code: "JPA", label: "João Pessoa (PB)" },
    { code: "PNZ", label: "Petrolina (PE)" },
    { code: "CNF", label: "Belo Horizonte (MG)" },
    { code: "BVB", label: "Boa Vista (RR)" },
    { code: "CPV", label: "Campina Grande (PB)" },
    { code: "STM", label: "Santarém (PA)" },
    { code: "IOS", label: "Ilhéus (BA)" },
    { code: "JDO", label: "Juazeiro do Norte (CE)" },
    { code: "IMP", label: "Imperatriz (MA)" },
    { code: "XAP", label: "Chapecó (SC)" },
    { code: "MAB", label: "Marabá (PA)" },
    { code: "CZS", label: "Cruzeiro do Sul (AC)" },
    { code: "PPB", label: "Presidente Prudente (SP)" },
    { code: "CFB", label: "Cabo Frio (RJ)" },
    { code: "FEN", label: "Fernando de Noronha (PE)" },
    { code: "JTC", label: "Bauru (SP)" },
    { code: "MOC", label: "Montes Claros (MG)" },
  ];

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    const webhookUrl = process.env.WEBHOOK_URL;
    this.bot = new TelegramBot(token, { polling: !webhookUrl });
    if (webhookUrl) {
      this.bot.setWebHook(`${webhookUrl}/bot${token}`);
    }
    this.bot.on("polling_error", (error) => {
      console.error("[polling_error]", error);
    });

    // Update bot commands to include language command
    this.bot.setMyCommands([
      { command: "start", description: "Start the bot" },
      { command: "monitor_flight", description: "Monitor a new flight" },
      { command: "monitor_car", description: "Monitor a new car rental" },
      { command: "stop_flights", description: "Stop monitoring flights" },
      { command: "stop_cars", description: "Stop monitoring car rentals" },
      { command: "list_flights", description: "List monitored flights" },
      { command: "list_cars", description: "List monitored car rentals" },
      { command: "language", description: "Change language / Mudar idioma 🌎" },
    ]);

    this.setupHandlers();
  }

  private setupHandlers() {
    const commandHandlers = [
      { pattern: /\/start/, handler: this.handleStart },
      { pattern: /\/monitor_flight/, handler: this.startMonitoring },
      { pattern: /\/monitor_car/, handler: this.startCarMonitoring },
      { pattern: /\/stop_flights/, handler: this.handleStopCommand },
      { pattern: /\/stop_cars/, handler: this.handleStopCarsCommand },
      { pattern: /\/list_flights/, handler: this.handleListCommand },
      { pattern: /\/list_cars/, handler: this.handleListCarsCommand },
      { pattern: /\/language/, handler: this.handleLanguageCommand },
    ];

    // Register command handlers with state clearing
    for (const { pattern, handler } of commandHandlers) {
      this.bot.onText(pattern, async (msg) => {
        const userId = msg.from?.id;
        if (userId) {
          // Clear previous state before handling new command
          this.userStates.delete(userId);
        }
        await handler.bind(this)(msg);
      });
    }

    // Register other handlers
    this.bot.on("message", this.handleMessage.bind(this));
    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
  }

  private async getUserLanguage(userId: number): Promise<string> {
    const user = await AppDataSource.manager.findOne(User, {
      where: { id: userId.toString() },
    });
    return user?.language || "en";
  }

  private async handleStart(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    const language = await this.getUserLanguage(userId);
    await this.bot.sendMessage(
      chatId,
      getTranslation("welcomeMessage", language)
    );
  }

  private async startMonitoring(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    const language = await this.getUserLanguage(userId);
    await this.bot.sendMessage(
      chatId,
      getTranslation("setupMessage", language)
    );
    this.userStates.set(userId, { step: "AWAITING_URL" });
  }

  private async startCarMonitoring(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;
    const language = await this.getUserLanguage(userId);
    const airports = TelegramService.BRAZIL_AIRPORTS.slice(0, 10);
    const keyboard = airports.map((a) => [
      {
        text: `${a.code} – ${a.label}`,
        callback_data: `car_airport_${a.code}`,
      },
    ]);
    keyboard.push([{ text: "Ver mais", callback_data: "car_airport_more" }]);
    await this.bot.sendMessage(
      chatId,
      getTranslation("selectCarAirport", language),
      { reply_markup: { inline_keyboard: keyboard } }
    );
    this.userStates.set(userId, { step: "AWAITING_CAR_AIRPORT" });
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) return;
    const language = await this.getUserLanguage(userId);

    const state = this.userStates.get(userId);
    if (!state) return;

    if (state.step === "AWAITING_URL") {
      if (
        !msg.link_preview_options?.url ||
        !msg.link_preview_options?.url.includes(
          "https://www.google.com/travel/flights/search?tfs="
        )
      ) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("invalidUrlMessage", language)
        );
        return;
      }

      const url = msg.link_preview_options.url;
      this.bot.sendMessage(
        chatId,
        getTranslation("processingUrlMessage", language, { url })
      );
      // Extract date from URL first
      try {
        const flights = await GoogleFlightsService.getFlightPricesFromUrl(url);
        if (flights.length > 0) {
          state.url = flights[0].successfulUrl;
          state.date = flights[0].date;
          state.origin = flights[0].origin;
          state.destination = flights[0].destination;
          state.price = Math.min(...flights.map((f) => f.price));
          state.step = "AWAITING_DATE_RANGE";

          // Offer date range options
          await this.offerDateRangeOptions(
            chatId,
            state.date,
            language,
            state.origin!,
            state.destination!,
            state.price!
          );
        } else {
          throw new Error("No flights found");
        }
      } catch (error) {
        console.error("Error getting flight info:", error);
        await this.bot.sendMessage(
          chatId,
          getTranslation("urlErrorMessage", language)
        );
        this.userStates.delete(userId);
      }
    }

    if (state.step === "AWAITING_CAR_START_DATE") {
      state.startDate = msg.text!;
      state.step = "AWAITING_CAR_END_DATE";
      this.userStates.set(userId, state);
      await this.bot.sendMessage(
        chatId,
        getTranslation("askCarEndDate", language)
      );
      return;
    }
    if (state.step === "AWAITING_CAR_END_DATE") {
      state.endDate = msg.text!;
      // Perform scraping and save to DB
      try {
        const details: CarRentalDetails = await KayakCarService.getMinCarPrice(
          state.airportCode!,
          state.startDate!,
          state.endDate!,
          async (screenshot) => {
            await this.bot.sendPhoto(chatId, screenshot);
          }
        );
        let user = await AppDataSource.manager.findOne(User, {
          where: { id: userId.toString() },
        });
        if (!user) {
          user = new User();
          user.id = userId.toString();
          await AppDataSource.manager.save(user);
        }
        const rental = new CarRental();
        rental.userId = userId;
        rental.user = user;
        rental.airportCode = state.airportCode!;
        rental.startDate = state.startDate!;
        rental.endDate = state.endDate!;
        rental.url = details.url;
        rental.lastPrice = details.price;
        await AppDataSource.manager.save(rental);
        const history = new CarPriceHistory();
        history.price = details.price;
        history.carRental = rental;
        await AppDataSource.manager.save(history);
        await this.bot.sendMessage(
          chatId,
          getTranslation("carMonitorSetupSuccess", language, {
            title: details.title,
            price: details.price,
            airportCode: state.airportCode!,
            startDate: state.startDate!,
            endDate: state.endDate!,
          })
        );
      } catch (error) {
        console.error("Error setting up car monitor:", error);
        await this.bot.sendMessage(
          chatId,
          getTranslation("carMonitorSetupError", language)
        );
      }
      this.userStates.delete(userId);
      return;
    }
  }

  private async offerDateRangeOptions(
    chatId: number,
    date: string,
    language: string,
    origin: string,
    destination: string,
    price: number
  ) {
    const keyboard = [
      [
        {
          text: getTranslation("dateRangeOptionJustThisDate", language),
          callback_data: "range_0",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus1Day", language),
          callback_data: "range_1",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus2Days", language),
          callback_data: "range_2",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus3Days", language),
          callback_data: "range_3",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus4Days", language),
          callback_data: "range_4",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus5Days", language),
          callback_data: "range_5",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus6Days", language),
          callback_data: "range_6",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus7Days", language),
          callback_data: "range_7",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus8Days", language),
          callback_data: "range_8",
        },
      ],
      [
        {
          text: getTranslation("dateRangeOptionPlusMinus9Days", language),
          callback_data: "range_9",
        },
      ],
    ];

    await this.bot.sendMessage(
      chatId,
      getTranslation("dateConfirmationMessage", language, {
        date,
        origin,
        destination,
        price,
      }),
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    if (!query.message || !query.from.id || !query.data) return;

    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const language = await this.getUserLanguage(userId);

    if (query.data.startsWith("lang_")) {
      const newLanguage = query.data.split("_")[1] as "en" | "pt-BR";

      // Update user language in database
      let user = await AppDataSource.manager.findOne(User, {
        where: { id: userId.toString() },
      });
      if (!user) {
        user = new User();
        user.id = userId.toString();
      }
      user.language = newLanguage;
      await AppDataSource.manager.save(user);

      // Send confirmation message
      await this.bot.sendMessage(
        chatId,
        getTranslation("languageChangedMessage", newLanguage)
      );
      return;
    }

    if (query.data.startsWith("car_airport_")) {
      const code =
        query.data === "car_airport_more" ? null : query.data.split("_")[2];
      if (query.data === "car_airport_more") {
        const rest = TelegramService.BRAZIL_AIRPORTS.slice(10);
        const kb = rest.map((a) => [
          {
            text: `${a.code} – ${a.label}`,
            callback_data: `car_airport_${a.code}`,
          },
        ]);
        await this.bot.sendMessage(
          chatId,
          getTranslation("selectCarAirportMore", language),
          { reply_markup: { inline_keyboard: kb } }
        );
      } else if (code) {
        const state = this.userStates.get(userId);
        if (!state) return;
        state.step = "AWAITING_CAR_START_DATE";
        state.airportCode = code;
        this.userStates.set(userId, state);
        await this.bot.sendMessage(
          chatId,
          getTranslation("askCarStartDate", language)
        );
      }
      return;
    }

    // Rest of the existing callback query handling
    if (query.data.startsWith("stop_")) {
      const flightId = parseInt(query.data.split("_")[1]);
      await this.stopMonitoring(chatId, userId, flightId, language);
    } else if (query.data.startsWith("stop_car_")) {
      const rentalId = parseInt(query.data.split("_")[2]);
      await this.stopCarMonitoring(chatId, userId, rentalId, language);
    } else if (query.data.startsWith("range_")) {
      const state = this.userStates.get(userId);
      if (
        !state ||
        !state.url ||
        !state.date ||
        state.step !== "AWAITING_DATE_RANGE"
      )
        return;

      const range = parseInt(query.data.split("_")[1]);
      await this.setupFlightMonitoringWithRange(
        chatId,
        userId,
        state.url,
        state.date,
        range,
        language
      );
      this.userStates.delete(userId);
    }
  }

  private async handleLanguageCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    const user = await AppDataSource.manager.findOne(User, {
      where: { id: userId.toString() },
    });
    const currentLanguage = user?.language || "en";

    const keyboard = [
      [
        {
          text: getTranslation("languageEnglish", currentLanguage),
          callback_data: "lang_en",
        },
      ],
      [
        {
          text: getTranslation("languagePortuguese", currentLanguage),
          callback_data: "lang_pt-BR",
        },
      ],
    ];

    await this.bot.sendMessage(
      chatId,
      getTranslation("languageSelectionMessage", currentLanguage),
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  private parseBrazilianDate(dateStr: string): Date {
    // Convert Brazilian date format (e.g., "sex., 6 de jun.") to a Date object
    const months: { [key: string]: number } = {
      jan: 0,
      fev: 1,
      mar: 2,
      abr: 3,
      mai: 4,
      jun: 5,
      jul: 6,
      ago: 7,
      set: 8,
      out: 9,
      nov: 10,
      dez: 11,
    };

    // Extract day and month from the string
    const match = dateStr.match(/(\d+)\s+de\s+(\w+)/);
    if (!match) throw new Error(`Invalid date format: ${dateStr}`);

    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase().slice(0, 3);
    const month = months[monthStr];
    if (month === undefined) throw new Error(`Invalid month: ${monthStr}`);

    // Use the year from the URL or default to next occurrence of this date
    const now = new Date();
    const year = now.getFullYear();
    const date = new Date(year, month, day);

    // If the date is in the past, use next year
    if (date < now) {
      date.setFullYear(year + 1);
    }

    return date;
  }

  private formatDateForUrl(date: Date): string {
    // Format date as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private async setupFlightMonitoringWithRange(
    chatId: number,
    userId: number,
    url: string,
    date: string,
    range: number,
    language: string
  ) {
    try {
      await this.bot.sendMessage(
        chatId,
        getTranslation("settingUpMonitoringMessage", language, { range })
      );

      // Create or find user
      let user = await AppDataSource.manager.findOne(User, {
        where: { id: userId.toString() },
      });
      if (!user) {
        user = new User();
        user.id = userId.toString();
        await AppDataSource.manager.save(user);
      }

      // Parse the original date
      const baseDate = this.parseBrazilianDate(date);
      const baseDateStr = this.formatDateForUrl(baseDate);

      const dates = [];
      // Add the original date
      dates.push(baseDateStr);

      // Add dates in the range if range > 0
      if (range > 0) {
        for (let i = 1; i <= range; i++) {
          // Add i days
          const futureDate = new Date(baseDate);
          futureDate.setDate(baseDate.getDate() + i);
          dates.push(this.formatDateForUrl(futureDate));

          // Subtract i days
          const pastDate = new Date(baseDate);
          pastDate.setDate(baseDate.getDate() - i);
          dates.push(this.formatDateForUrl(pastDate));
        }
      }

      // Sort dates chronologically
      dates.sort();

      // Monitor each date
      let successCount = 0;
      for (const targetDate of dates) {
        try {
          const dateUrl = GoogleFlightsService.changeDateInUrl(
            url,
            baseDateStr,
            targetDate
          );
          const flights = await GoogleFlightsService.getFlightPricesFromUrl(
            dateUrl
          );

          if (flights.length > 0) {
            // Create trip entity
            const trip = new Trip();
            trip.userId = userId;
            trip.url = flights[0].successfulUrl || dateUrl;
            trip.date = flights[0].date;
            trip.flights = [];

            // Create flight entities
            for (const flightInfo of flights) {
              const flight = new Flight();
              flight.origin = flightInfo.origin;
              flight.destination = flightInfo.destination;
              flight.departureTime = flightInfo.departureTime;
              flight.arrivalTime = flightInfo.arrivalTime;
              flight.duration = flightInfo.duration;
              flight.airline = flightInfo.airline;
              flight.stops = flightInfo.stops;
              flight.currentPrice = flightInfo.price;
              flight.passengers = 1;
              flight.stopDetails = flightInfo.stopDetails;
              trip.flights.push(flight);
            }

            // Save trip with flights
            await AppDataSource.manager.save(trip);
            // Save initial price history entry
            const initialLowestPrice = Math.min(...flights.map((f) => f.price));
            const priceHistoryEntry = new PriceHistory();
            priceHistoryEntry.price = initialLowestPrice;
            priceHistoryEntry.trip = trip;
            await AppDataSource.manager.save(priceHistoryEntry);
            successCount++;
          }
        } catch (error) {
          console.error(`Error monitoring date ${targetDate}:`, error);
        }
      }

      if (successCount > 0) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("successMessage", language, { count: successCount })
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          getTranslation("noSuccessMessage", language)
        );
      }
    } catch (error) {
      console.error("Error setting up flight monitoring:", error);
      await this.bot.sendMessage(
        chatId,
        getTranslation("setupErrorMessage", language)
      );
    }
  }

  async checkPriceUpdates() {
    try {
      console.log(getTranslation("startingPriceCheckMessage", "en"));

      // Get all active trips
      const activeTrips = await AppDataSource.manager.find(Trip, {
        where: { isActive: true },
        relations: ["flights"],
      });
      console.log(
        getTranslation("foundActiveTripsMessage", "en", {
          count: activeTrips.length,
        })
      );

      for (const trip of activeTrips) {
        try {
          console.log(
            getTranslation("checkingTripMessage", "en", {
              tripId: trip.id,
              origin: trip.flights[0]?.origin,
              destination: trip.flights[0]?.destination,
              date: trip.date,
            })
          );
          console.log(getTranslation("tripUrlMessage", "en", { url: trip.url }));

          // Determine the baseline price using the latest saved history when available
          const lastHistory = await AppDataSource.manager.findOne(PriceHistory, {
            where: { trip: { id: trip.id } as any },
            order: { timestamp: "DESC" },
          });
          const oldLowestPrice = lastHistory?.price ?? Math.min(...trip.flights.map((f) => f.currentPrice));
          console.log(
            getTranslation("currentLowestPriceMessage", "en", {
              oldLowestPrice,
            })
          );

          // Fetch new prices
          console.log(getTranslation("fetchingNewPricesMessage", "en"));
          const newFlights = await GoogleFlightsService.getFlightPricesFromUrl(trip.url, trip.id);
          console.log(
            getTranslation("foundNewFlightsMessage", "en", {
              count: newFlights.length,
            })
          );

          // Se não há voos retornados, verificar se a trip ainda existe (pode ter sido deletada)
          if (newFlights.length === 0) {
            const tripStillExists = await AppDataSource.manager.findOne(Trip, {
              where: { id: trip.id },
            });
            if (!tripStillExists) {
              console.log(`Trip ${trip.id} was deleted, skipping...`);
              continue;
            }
            // Se a trip ainda existe mas não há voos, pular para a próxima
            console.log(`No flights found for trip ${trip.id}, skipping...`);
            continue;
          }

          const newLowestPrice = Math.min(...newFlights.map((f) => f.price));
          console.log(getTranslation("newLowestPriceMessage", "en", { newLowestPrice }));

          // Replace flights atomically to avoid stale entries causing duplicate alerts
          await AppDataSource.createQueryBuilder().delete().from(Flight).where("tripId = :tripId", { tripId: trip.id }).execute();

          const newFlightEntities: Flight[] = newFlights.map((info) => {
            const f = new Flight();
            f.trip = trip;
            f.origin = info.origin;
            f.destination = info.destination;
            f.departureTime = info.departureTime;
            f.arrivalTime = info.arrivalTime;
            f.duration = info.duration;
            f.airline = info.airline;
            f.stops = info.stops;
            f.currentPrice = info.price;
            f.passengers = 1;
            f.stopDetails = info.stopDetails;
            return f;
          });
          const savedFlights = await AppDataSource.manager.save(newFlightEntities);
          console.log(
            getTranslation("updatedFlightsMessage", "en", {
              count: savedFlights.length,
            })
          );

          // Create price history entry if price changed
          if (newLowestPrice !== oldLowestPrice && isFinite(newLowestPrice)) {
            // Verificar novamente se a trip ainda existe antes de criar o histórico
            const tripStillExists = await AppDataSource.manager.findOne(Trip, {
              where: { id: trip.id },
            });
            if (tripStillExists) {
              const priceHistory = new PriceHistory();
              priceHistory.price = newLowestPrice;
              priceHistory.trip = trip;
              await AppDataSource.manager.save(priceHistory);
              console.log(`Saved new price point R$ ${newLowestPrice} to history`);
            }
          }

          // Calculate price change percentage
          const priceChange = newLowestPrice - oldLowestPrice;
          const percentageChange = (
            (priceChange / oldLowestPrice) *
            100
          ).toFixed(1);
          const absolutePercentageChange = Math.abs(Number(percentageChange));

          // Notify if lowest price changed by 5% or more
          if (absolutePercentageChange >= 5) {
            console.log(
              getTranslation("significantPriceChangeMessage", "en", {
                percentageChange,
                priceChange,
              })
            );
            const emoji = priceChange > 0 ? "🔴" : "🟢";
            const trendKey =
              priceChange > 0 ? "priceIncreased" : "priceDecreased";
            const language =
              (
                await AppDataSource.manager.findOne(User, {
                  where: { id: trip.userId.toString() },
                })
              )?.language || "en";
            const trend = getTranslation(trendKey, language);

            // Get historical prices for comparison
            const tripWithHistory = await AppDataSource.manager.findOne(Trip, {
              where: { id: trip.id },
              relations: ["priceHistory"],
            });

            let priceExtremesMessage = "";
            if (tripWithHistory?.priceHistory.length) {
              const historicalPrices = tripWithHistory.priceHistory.map(
                (h) => h.price
              );
              const historicalLowest = Math.min(...historicalPrices);
              const historicalHighest = Math.max(...historicalPrices);

              if (newLowestPrice <= historicalLowest) {
                priceExtremesMessage = getTranslation(
                  "newLowestHistoricalPrice",
                  language
                );
              } else if (newLowestPrice >= historicalHighest) {
                priceExtremesMessage = getTranslation(
                  "newHighestHistoricalPrice",
                  language
                );
              }
            }

            const message = getTranslation("priceAlert", language, {
              emoji,
              origin: trip.flights[0].origin,
              destination: trip.flights[0].destination,
              date: trip.date,
              trend,
              priceChange: Math.abs(priceChange),
              percentage: absolutePercentageChange,
              oldPrice: oldLowestPrice,
              newPrice: newLowestPrice,
              url: trip.url,
              priceExtremesMessage: priceExtremesMessage
                ? `\n${priceExtremesMessage}`
                : "",
            });

            // Generate price history chart
            if (tripWithHistory && tripWithHistory?.priceHistory?.length > 1) {
              const chartBuffer = await ChartService.generatePriceHistoryChart(
                tripWithHistory.priceHistory
              );

              // Send chart image with alert message
              await this.bot.sendPhoto(trip.userId, chartBuffer, {
                caption: message,
                parse_mode: "HTML",
              });
            } else {
              // Send price alert message
              await this.bot.sendMessage(trip.userId, message, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
            }

            console.log(
              getTranslation("notifiedUserMessage", "en", {
                userId: trip.userId,
                origin: trip.flights[0].origin,
                destination: trip.flights[0].destination,
                date: trip.date,
              })
            );
          }
        } catch (error: Error | any) {
          console.error(
            getTranslation("failedToCheckPricesMessage", "en", {
              tripId: trip.id,
            }),
            error
          );
          if (
            error?.message?.includes("Failed to launch the browser process!")
          ) {
            console.log("Critical Puppeteer error detected, restarting app...");
            process.exit(1);
          }
        }
      }

      // Car rental price check
      console.log(getTranslation("startingCarPriceCheckMessage", "en"));
      const activeRentals = await AppDataSource.manager.find(CarRental, {
        where: { isActive: true },
        relations: ["priceHistory"],
      });
      console.log(`Found ${activeRentals.length} active car rentals to check`);
      for (const rental of activeRentals) {
        try {
          console.log(
            `Checking car rental ID ${rental.id}: ${rental.airportCode} ${rental.startDate}→${rental.endDate}`
          );
          const oldPrice = rental.lastPrice;
          const details = await KayakCarService.getMinCarPrice(
            rental.airportCode,
            rental.startDate,
            rental.endDate,
            async (screenshot) => {
              await this.bot.sendPhoto(rental.userId, screenshot);
            }
          );
          console.log(`Found price: ${details.price}`);
          const newPrice = details.price;
          if (newPrice !== oldPrice) {
            const historyEntry = new CarPriceHistory();
            historyEntry.price = newPrice;
            historyEntry.carRental = rental;
            await AppDataSource.manager.save(historyEntry);
            rental.lastPrice = newPrice;
            await AppDataSource.manager.save(rental);
            const priceChange = newPrice - oldPrice;
            const percentageChange = ((priceChange / oldPrice) * 100).toFixed(
              1
            );
            const absPerc = Math.abs(Number(percentageChange));
            if (absPerc >= 5) {
              const userLang =
                (
                  await AppDataSource.manager.findOne(User, {
                    where: { id: rental.userId.toString() },
                  })
                )?.language || "en";
              const emoji = priceChange > 0 ? "🔴" : "🟢";
              const trend = getTranslation(
                priceChange > 0 ? "priceIncreased" : "priceDecreased",
                userLang
              );
              const rentalWithHist = await AppDataSource.manager.findOne(
                CarRental,
                { where: { id: rental.id }, relations: ["priceHistory"] }
              );
              let extremesMsg = "";
              if (rentalWithHist?.priceHistory.length) {
                const prices = rentalWithHist.priceHistory.map((h) => h.price);
                const lowest = Math.min(...prices);
                const highest = Math.max(...prices);
                if (newPrice <= lowest)
                  extremesMsg = getTranslation(
                    "newLowestHistoricalPrice",
                    userLang
                  );
                else if (newPrice >= highest)
                  extremesMsg = getTranslation(
                    "newHighestHistoricalPrice",
                    userLang
                  );
              }
              const msgText = getTranslation("carPriceAlert", userLang, {
                emoji,
                trend,
                airportCode: rental.airportCode,
                startDate: rental.startDate,
                endDate: rental.endDate,
                priceChange: Math.abs(priceChange),
                percentage: absPerc,
                oldPrice,
                newPrice,
                url: details.url,
                priceExtremesMessage: extremesMsg ? `\n${extremesMsg}` : "",
              });
              await this.bot.sendMessage(rental.userId, msgText, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
            }
          }
        } catch (error) {
          console.error(`Error checking car rental ID ${rental.id}:`, error);
        }
      }
      console.log("\nPrice check completed");
    } catch (error: Error | any) {
      console.error(
        getTranslation("errorInCheckPriceUpdatesMessage", "en"),
        error
      );
      if (error?.message?.includes("Failed to launch the browser process!")) {
        console.log("Critical Puppeteer error detected, restarting app...");
        process.exit(1);
      }
    }
  }

  private async handleListCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    const language = await this.getUserLanguage(userId);
    try {
      const trips = await AppDataSource.manager.find(Trip, {
        where: { userId, isActive: true },
        relations: ["flights"],
      });

      trips.sort((a, b) => {
        const priceA = Math.min(...a.flights.map((f) => f.currentPrice));
        const priceB = Math.min(...b.flights.map((f) => f.currentPrice));
        if (priceA !== priceB) {
          return priceA - priceB;
        }
        const dateA = this.parseBrazilianDate(a.date);
        const dateB = this.parseBrazilianDate(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      if (trips.length === 0) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("noActiveMonitorsMessage", language)
        );
        return;
      }

      // Send initial message
      await this.bot.sendMessage(
        chatId,
        getTranslation("listTripsMessage", language, { count: trips.length })
      );

      // Split trips into groups of 10
      const TRIPS_PER_MESSAGE = 10;
      for (let i = 0; i < trips.length; i += TRIPS_PER_MESSAGE) {
        const tripGroup = trips.slice(i, i + TRIPS_PER_MESSAGE);
        const message = tripGroup
          .map((trip, index) => {
            const lowestPrice = Math.min(
              ...trip.flights.map((f) => f.currentPrice)
            );
            return getTranslation("tripListItem", language, {
              index: i + index + 1,
              origin: trip.flights[0].origin,
              destination: trip.flights[0].destination,
              date: trip.date,
              price: lowestPrice,
              url: trip.url,
            });
          })
          .join("\n\n");

        await this.bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      }
    } catch (error) {
      console.error("Error listing trips:", error);
      await this.bot.sendMessage(
        chatId,
        getTranslation("listErrorMessage", language)
      );
    }
  }

  private async handleStopCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    const language = await this.getUserLanguage(userId);
    try {
      const trips = await AppDataSource.manager.find(Trip, {
        where: { userId, isActive: true },
        relations: ["flights"],
      });

      trips.sort((a, b) => {
        const dateA = this.parseBrazilianDate(a.date);
        const dateB = this.parseBrazilianDate(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      if (trips.length === 0) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("noActiveMonitorsToStopMessage", language)
        );
        return;
      }

      const keyboard = trips.map((trip, index) => [
        {
          text: `${index + 1}. ${trip.flights[0].origin} → ${
            trip.flights[0].destination
          } (${trip.date})`,
          callback_data: `stop_${trip.id}`,
        },
      ]);

      await this.bot.sendMessage(
        chatId,
        getTranslation("stopMonitorPrompt", language),
        {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        }
      );
    } catch (error) {
      console.error("Error listing trips for stop command:", error);
      await this.bot.sendMessage(
        chatId,
        getTranslation("listErrorMessage", language)
      );
    }
  }

  private async stopMonitoring(
    chatId: number,
    userId: number,
    tripId: number,
    language: string
  ) {
    try {
      const trip = await AppDataSource.manager.findOne(Trip, {
        where: { id: tripId, userId },
        relations: ["flights"],
      });

      if (!trip) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("noMonitorFoundMessage", language)
        );
        return;
      }

      trip.isActive = false;
      await AppDataSource.manager.save(trip);

      await this.bot.sendMessage(
        chatId,
        getTranslation("stoppedMonitoringMessage", language, {
          origin: trip.flights[0].origin,
          destination: trip.flights[0].destination,
          date: trip.date,
        })
      );
    } catch (error) {
      console.error("Error stopping flight monitor:", error);
      await this.bot.sendMessage(
        chatId,
        getTranslation("stopErrorMessage", language)
      );
    }
  }

  private async stopCarMonitoring(
    chatId: number,
    userId: number,
    rentalId: number,
    language: string
  ) {
    try {
      const rental = await AppDataSource.manager.findOne(CarRental, {
        where: { id: rentalId, userId },
      });
      if (!rental) {
        await this.bot.sendMessage(
          chatId,
          getTranslation("noActiveCarMonitorsMessage", language)
        );
        return;
      }
      rental.isActive = false;
      await AppDataSource.manager.save(rental);
      await this.bot.sendMessage(
        chatId,
        getTranslation("stoppedCarMonitoringMessage", language, {
          airportCode: rental.airportCode,
          startDate: rental.startDate,
          endDate: rental.endDate,
        })
      );
    } catch (error) {
      console.error("Error stopping car rental monitor:", error);
      await this.bot.sendMessage(
        chatId,
        getTranslation("stopCarErrorMessage", language)
      );
    }
  }

  private async handleListCarsCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;
    const language = await this.getUserLanguage(userId);
    const rentals = await AppDataSource.manager.find(CarRental, {
      where: { userId, isActive: true },
    });
    if (rentals.length === 0) {
      await this.bot.sendMessage(
        chatId,
        getTranslation("noActiveCarMonitorsMessage", language)
      );
      return;
    }
    // Send header message
    await this.bot.sendMessage(
      chatId,
      getTranslation("listCarsMessage", language, { count: rentals.length })
    );
    // Send plain list of car rentals
    const lines = rentals.map(
      (r, i) =>
        `${i + 1}. ${r.airportCode} ${r.startDate}→${r.endDate} – R$ ${
          r.lastPrice
        }`
    );
    await this.bot.sendMessage(chatId, lines.join("\n"), {
      disable_web_page_preview: true,
    });
  }

  private async handleStopCarsCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;
    const language = await this.getUserLanguage(userId);
    const rentals = await AppDataSource.manager.find(CarRental, {
      where: { userId, isActive: true },
    });
    if (rentals.length === 0) {
      await this.bot.sendMessage(
        chatId,
        getTranslation("noActiveCarMonitorsMessage", language)
      );
      return;
    }
    const keyboard = rentals.map((r, i) => [
      {
        text: `${i + 1}. ${r.airportCode} ${r.startDate}→${r.endDate}`,
        callback_data: `stop_car_${r.id}`,
      },
    ]);
    await this.bot.sendMessage(
      chatId,
      getTranslation("stopCarMonitorPrompt", language),
      { reply_markup: { inline_keyboard: keyboard } }
    );
  }

  public handleWebhookUpdate(update: any) {
    this.bot.processUpdate(update);
  }
}
