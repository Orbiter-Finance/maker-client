import { Json } from './../types/index';
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from 'sequelize';
export class Sequencer extends Model<
    InferAttributes<Sequencer>,
    InferCreationAttributes<Sequencer>
> {
    declare id: CreationOptional<number>;
    declare hash: string;
    declare from: string;
    declare to: string;
    declare status: number;
    declare chainId: number;
    declare transactions: JSON;
    declare transactionCount: number;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Sequencer {
        return Sequencer.init(
            {
                id: {
                    autoIncrement: true,
                    type: DataTypes.BIGINT,
                    allowNull: false,
                    primaryKey: true,
                    comment: 'ID',
                },
                hash: {
                    type: DataTypes.STRING(100),
                    comment: 'hash',
                    unique: true,
                },
                from: {
                    type: DataTypes.STRING(100),
                    comment: 'from',
                },
                to: {
                    type: DataTypes.STRING(100),
                    comment: 'to',
                },
                status: {
                    type: DataTypes.TINYINT,
                    allowNull: false,
                    defaultValue: 0,
                    comment: 'status:0=PENDING,1=COMPLETE,2=REJECT',
                },
                chainId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: 'chainId',
                },
                transactions: {
                    type: DataTypes.JSON,
                    allowNull: false,
                    comment: 'transactions',
                },
                transactionCount: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: 'transactionCount',
                },
                createdAt: {
                    type: DataTypes.DATE,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                },
            },
            {
                sequelize,
                tableName: 'sequencer',
                timestamps: true,
                indexes: [],
            }
        );
    }
}
