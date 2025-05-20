import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { User } from "./User";
import { CarPriceHistory } from "./CarPriceHistory";

@Entity()
export class CarRental {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "bigint",
    transformer: {
      to: (value: number) => value.toString(),
      from: (value: string) => parseInt(value, 10),
    },
  })
  userId!: number;

  @ManyToOne(() => User)
  user!: User;

  @Column()
  airportCode!: string;

  @Column()
  startDate!: string;

  @Column()
  endDate!: string;

  @Column({ nullable: true })
  url?: string;

  @Column("float")
  lastPrice!: number;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(
    () => CarPriceHistory,
    (history: CarPriceHistory) => history.carRental,
    {
      cascade: true,
    }
  )
  priceHistory!: CarPriceHistory[];
}
