import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import { Flight } from "../entities/Flight";
import { PriceHistory } from "../entities/PriceHistory";

export const AppDataSource = new DataSource({
    type: "mysql",
    url: process.env.MYSQL_URL,
    synchronize: true,
    entities: [User, Trip, Flight, PriceHistory],
    ssl: {
        rejectUnauthorized: false
    }
}); 