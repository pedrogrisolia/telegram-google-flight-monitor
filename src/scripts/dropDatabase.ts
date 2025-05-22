import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppDataSource } from "../config/database";

async function dropSchema() {
  try {
    const config = { ...AppDataSource.options, synchronize: false };
    const dataSource = new DataSource(config);
    await dataSource.initialize();
    console.log("Dropping all tables in public schema...");
    const tables: { tablename: string }[] = await dataSource.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`
    );
    for (const { tablename } of tables) {
      console.log(`Dropping table "${tablename}"...`);
      await dataSource.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE;`);
    }
    console.log("All tables dropped successfully.");
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Error during schema drop:", error);
    process.exit(1);
  }
}

dropSchema();
