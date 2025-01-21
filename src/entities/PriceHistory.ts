import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Flight } from "./Flight";

@Entity()
export class PriceHistory {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Flight, flight => flight.priceHistory, { onDelete: 'CASCADE' })
    flight!: Flight;

    @Column("float")
    price!: number;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    timestamp!: Date;
}
