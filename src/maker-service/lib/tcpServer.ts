import Context from '../context';
import net from 'net';
import { isEmpty } from 'orbiter-chaincore/src/utils/core';
const port = 8000;
export function startInjectTCP(ctx: Context) {
    const server = new net.Server();
    // The server listens to a socket for a client to make a connection request.
    // Think of a socket as an end point.
    server.listen(port, function () {
        ctx.logger.info(`TCP Server listening for connection requests on socket localhost:${port}`);
    });
    const keys = ctx.config["keys"];
    // When a client requests a connection with the server, the server creates a new
    // socket dedicated to that client.
    let prevPrint = 0;
    server.on('connection', function (socket) {
        ctx.logger.info(`TCP Server Client connection`);
        // Now that a TCP connection has been established, the server can send data to
        // the client by writing to its socket.
        // The server can also receive data from the client by reading from its socket.
        socket.on('data', (chunk) => {
            try {
                const printLog = Date.now() - prevPrint >=1000 * 60 * 5;
                const data = JSON.parse(chunk.toString());
                for (const addr in data) {
                    if(!isEmpty(data[addr])) {
                        keys[addr.toLocaleLowerCase()] = data[addr];
                    }
                    if (printLog) {
                        ctx.logger.info(`Wallet ${addr} Inject key success`);
                        prevPrint = Date.now();
                    }
                }
            } catch (error) {
                ctx.logger.error('TCP Server receive handle error:', {data: chunk.toString()});
            }
        });

        // When the client requests to end the TCP connection with the server, the server
        // ends the connection.
        socket.on('end', () => {
            ctx.logger.error('TCP Server Closing connection with the client...');
        });

        // Don't forget to catch error, for your own sake.
        socket.on('error', (err) => {
            ctx.logger.error('TCP Server error', err);
        });
    });
}
