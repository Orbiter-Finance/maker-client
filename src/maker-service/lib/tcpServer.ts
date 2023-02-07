import Context from '../context';
import net from 'net';
const port = 8000;
export function startInjectTCP(ctx: Context) {
    const server = new net.Server();
    // The server listens to a socket for a client to make a connection request.
    // Think of a socket as an end point.
    server.listen(port, function () {
        console.log(`Server listening for connection requests on socket localhost:${port}`);
    });
    const keys = ctx.config["keys"];
    // When a client requests a connection with the server, the server creates a new
    // socket dedicated to that client.
    server.on('connection', function (socket) {
        // Now that a TCP connection has been established, the server can send data to
        // the client by writing to its socket.
        // The server can also receive data from the client by reading from its socket.
        socket.on('data', (chunk) => {
            try {
                const data = JSON.parse(chunk.toString());
                for (const addr in data) {
                    keys[addr.toLocaleLowerCase()] = data[addr];
                    ctx.logger.info(`Wallet ${addr} Inject key success`)
                }
            } catch (error) {
                ctx.logger.error('tcp receive handle error:', {data: chunk.toString()});
            }
        });

        // When the client requests to end the TCP connection with the server, the server
        // ends the connection.
        socket.on('end', () => {
            ctx.logger.error('tcp server Closing connection with the client...');
        });

        // Don't forget to catch error, for your own sake.
        socket.on('error', (err) => {
            ctx.logger.error('tcp server error', err);
        });
    });
}
