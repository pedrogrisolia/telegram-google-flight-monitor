import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { CarRental } from "./CarRental";

@Entity()
export class CarPriceHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => CarRental, (rental) => rental.priceHistory, {
    onDelete: "CASCADE",
  })
  carRental!: CarRental;

  @Column("float")
  price!: number;

  @CreateDateColumn()
  timestamp!: Date;
}
