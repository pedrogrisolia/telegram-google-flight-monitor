import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from "typeorm";
import { Flight } from "./Flight";
import { User } from "./User";
import { PriceHistory } from "./PriceHistory";

@Entity()
export class Trip {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: {
      to: (value: number) => value.toString(),
      from: (value: string) => parseInt(value, 10),
    },
  })
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

  @OneToMany(() => Flight, (flight) => flight.trip, { cascade: true })
  flights!: Flight[];

  @OneToMany(() => PriceHistory, (priceHistory) => priceHistory.trip, {
    cascade: true,
  })
  priceHistory!: PriceHistory[];
}