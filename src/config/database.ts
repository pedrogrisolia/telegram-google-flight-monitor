import { DataSource } from "typeorm";
import { Flight } from "../entities/Flight";

export const AppDataSource = new DataSource({
    type: "mysql",
    url: process.env.MYSQL_URL,
    entities: [Flight],
    synchronize: true,
    logging: false,
    ssl: {
        rejectUnauthorized: false
    }
}); 