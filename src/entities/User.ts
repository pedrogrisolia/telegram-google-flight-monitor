import { Entity, Column, OneToMany } from "typeorm";
import { Trip } from "./Trip";

@Entity()
export class User {
  @Column({
    type: "bigint",
    nullable: true,
    transformer: {
      to: (value: number) => value.toString(),
      from: (value: string) => parseInt(value, 10),
    },
  })
  id!: number;

  @Column({ type: "varchar", length: 5, default: "en" })
  language!: string;

  @OneToMany(() => Trip, (trip) => trip.user)
  trips!: Trip[];
}
