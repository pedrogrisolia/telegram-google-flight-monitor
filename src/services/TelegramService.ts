import TelegramBot from "node-telegram-bot-api";
import { AppDataSource } from "../config/database";
import { Flight } from "../entities/Flight";
import * as dotenv from "dotenv";
import { GoogleFlightsService } from "./GoogleFlightsService";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import en from "../i18n/en.json";
import ptBR from "../i18n/pt-BR.json";

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

function getTranslation(key: string, language: string, params?: { [key: string]: string | number }): string {
    const translations = i18n[language] || i18n.en;
    let translation = translations[key] || key;
     if (!translations[key]) {
        console.warn(`Translation for key '${key}' not found in language '${language}'`);
        return key;
    }
    if (params) {
        for (const paramKey in params) {
            translation = translation.replace(`\${${paramKey}}`, String(params[paramKey]));
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
    private userStates: Map<number, { 
        step: string;
        origin?: string;
        destination?: string;
        date?: string;
        passengers?: number;
        url?: string;  // Store URL while waiting for date range selection
    }> = new Map();

    constructor() {
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || "", { polling: true });
        
        // Set up bot commands in Telegram menu
        this.bot.setMyCommands([
            { command: 'start', description: 'Start the bot' },
            { command: 'monitor', description: 'Monitor a new flight' },
            { command: 'stop', description: 'Stop monitoring a flight' },
            { command: 'list', description: 'List all monitored flights' }
        ]);
        
        this.setupHandlers();
    }

    private setupHandlers() {
        this.bot.onText(/\/start/, this.handleStart.bind(this));
        this.bot.onText(/\/monitor/, this.startMonitoring.bind(this));
        this.bot.onText(/\/stop/, this.handleStopCommand.bind(this));
        this.bot.onText(/\/list/, this.handleListCommand.bind(this));
        this.bot.on("message", this.handleMessage.bind(this));
        this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
    }

    private async handleStart(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const language = msg.from?.language_code === 'pt-BR' ? 'pt-BR' : 'en';
        if (!userId) return;

        let user = await AppDataSource.manager.findOne(User, { where: { id: userId } });
        if (!user) {
            user = new User();
            user.id = userId;
        }
        user.language = language;
        await AppDataSource.manager.save(user);

        await this.bot.sendMessage(chatId,
            getTranslation("welcomeMessage", language)
        );
    }

    private async startMonitoring(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const language = msg.from?.language_code === 'pt-BR' ? 'pt-BR' : 'en';
        if (!userId) return;

        await this.bot.sendMessage(chatId, 
            getTranslation("setupMessage", language)
        );
        this.userStates.set(userId, { step: "AWAITING_URL" });
    }

    private async handleMessage(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const language = msg.from?.language_code === 'pt-BR' ? 'pt-BR' : 'en';
        if (!userId) return;

        const state = this.userStates.get(userId);
        if (!state) return;

        if (state.step === "AWAITING_URL") {
            if (!msg.link_preview_options?.url || !msg.link_preview_options?.url.includes("https://www.google.com/travel/flights/search?tfs=")) {
                await this.bot.sendMessage(chatId, 
                    getTranslation("invalidUrlMessage", language)
                );
                return;
            }

            const url = msg.link_preview_options.url;
            this.bot.sendMessage(chatId, getTranslation("processingUrlMessage", language, { url }));
            // Extract date from URL first
            try {
                const flights = await GoogleFlightsService.getFlightPricesFromUrl(url);
                if (flights.length > 0) {
                    state.url = flights[0].successfulUrl;
                    state.date = flights[0].date;
                    state.step = "AWAITING_DATE_RANGE";
                    
                    // Offer date range options
                    await this.offerDateRangeOptions(chatId, flights[0].date, language);
                } else {
                    throw new Error("No flights found");
                }
            } catch (error) {
                console.error("Error getting flight info:", error);
                await this.bot.sendMessage(chatId,
                    getTranslation("urlErrorMessage", language)
                );
                this.userStates.delete(userId);
            }
        }
    }

    private async offerDateRangeOptions(chatId: number, date: string, language: string) {
        const keyboard = [
            [{ text: getTranslation("dateRangeOptionJustThisDate", language), callback_data: "range_0" }],
            [{ text: getTranslation("dateRangeOptionPlusMinus1Day", language), callback_data: "range_1" }],
            [{ text: getTranslation("dateRangeOptionPlusMinus2Days", language), callback_data: "range_2" }],
            [{ text: getTranslation("dateRangeOptionPlusMinus3Days", language), callback_data: "range_3" }],
            [{ text: getTranslation("dateRangeOptionPlusMinus4Days", language), callback_data: "range_4" }],
            [{ text: getTranslation("dateRangeOptionPlusMinus5Days", language), callback_data: "range_5" }]
        ];

        await this.bot.sendMessage(chatId,
            getTranslation("dateConfirmationMessage", language, { date }),
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    }

    private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
        if (!query.message || !query.from.id || !query.data) return;

        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const language = query.from.language_code === 'pt-BR' ? 'pt-BR' : 'en';

        if (query.data.startsWith('stop_')) {
            const flightId = parseInt(query.data.split('_')[1]);
            await this.stopMonitoring(chatId, userId, flightId, language);
        } else if (query.data.startsWith('range_')) {
            const state = this.userStates.get(userId);
            if (!state || !state.url || !state.date || state.step !== "AWAITING_DATE_RANGE") return;

            const range = parseInt(query.data.split('_')[1]);
            await this.setupFlightMonitoringWithRange(chatId, userId, state.url, state.date, range, language);
            this.userStates.delete(userId);
        }
    }

    private parseBrazilianDate(dateStr: string): Date {
        // Convert Brazilian date format (e.g., "sex., 6 de jun.") to a Date object
        const months: { [key: string]: number } = {
            'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
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
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
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
            await this.bot.sendMessage(chatId, getTranslation("settingUpMonitoringMessage", language, { range }));
            
            // Create or find user
            let user = await AppDataSource.manager.findOne(User, { where: { id: userId } });
            if (!user) {
                user = new User();
                user.id = userId;
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
                    const dateUrl = GoogleFlightsService.changeDateInUrl(url, baseDateStr, targetDate);
                    const flights = await GoogleFlightsService.getFlightPricesFromUrl(dateUrl);
                    
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
                        successCount++;
                    }
                } catch (error) {
                    console.error(`Error monitoring date ${targetDate}:`, error);
                }
            }

            if (successCount > 0) {
                await this.bot.sendMessage(chatId,
                    getTranslation("successMessage", language, { successCount })
                );
            } else {
                await this.bot.sendMessage(chatId,
                    getTranslation("noSuccessMessage", language)
                );
            }
        } catch (error) {
            console.error("Error setting up flight monitoring:", error);
            await this.bot.sendMessage(chatId,
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
                relations: ['flights']
            });
            console.log(getTranslation("foundActiveTripsMessage", "en", { activeTrips: activeTrips.length }));

            for (const trip of activeTrips) {
                try {
                    console.log(getTranslation("checkingTripMessage", "en", { trip: trip.id, origin: trip.flights[0].origin, destination: trip.flights[0].destination, date: trip.date }));
                    console.log(getTranslation("tripUrlMessage", "en", { url: trip.url }));
                    
                    // Get current lowest price for the trip
                    const oldLowestPrice = Math.min(...trip.flights.map(f => f.currentPrice));
                    console.log(getTranslation("currentLowestPriceMessage", "en", { oldLowestPrice }));

                    // Fetch new prices
                    console.log(getTranslation("fetchingNewPricesMessage", "en"));
                    const newFlights = await GoogleFlightsService.getFlightPricesFromUrl(trip.url);
                    console.log(getTranslation("foundNewFlightsMessage", "en", { newFlights: newFlights.length }));

                    const newLowestPrice = Math.min(...newFlights.map(f => f.price));
                    console.log(getTranslation("newLowestPriceMessage", "en", { newLowestPrice }));

                    // Update existing flights with new data
                    for (let i = 0; i < trip.flights.length; i++) {
                        if (newFlights[i]) {
                            trip.flights[i].previousPrice = trip.flights[i].currentPrice;
                            trip.flights[i].currentPrice = newFlights[i].price;
                            trip.flights[i].stopDetails = newFlights[i].stopDetails;
                            trip.flights[i].departureTime = newFlights[i].departureTime;
                            trip.flights[i].arrivalTime = newFlights[i].arrivalTime;
                            trip.flights[i].duration = newFlights[i].duration;
                            trip.flights[i].airline = newFlights[i].airline;
                            trip.flights[i].stops = newFlights[i].stops;
                        }
                    }

                    const savedFligths = await AppDataSource.manager.save(trip.flights);
                    console.log(getTranslation("updatedFlightsMessage", "en", { savedFligths: savedFligths.length }));

                    // Calculate price change percentage
                    const priceChange = newLowestPrice - oldLowestPrice;
                    const percentageChange = ((priceChange / oldLowestPrice) * 100).toFixed(1);
                    const absolutePercentageChange = Math.abs(Number(percentageChange));

                    // Notify if lowest price changed by 5% or more
                    if (absolutePercentageChange >= 5) {
                        console.log(getTranslation("significantPriceChangeMessage", "en", { percentageChange, priceChange }));
                        const emoji = priceChange > 0 ? '🔴' : '🟢';
                        const trendKey = priceChange > 0 ? 'priceIncreased' : 'priceDecreased';
                        const language = (await AppDataSource.manager.findOne(User, { where: { id: trip.userId } }))?.language || 'en';
                        const trend = getTranslation(trendKey, language);

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
                            url: trip.url
                        });

                        await this.bot.sendMessage(trip.userId, message, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });

                        console.log(getTranslation("notifiedUserMessage", "en", { userId: trip.userId, origin: trip.flights[0].origin, destination: trip.flights[0].destination, date: trip.date }));
                    }
                } catch (error) {
                    console.error(getTranslation("failedToCheckPricesMessage", "en", { trip: trip.id }), error);
                }
            }
            
            console.log("\nPrice check completed");
        } catch (error) {
            console.error(getTranslation("errorInCheckPriceUpdatesMessage", "en"), error);
        }
    }

    private async handleListCommand(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const language = msg.from?.language_code === 'pt-BR' ? 'pt-BR' : 'en';
        if (!userId) return;

        try {
            const trips = await AppDataSource.manager.find(Trip, {
                where: { userId, isActive: true },
                relations: ['flights']
            });

            trips.sort((a, b) => {
                const priceA = Math.min(...a.flights.map(f => f.currentPrice));
                const priceB = Math.min(...b.flights.map(f => f.currentPrice));
                if (priceA !== priceB) {
                    return priceA - priceB;
                }
                const dateA = this.parseBrazilianDate(a.date);
                const dateB = this.parseBrazilianDate(b.date);
                return dateA.getTime() - dateB.getTime();
            });

            if (trips.length === 0) {
                await this.bot.sendMessage(chatId, getTranslation("noActiveMonitorsMessage", language));
                return;
            }

            // Send initial message
            await this.bot.sendMessage(chatId, getTranslation("listTripsMessage", language, { trips: trips.length }));

            // Split trips into groups of 10
            const TRIPS_PER_MESSAGE = 10;
            for (let i = 0; i < trips.length; i += TRIPS_PER_MESSAGE) {
                const tripGroup = trips.slice(i, i + TRIPS_PER_MESSAGE);
                const message = tripGroup
                    .map((trip, index) => {
                        const lowestPrice = Math.min(...trip.flights.map(f => f.currentPrice));
                        return  `<b>${i + index + 1}.</b> ${trip.flights[0].origin} ✈️ ${trip.flights[0].destination}\n` +
                                `<b>Date:</b> ${trip.date}\n` +
                                `<b>Lowest price:</b> R$ ${lowestPrice}\n` +
                                `━━━━━━━━━━━━━━━\n` +
                                `<a href="${trip.url}">🔍 View on Google Flights</a>`;
                    })
                    .join('\n\n');
                
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
            }
        } catch (error) {
            console.error("Error listing trips:", error);
            await this.bot.sendMessage(chatId, getTranslation("listErrorMessage", language));
        }
    }

    private async handleStopCommand(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const language = msg.from?.language_code === 'pt-BR' ? 'pt-BR' : 'en';
        if (!userId) return;

        try {
            const trips = await AppDataSource.manager.find(Trip, {
                where: { userId, isActive: true },
                relations: ['flights'],
                order: { flights: { currentPrice: 'ASC' } }
            });

            if (trips.length === 0) {
                await this.bot.sendMessage(chatId, getTranslation("noActiveMonitorsToStopMessage", language));
                return;
            }

            const keyboard = trips.map((trip, index) => [{
                text: `${index + 1}. ${trip.flights[0].origin} → ${trip.flights[0].destination} (${trip.date})`,
                callback_data: `stop_${trip.id}`
            }]);

            await this.bot.sendMessage(chatId,
                getTranslation("stopMonitorPrompt", language),
                {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );
        } catch (error) {
            console.error("Error listing trips for stop command:", error);
            await this.bot.sendMessage(chatId, getTranslation("listErrorMessage", language));
        }
    }

    private async stopMonitoring(chatId: number, userId: number, tripId: number, language: string) {
        try {
            const trip = await AppDataSource.manager.findOne(Trip, {
                where: { id: tripId, userId },
                relations: ['flights']
            });

            if (!trip) {
                await this.bot.sendMessage(chatId, getTranslation("noMonitorFoundMessage", language));
                return;
            }

            trip.isActive = false;
            await AppDataSource.manager.save(trip);

            await this.bot.sendMessage(chatId,
                getTranslation("stoppedMonitoringMessage", language, { origin: trip.flights[0].origin, destination: trip.flights[0].destination, date: trip.date })
            );
        } catch (error) {
            console.error("Error stopping flight monitor:", error);
            await this.bot.sendMessage(chatId, getTranslation("stopErrorMessage", language));
        }
    }
}
