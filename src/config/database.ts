import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Trip } from "../entities/Trip";
import { Flight } from "../entities/Flight";

export const AppDataSource = new DataSource({
    type: "mysql",
    url: process.env.MYSQL_URL,
    synchronize: true,
    logging: true,
    entities: [User, Trip, Flight],
    ssl: {
        rejectUnauthorized: false
    }
}); 