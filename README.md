# Flight Price Monitor Telegram Bot

A Telegram bot that monitors flight prices using Google's Gemini AI and notifies users when prices change.

## Features

- Monitor flight prices for specific routes
- Automatic price checks every 30 minutes (configurable)
- User-friendly interface with inline buttons
- Price change notifications (increases and decreases)
- Support for multiple flight monitors per user

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Google Gemini API Key
- Banco de dados local SQLite (arquivo em `DB_PATH`)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd telegram-flight-monitor-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
GEMINI_API_KEY=your_gemini_api_key_here
DB_PATH=./data/flights.db
CHECK_INTERVAL=30
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Start the bot:
```bash
npm start
```

## Docker Compose

1. Certifique-se de ter o arquivo `.env` na raiz do projeto.
2. Suba o serviço:
```bash
docker compose up --build
```

## Usage

1. Start a chat with your bot on Telegram
2. Use the following commands:
   - `/start` - Get started with the bot
   - `/monitor` - Start monitoring a new flight
   - `/stop` - Stop monitoring a flight

When setting up a new flight monitor, the bot will ask for:
1. Origin city (not airport code)
2. Destination city (not airport code)
3. Travel date (YYYY-MM-DD format)
4. Number of passengers

The bot will then:
1. Fetch initial flight prices
2. Store the information
3. Monitor for price changes
4. Send notifications when prices change

## Development

- `npm run dev` - Run in development mode with hot reload
- `npm run build` - Build the TypeScript code
- `npm start` - Run the built code

## License

MIT 