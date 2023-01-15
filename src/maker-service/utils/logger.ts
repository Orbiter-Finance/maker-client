import * as winstonX from 'orbiter-chaincore/src/packages/winstonX';
// import {LoggerService as LoggerService2} from 'orbiter-chaincore/src/utils/logger';
import path from 'path';
export class LoggerService {
    static services: { [key: string]: any } = {};
    static createLogger(key: string, opts?: winstonX.WinstonXOptions) {
        let logDir:undefined | string =  undefined;
        if (key) {
            logDir = path.join(process.cwd(),'runtime', 'logs', key);
        }
        opts = Object.assign({
            logDir,
            label: key,
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