import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface BridgeTransactionAttributes {
  id: number;
  transactionId?: string;
  sourceId?: string;
  targetId?: string;
  sourceChain?: number;
  targetChain?: number;
  sourceAmount?: number;
  targetAmount?: number;
  sourceMaker?: string;
  targetMaker?: string;
  sourceAddress?: string;
  targetAddress?: string;
  sourceSymbol?: string;
  targetSymbol?: string;
  status?: number;
  sourceTime?: Date;
  targetTime?: Date;
  targetFee?: number;
  targetFeeSymbol?: string;
  ruleId?: string;
  ebcId?: string;
  dealerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BridgeTransactionPk = "id";
export type BridgeTransactionId = BridgeTransaction[BridgeTransactionPk];
export type BridgeTransactionOptionalAttributes = "id" | "transactionId" | "sourceId" | "targetId" | "sourceChain" | "targetChain" | "sourceAmount" | "targetAmount" | "sourceMaker" | "targetMaker" | "sourceAddress" | "targetAddress" | "sourceSymbol" | "targetSymbol" | "status" | "sourceTime" | "targetTime" | "targetFee" | "targetFeeSymbol" | "ruleId" | "ebcId" | "dealerId" | "createdAt" | "updatedAt";
export type BridgeTransactionCreationAttributes = Optional<BridgeTransactionAttributes, BridgeTransactionOptionalAttributes>;

export class BridgeTransaction extends Model<BridgeTransactionAttributes, BridgeTransactionCreationAttributes> implements BridgeTransactionAttributes {
  id!: number;
  transactionId?: string;
  sourceId?: string;
  targetId?: string;
  sourceChain?: number;
  targetChain?: number;
  sourceAmount?: number;
  targetAmount?: number;
  sourceMaker?: string;
  targetMaker?: string;
  sourceAddress?: string;
  targetAddress?: string;
  sourceSymbol?: string;
  targetSymbol?: string;
  status?: number;
  sourceTime?: Date;
  targetTime?: Date;
  targetFee?: number;
  targetFeeSymbol?: string;
  ruleId?: string;
  ebcId?: string;
  dealerId?: string;
  createdAt?: Date;
  updatedAt?: Date;


  static initModel(sequelize: Sequelize.Sequelize): typeof BridgeTransaction {
    return BridgeTransaction.init({
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      comment: "ID"
    },
    transactionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "transcationId",
      unique: "trxid"
    },
    sourceId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    targetId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sourceChain: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    targetChain: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    sourceAmount: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    targetAmount: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    sourceMaker: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    targetMaker: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    sourceAddress: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    targetAddress: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    sourceSymbol: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    targetSymbol: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: true,
      comment: "0=pending,1=fail,99=success"
    },
    sourceTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    targetTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    targetFee: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    targetFeeSymbol: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    ruleId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    ebcId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    dealerId: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'BridgeTransaction',
    timestamps: true,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
      {
        name: "trxid",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "transactionId" },
        ]
      },
      {
        name: "sourceId",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "sourceId" },
          { name: "sourceChain" },
        ]
      },
      {
        name: "sourceMaker",
        using: "BTREE",
        fields: [
          { name: "sourceMaker" },
          { name: "status" },
        ]
      },
      {
        name: "sourceAddress",
        using: "BTREE",
        fields: [
          { name: "sourceAddress" },
          { name: "status" },
        ]
      },
    ]
  });
  }
}
