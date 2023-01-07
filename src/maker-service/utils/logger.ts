import * as winstonX from 'orbiter-chaincore/src/packages/winstonX';
// import {LoggerService as LoggerService2} from 'orbiter-chaincore/src/utils/logger';
import path from 'path';
import { transports } from 'winston';
export class LoggerService {
    static services: { [key: string]: any } = {};
    static createLogger(key: string, opts?: winstonX.WinstonXOptions) {
        // const logger = LoggerService2.createLogger();
        const logDir = path.join(process.env['logDir'] || "runtime");
        opts = Object.assign({
            logDir: path.join(logDir, key),
            debug: true,
            // logstash: {
            //     port: process.env["logstash.port"],
            //     level: "info",
            //     node_name: 'maker-client',
            //     host: process.env["logstash.host"],
            // },
            telegram: {
                token: process.env["TELEGRAM_TOKEN"],
                chatId: process.env["TELEGRAM_CHATID"]
            }
        }, opts)
        const logger = winstonX.createLogger(opts);
        logger.exceptions.handle(
            new transports.File({ filename: path.join(logDir, 'exceptions.log') })
        );
        LoggerService.services[key] = logger;
        return logger;
    }
    static getLogger(key: string, opts?: winstonX.WinstonXOptions): winstonX.LoggerType {
        return (
            LoggerService.services[key] ||
            LoggerService.createLogger(key, opts)
        );
    }
}