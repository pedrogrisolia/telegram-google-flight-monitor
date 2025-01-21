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
    poolSize: 10,
    extra: {
        connectionLimit: 10,
        keepAliveInitialDelay: 10000,
        enableKeepAlive: true
    },
    ssl: {
        rejectUnauthorized: false
    },
    logging: ["error"],
    migrations: [],
    subscribers: []
});
