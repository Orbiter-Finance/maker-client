import client, { Channel, Connection } from 'amqplib';

export async function init(
  host: string | undefined = process.env['RABBIT_HOST']
) {
  const connection: Connection = await client.connect(String(host));
  // Create a channel
  const channel: Channel = await connection.createChannel();

  // Makes the queue available to the client
  // await channel.assertQueue(rabbit_queue_name, {
  //   durable: true,
  // });

  //Send a message to the queue
  return {
    connection,
    channel,
  };
}
