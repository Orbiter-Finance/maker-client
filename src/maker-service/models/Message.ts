import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';
export class Message extends Model<
  InferAttributes<Message>,
  InferCreationAttributes<Message>
> {
  declare id: CreationOptional<number>;
  declare msgId: string;
  declare content: string;
  declare reply: string;
  declare status: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Message {
    return Message.init(
      {
        id: {
          autoIncrement: true,
          type: DataTypes.BIGINT,
          allowNull: false,
          primaryKey: true,
          comment: 'ID',
        },
        msgId: {
          type: DataTypes.STRING(100),
          comment: 'msgId',
          unique: true,
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: 'content',
        },
        reply: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: 'reply',
        },
        status: {
          type: DataTypes.TINYINT,
          allowNull: false,
          defaultValue: 0,
          comment: 'status:0=PENDING,1=COMPLETE,2=REJECT',
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
        tableName: 'message',
        timestamps: true,
        indexes: [],
      }
    );
  }
}
