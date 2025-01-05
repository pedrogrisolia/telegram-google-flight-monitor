import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { StopDetails } from "../services/GoogleFlightsService";

@Entity()
export class Flight {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: number;

    @Column()
    flightUrl!: string;

    @Column()
    origin!: string;

    @Column()
    destination!: string;

    @Column()
    date!: string;

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

    @Column()
    currentPrice!: number;

    @Column({ nullable: true })
    previousPrice?: number;

    @Column()
    passengers!: number;

    @Column()
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({ type: 'simple-json', nullable: true })
    stopDetails?: StopDetails[];
} 