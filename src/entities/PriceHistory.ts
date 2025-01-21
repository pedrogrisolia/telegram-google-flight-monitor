import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { Trip } from "./Trip";

@Entity()
export class PriceHistory {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Trip, trip => trip.priceHistory, { onDelete: 'CASCADE' })
    trip!: Trip;

    @Column("float")
    price!: number;

    @CreateDateColumn()
    timestamp!: Date;
}
