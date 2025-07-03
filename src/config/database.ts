import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import { Flight } from "../entities/Flight";
import { PriceHistory } from "../entities/PriceHistory";
import { CarRental } from "../entities/CarRental";
import { CarPriceHistory } from "../entities/CarPriceHistory";
import * as dotenv from "dotenv";

dotenv.config();

// Configuração SSL mais robusta
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  logging: false,
  entities: [User, Trip, Flight, PriceHistory, CarRental, CarPriceHistory],
  ssl: {
    rejectUnauthorized: false,
  },
  connectTimeoutMS: 60000,
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
