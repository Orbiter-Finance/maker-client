import {
	Model, Table, Column, DataType, Index, Sequelize, ForeignKey
} from "sequelize-typescript";

export interface transfersAttributes {
	id?: string;
	chainId?: string;
	hash?: string;
	blockNumber?: number;
	sender?: string;
	receiver?: string;
	value?: string;
	amount?: string;
	token?: string;
	symbol?: string;
	fee?: string;
	feeAmount?: string;
	timestamp?: Date;
	status?: number;
	nonce?: string;
	opStatus?: number;
	contract?: string;
	selector?: string;
	signature?: string;
	calldata?: object;
	createdAt?: Date;
	updatedAt?: Date;
	version?: string;
	feeToken?: string;
}

@Table({
	tableName: "transfers",
	timestamps: true
})
export class TransfersModel extends Model<transfersAttributes, transfersAttributes> implements transfersAttributes {

	@Column({
		primaryKey: true,
		type: DataType.BIGINT,
		defaultValue: Sequelize.literal("nextval('transfers_id_seq'::regclass)")
	})
	@Index({
		name: "transfers_pkey",
		using: "btree",
		unique: true
	})
	id?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(20)
	})
	@Index({
		name: "transfers_chainId_hash_idx",
		using: "btree",
		unique: true
	})
	chainId?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(255)
	})
	@Index({
		name: "transfers_chainId_hash_idx",
		using: "btree",
		unique: true
	})
	hash?: string;

	@Column({
		allowNull: true,
		type: DataType.BIGINT
	})
	blockNumber?: number;

	@Column({
		allowNull: true,
		type: DataType.STRING(100)
	})
	@Index({
		name: "transfers_sender_idx",
		using: "btree",
		unique: false
	})
	sender?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(100)
	})
	@Index({
		name: "transfers_receiver_idx",
		using: "btree",
		unique: false
	})
	receiver?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(255)
	})
	value?: string;

	@Column({
		allowNull: true,
		type: DataType.DECIMAL
	})
	amount?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(100)
	})
	token?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(20)
	})
	symbol?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(255)
	})
	fee?: string;

	@Column({
		allowNull: true,
		type: DataType.DECIMAL(64, 18)
	})
	feeAmount?: string;

	@Column({
		allowNull: true,
		type: DataType.DATE
	})
	timestamp?: Date;

	@Column({
		allowNull: true,
		type: DataType.INTEGER
	})
	@Index({
		name: "transfers_status_idx",
		using: "btree",
		unique: false
	})
	status?: number;

	@Column({
		allowNull: true,
		type: DataType.BIGINT
	})
	nonce?: string;

	@Column({
		allowNull: true,
		type: DataType.INTEGER,
		defaultValue: Sequelize.literal("0")
	})
	@Index({
		name: "transfers_opStatus_idx",
		using: "btree",
		unique: false
	})
	opStatus?: number;

	@Column({
		allowNull: true,
		type: DataType.STRING(100)
	})
	contract?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(255)
	})
	selector?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(255)
	})
	signature?: string;

	@Column({
		allowNull: true,
		type: DataType.JSONB
	})
	calldata?: object;

	@Column({
		allowNull: true,
		type: DataType.DATE
	})
	createdAt?: Date;

	@Column({
		allowNull: true,
		type: DataType.DATE
	})
	updatedAt?: Date;

	@Column({
		allowNull: true,
		type: DataType.STRING(10)
	})
	version?: string;

	@Column({
		allowNull: true,
		type: DataType.STRING(100)
	})
	feeToken?: string;

}