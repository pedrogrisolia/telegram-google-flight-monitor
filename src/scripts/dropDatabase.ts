import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppDataSource } from "../config/database";

async function dropSchema() {
  try {
    const config = { ...AppDataSource.options, synchronize: false };
    const dataSource = new DataSource(config);
    await dataSource.initialize();
    console.log("Dropping database schema...");
    await dataSource.dropDatabase();
    console.log("Database dropped successfully.");
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Error during schema drop:", error);
    process.exit(1);
  }
}

dropSchema();
