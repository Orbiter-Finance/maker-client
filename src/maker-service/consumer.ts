import { Channel, connect, Connection, ConsumeMessage } from 'amqplib';
import { chains } from 'orbiter-chaincore/src/utils';

import type Context from './context';
import { Transaction } from './models/Transactions';
export default class Consumer {
  private connection?: Connection;
  private channels: { [key: string]: Channel } = {};
  constructor(public readonly ctx: Context) {
    void this.connectionMqServer();
  }
  public async connectionMqServer(): Promise<void> {
    this.connection = await connect({
      protocol: 'amqp',
      hostname: this.ctx.config.RABBIT_HOST || 'localhost',
      port: Number(this.ctx.config.RABBIT_PORT || 5672),
      username: this.ctx.config.RABBIT_USER,
      password: this.ctx.config.RABBIT_PASSWORD
    });
    this.ctx.logger.info(
      'RabbitMQ Connection Success:',
      this.connection.connection.serverProperties
    );
    const channel = await this.connection.createChannel();
    const exchangeName = 'chaincore_txs';
    await channel.assertExchange(exchangeName, 'direct', {
      durable: true,
    });
    // this.channel = channel;
    const chainsList = chains.getAllChains();
    for (const chain of chainsList) {
      const channel = await this.connection.createChannel();
      await channel.assertExchange(exchangeName, 'direct', {
        durable: true,
      });
      const queueName = `chaincore:${chain.internalId}`;
      const routingKey = chain.internalId;
      await channel.assertQueue(queueName, {
        autoDelete: false,
        durable: true,
      });
      await channel.bindQueue(queueName, exchangeName, routingKey);
      await channel.prefetch(1, false);
      this.channels[chain.internalId] = channel;
      void this.subscribe(chain.internalId, queueName);
    }
    const handleDisconnections = (e: any) => {
      try {
        this.ctx.logger.error(`handleDisconnections`, e);
        this.connection && this.connection.close();
        // void this.channel.close();
        void this.connectionMqServer();
      } catch (error) {
        this.ctx.logger.error(`handleDisconnections error`, error);
      }
    };
    this.connection.on('disconnect', handleDisconnections);
    this.connection.on('reconnect', handleDisconnections);
    this.connection.on('error', handleDisconnections);
  }

  public async subscribe(chainId: string, queueName: string) {
    const channel = this.channels[chainId];
    const messageHandle = async (msg: ConsumeMessage | null) => {
      let hash = '';
      if (msg) {
        const tx = JSON.parse(msg.content.toString()) as Transaction;
        hash = tx.hash;
        this.ctx.logger.info(`subscribe tx:${tx.hash}`);
        if (tx) {
          const swapOrder = await this.ctx.validator.verifyFromTx(tx);
          if (swapOrder) {
            this.ctx.logger.info(`swapOrder:`, { swapOrder: swapOrder })
            await this.ctx.sequencer.push(swapOrder);
          } else {
            // msg && await channel.ack(msg);
          }
        }
      }
      // ack
      msg && await channel.ack(msg);

    }
    await channel.consume(
      queueName,
      messageHandle,
      { noAck: false }
    );
  }
}
