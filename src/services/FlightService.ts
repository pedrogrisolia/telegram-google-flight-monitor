import { AppDataSource } from '../config/database';
import { Flight } from '../entities/Flight';

export class FlightService {
    private flightRepository = AppDataSource.getRepository(Flight);

    async findOrCreateFlight(details: {
        origin: string;
        destination: string;
        departureTime: string;
    }) {
        let flight = await this.flightRepository.findOne({
            where: {
                origin: details.origin,
                destination: details.destination,
                departureTime: details.departureTime
            }
        });

        if (!flight) {
            flight = new Flight();
            flight.origin = details.origin;
            flight.destination = details.destination;
            flight.departureTime = details.departureTime;
        }

        return flight;
    }

    async updateFlightDetails(flight: Flight, details: {
        arrivalTime: string;
        duration: string;
        airline: string;
        stops: string;
        stopDetails?: any[];
    }) {
        flight.arrivalTime = details.arrivalTime;
        flight.duration = details.duration;
        flight.airline = details.airline;
        flight.stops = details.stops;
        flight.stopDetails = details.stopDetails;
        
        return await this.flightRepository.save(flight);
    }
}
