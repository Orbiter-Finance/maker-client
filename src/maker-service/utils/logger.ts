import * as winstonX from 'orbiter-chaincore/src/packages/winstonX';
import path from 'path';
export class LoggerService {
    static services: { [key: string]: any } = {};
    static createLogger(key: string, opts?: winstonX.WinstonXOptions) {
        const logger = winstonX.createLogger(Object.assign({
            logDir: path.join('runtime', key),
            telegram: {
                token: process.env["TELEGRAM_TOKEN"],
                chatId: process.env["TELEGRAM_CHATID"]
            }
        }, opts))
        LoggerService.services[key] = logger;
        return logger;
    }
    static getLogger(key: string, opts?: winstonX.WinstonXOptions) {
        return (
            LoggerService.services[key] ||
            LoggerService.createLogger(key, opts)
        );
    }
}