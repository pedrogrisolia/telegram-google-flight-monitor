import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Trip } from "./Trip";

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

    @Column({ default: 1 })
    passengers!: number;

    @Column("simple-json", { nullable: true })
    stopDetails?: StopDetails[];
} 