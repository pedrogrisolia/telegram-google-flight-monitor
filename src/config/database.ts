import { DataSource } from "typeorm";
import { Flight } from "../entities/Flight";
import * as path from "path";

export const AppDataSource = new DataSource({
    type: "sqlite",
    database: process.env.DB_PATH || path.join(__dirname, "../../data/flights.db"),
    entities: [Flight],
    synchronize: true,
    logging: false
}); 