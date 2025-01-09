import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from "typeorm";
import { Flight } from "./Flight";
import { User } from "./User";

@Entity()
export class Trip {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: number;

    @ManyToOne(() => User)
    user!: User;

    @Column()
    url!: string;

    @Column()
    date!: string;

    @Column({ default: true })
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @OneToMany(() => Flight, flight => flight.trip, { cascade: true })
    flights!: Flight[];
} 