import TelegramBot from "node-telegram-bot-api";
import { AppDataSource } from "../config/database";
import { Flight } from "../entities/Flight";
import * as dotenv from "dotenv";
import { FlightDetails, GoogleFlightsService } from "./GoogleFlightsService";

dotenv.config();

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
        await this.bot.sendMessage(chatId, 
            "Welcome to the Flight Price Monitor Bot! 🛫\n\n" +
            "I can help you monitor flight prices and notify you when they change.\n\n" +
            "Use /monitor to start monitoring a new flight\n" +
            "Use /stop to stop monitoring flights"
        );
    }

    private async startMonitoring(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (!userId) return;

        await this.bot.sendMessage(chatId, 
            "Let's set up flight monitoring! 🛫\n\n" +
            "Please send me the Google Flights URL for the flight you want to monitor.\n" +
            "Make sure it's a valid Google Flights search URL with your desired route and date."
        );
        this.userStates.set(userId, { step: "AWAITING_URL" });
    }

    private async handleMessage(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (!userId) return;

        const state = this.userStates.get(userId);
        if (!state) return;

        if (state.step === "AWAITING_URL") {
            if (!msg.link_preview_options?.url) {
                await this.bot.sendMessage(chatId, 
                    "Please send a valid Google Flights URL.\n" +
                    "Make sure you're copying the entire URL from your browser."
                );
                return;
            }

            const url = msg.link_preview_options.url;
            await this.setupFlightMonitoring(chatId, userId, url);
            this.userStates.delete(userId);
        }
    }

    private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
        if (!query.message || !query.from.id || !query.data) return;

        const chatId = query.message.chat.id;
        const userId = query.from.id;

        if (query.data.startsWith('stop_')) {
            const flightId = parseInt(query.data.split('_')[1]);
            await this.stopMonitoring(chatId, userId, flightId);
        }
    }

    private async setupFlightMonitoring(
        chatId: number,
        userId: number,
        url: string
    ) {
        try {
            await this.bot.sendMessage(chatId, "Fetching flight information...");
            
            const flights = await GoogleFlightsService.getFlightPricesFromUrl(url);
            
            for (const flightInfo of flights) {
                const flight = new Flight();
                flight.userId = userId;
                flight.flightUrl = flightInfo.successfulUrl || url;  // Store the successful URL
                flight.origin = flightInfo.origin;
                flight.destination = flightInfo.destination;
                flight.date = flightInfo.date;
                flight.departureTime = flightInfo.departureTime;
                flight.arrivalTime = flightInfo.arrivalTime;
                flight.duration = flightInfo.duration;
                flight.airline = flightInfo.airline;
                flight.stops = flightInfo.stops;
                flight.currentPrice = flightInfo.price;
                flight.isActive = true;
                flight.passengers = 1;  // Default value

                await AppDataSource.manager.save(flight);
            }

            await this.bot.sendMessage(chatId,
                "✅ Flight monitoring has been set up! Monitoring these flights:\n\n" +
                flights.map((flight, index) => this.formatFlightMessage(flight, index)).join('\n\n') +
                "\nI'll notify you when any of these prices change!",
                { parse_mode: "Markdown" }  // Enable markdown parsing for hyperlinks
            );
        } catch (error) {
            console.error("Error setting up flight monitoring:", error);
            await this.bot.sendMessage(chatId,
                "Sorry, there was an error setting up flight monitoring. " +
                "Please make sure you're sending a valid Google Flights URL and try again."
            );
        }
    }

    private async stopMonitoring(chatId: number, userId: number, flightId?: number) {
        try {
            if (flightId) {
                // Stop specific flight
                const flight = await AppDataSource.manager.findOne(Flight, { 
                    where: { id: flightId, userId: userId }
                });
                
                if (flight) {
                    flight.isActive = false;
                    await AppDataSource.manager.save(flight);
                    await this.bot.sendMessage(chatId, "Flight monitoring stopped successfully!");
                }
            } else {
                // Show list of flights to stop
                const flights = await AppDataSource.manager.find(Flight, {
                    where: { userId, isActive: true }
                });

                if (flights.length === 0) {
                    await this.bot.sendMessage(chatId, "You don't have any active flight monitors.");
                    return;
                }

                const keyboard = flights.map(flight => [{
                    text: `${flight.origin} → ${flight.destination} (${flight.date})`,
                    callback_data: `stop_${flight.id}`
                }]);

                await this.bot.sendMessage(chatId,
                    "Select the flight monitor you want to stop:",
                    {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    }
                );
            }
        } catch (error) {
            console.error("Error stopping flight monitoring:", error);
            await this.bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
        }
    }

    async checkPriceUpdates() {
        try {
            const activeFlights = await AppDataSource.manager.find(Flight, {
                where: { isActive: true }
            });
            console.log(`Starting price check for ${activeFlights.length} active flights...`);

            // Group flights by URL to avoid multiple requests to the same URL
            const flightsByUrl = new Map<string, Flight[]>();
            activeFlights.forEach(flight => {
                const flights = flightsByUrl.get(flight.flightUrl) || [];
                flights.push(flight);
                flightsByUrl.set(flight.flightUrl, flights);
            });

            for (const [url, flights] of flightsByUrl) {
                console.log(`Checking prices for URL: ${url} (${flights.length} flights)`);
                const currentFlights = await GoogleFlightsService.getFlightPricesFromUrl(url);
                
                // If we got a different successful URL, update all flights with this URL
                const successfulUrl = currentFlights[0]?.successfulUrl;
                if (successfulUrl && successfulUrl !== url) {
                    console.log(`Updating URL for ${flights.length} flights from ${url} to ${successfulUrl}`);
                    for (const flight of flights) {
                        flight.flightUrl = successfulUrl;
                    }
                }
                
                for (const flight of flights) {
                    const updatedFlight = currentFlights.find(f => 
                        f.departureTime === flight.departureTime && 
                        f.arrivalTime === flight.arrivalTime &&
                        f.airline === flight.airline
                    );

                    if (!updatedFlight) {
                        console.log(`Flight not found: ${flight.airline} ${flight.departureTime}-${flight.arrivalTime}`);
                        continue;
                    }

                    if (updatedFlight.price !== flight.currentPrice) {
                        console.log(`Price change detected for flight ${flight.id}: ${flight.currentPrice} -> ${updatedFlight.price}`);
                        await this.notifyPriceChange(flight, updatedFlight);
                    } else {
                        console.log(`No price change for flight ${flight.id}: ${flight.currentPrice}`);
                        // Even if price didn't change, save the flight if URL was updated
                        if (successfulUrl && successfulUrl !== url) {
                            await AppDataSource.manager.save(flight);
                        }
                    }
                }
            }
            console.log('Price check completed successfully');
        } catch (error) {
            console.error("Error checking price updates:", error);
        }
    }

    private async notifyPriceChange(oldFlight: Flight, newFlightInfo: FlightDetails) {
        try {
            const priceChange = newFlightInfo.price - oldFlight.currentPrice;
            const percentageChange = ((priceChange / oldFlight.currentPrice) * 100).toFixed(1);
            console.log(`Notifying user ${oldFlight.userId} about price ${priceChange > 0 ? 'increase' : 'decrease'} for flight ${oldFlight.id}`);
            
            const changeSymbol = priceChange > 0 ? "📈" : "📉";
            const changeText = priceChange > 0 ? "increased" : "decreased";

            await this.bot.sendMessage(oldFlight.userId,
                `${changeSymbol} Price Update for your monitored flight!\n\n` +
                `${oldFlight.airline}\n` +
                `${oldFlight.origin} → ${oldFlight.destination}\n` +
                `Date: ${oldFlight.date}\n` +
                `Time: ${oldFlight.departureTime} - ${oldFlight.arrivalTime}\n` +
                `Duration: ${oldFlight.duration}\n` +
                `Stops: ${oldFlight.stops}\n\n` +
                `The price has ${changeText} by R$ ${Math.abs(priceChange).toFixed(2)} (${Math.abs(Number(percentageChange))}%)\n` +
                `New price: R$ ${newFlightInfo.price.toFixed(2)}\n` +
                `Previous price: R$ ${oldFlight.currentPrice.toFixed(2)}\n` +
                `[View flight on Google](${oldFlight.flightUrl})`,
                { parse_mode: "Markdown" }  // Enable markdown parsing for hyperlinks
            );

            // Update flight information in database
            oldFlight.previousPrice = oldFlight.currentPrice;
            oldFlight.currentPrice = newFlightInfo.price;
            await AppDataSource.manager.save(oldFlight);

            console.log(`Successfully notified user ${oldFlight.userId} and updated flight ${oldFlight.id} in database`);
        } catch (error) {
            console.error(`Failed to notify user ${oldFlight.userId} about price change for flight ${oldFlight.id}:`, error);
        }
    }

    private async handleStopCommand(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (!userId) return;
        
        await this.stopMonitoring(chatId, userId);
    }

    private async handleListCommand(msg: TelegramBot.Message) {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (!userId) return;

        try {
            const flights = await AppDataSource.manager.find(Flight, {
                where: { userId, isActive: true }
            });

            if (flights.length === 0) {
                await this.bot.sendMessage(chatId, "You don't have any active flight monitors.");
                return;
            }

            // Send initial message
            await this.bot.sendMessage(chatId, `You have ${flights.length} active flight monitors:`);

            // Split flights into groups of 5
            const FLIGHTS_PER_MESSAGE = 5;
            for (let i = 0; i < flights.length; i += FLIGHTS_PER_MESSAGE) {
                const flightGroup = flights.slice(i, i + FLIGHTS_PER_MESSAGE);
                const message = flightGroup
                    .map((flight, index) => this.formatFlightMessage(flight, i + index))
                    .join('\n\n');
                
                await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            }
        } catch (error) {
            console.error("Error listing flights:", error);
            await this.bot.sendMessage(chatId, "Sorry, there was an error retrieving your flight monitors.");
        }
    }

    private formatFlightMessage(flight: Flight | FlightDetails, index?: number): string {
        let message = '';
        
        if (index !== undefined) {
            message += `Flight ${index + 1}:\n`;
        }
        
        message += `${flight.airline}\n` +
            `${flight.origin} → ${flight.destination}\n` +
            `Date: ${flight.date}\n` +
            `Time: ${flight.departureTime} - ${flight.arrivalTime}\n` +
            `Duration: ${flight.duration}\n` +
            `Stops: ${flight.stops}\n`;
            
        if (flight.stopDetails && flight.stopDetails.length > 0) {
            flight.stopDetails.forEach((stop, i) => {
                message += `Stop ${i + 1}: ${stop.airport} (${stop.airportName})\n` +
                          `Duration: ${stop.duration}\n`;
            });
        }
        
        message += `Current price: R$ ${('price' in flight ? flight.price : flight.currentPrice).toFixed(2)}`;

        // Add hyperlinked URL
        const url = 'successfulUrl' in flight ? flight.successfulUrl : 
                   'flightUrl' in flight ? flight.flightUrl : null;
        if (url) {
            message += `\n[View flight on Google](${url})`;
        }
        
        return message;
    }
} 