import { Entity, PrimaryColumn, Column, OneToMany } from "typeorm";
import { Trip } from "./Trip";

@Entity()
export class User {
    @PrimaryColumn()
    id!: number;

    @Column({ type: 'varchar', length: 5, default: 'en' })
    language!: string;

    @OneToMany(() => Trip, trip => trip.user)
    trips!: Trip[];
}
