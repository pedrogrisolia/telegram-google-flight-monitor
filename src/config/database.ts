import { DataSource } from "typeorm";
import path from "path";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import { Flight } from "../entities/Flight";
import { PriceHistory } from "../entities/PriceHistory";
import { CarRental } from "../entities/CarRental";
import { CarPriceHistory } from "../entities/CarPriceHistory";
import * as dotenv from "dotenv";

dotenv.config();

const databasePath = process.env.DB_PATH ?? "./data/flights.db";
const resolvedDatabasePath = path.resolve(process.cwd(), databasePath);

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: resolvedDatabasePath,
  synchronize: true,
  logging: false,
  entities: [User, Trip, Flight, PriceHistory, CarRental, CarPriceHistory],
});
