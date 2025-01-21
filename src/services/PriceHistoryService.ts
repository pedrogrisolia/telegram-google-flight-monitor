import { AppDataSource } from '../config/database';
import { Flight } from '../entities/Flight';
import { PriceHistory } from '../entities/PriceHistory';

export class PriceHistoryService {
    private flightRepository = AppDataSource.getRepository(Flight);
    private priceHistoryRepository = AppDataSource.getRepository(PriceHistory);

    async updatePriceHistory(flight: Flight, newPrice: number): Promise<void> {
        // Create new price history record
        const priceHistory = new PriceHistory();
        priceHistory.price = newPrice;
        priceHistory.flight = flight;
        await this.priceHistoryRepository.save(priceHistory);

        // Update min/max prices
        if (flight.minPrice === undefined || newPrice < flight.minPrice) {
            flight.minPrice = newPrice;
        }
        if (flight.maxPrice === undefined || newPrice > flight.maxPrice) {
            flight.maxPrice = newPrice;
        }

        // Update previous price
        flight.previousPrice = flight.currentPrice;
        flight.currentPrice = newPrice;

        await this.flightRepository.save(flight);
    }

    async getPriceHistory(flightId: number) {
        return await this.flightRepository
            .createQueryBuilder('flight')
            .leftJoinAndSelect('flight.priceHistory', 'priceHistory')
            .where('flight.id = :id', { id: flightId })
            .orderBy('priceHistory.timestamp', 'ASC')
            .getOne();
    }
}
