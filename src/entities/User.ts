import { Entity, PrimaryColumn, OneToMany } from "typeorm";
import { Trip } from "./Trip";

@Entity()
export class User {
    @PrimaryColumn()
    id!: number;

    @OneToMany(() => Trip, trip => trip.user)
    trips!: Trip[];

    language?: string;
}
