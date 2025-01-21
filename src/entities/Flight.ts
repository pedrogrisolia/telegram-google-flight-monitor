import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";
import { Trip } from "./Trip";
import { PriceHistory } from "./PriceHistory";

export interface StopDetails {
    airport: string;
    airportName: string;
    duration: string;
}

@Entity()
export class Flight {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Trip, trip => trip.flights, { onDelete: 'CASCADE' })
    trip!: Trip;

    @Column()
    origin!: string;

    @Column()
    destination!: string;

    @Column()
    departureTime!: string;

    @Column()
    arrivalTime!: string;

    @Column()
    duration!: string;

    @Column()
    airline!: string;

    @Column()
    stops!: string;

    @Column("float")
    currentPrice!: number;

    @Column("float", { nullable: true })
    previousPrice?: number;

    @Column("float", { nullable: true })
    minPrice?: number;

    @Column("float", { nullable: true })
    maxPrice?: number;

    @OneToMany(() => PriceHistory, priceHistory => priceHistory.flight)
    priceHistory!: PriceHistory[];

    @Column({ default: 1 })
    passengers!: number;

    @Column("simple-json", { nullable: true })
    stopDetails?: StopDetails[];
}
