import * as winstonX from 'orbiter-chaincore/src/packages/winstonX';
import path from 'path';
export class LoggerService {
  static services: { [key: string]: winstonX.LoggerType } = {};
  static createLogger(key: string, opts?: winstonX.WinstonXOptions) {
    let logDir = path.join(process.env.logDir || process.cwd()+ '/runtime', 'maker_logs');
    if (key) {
      logDir = path.join(logDir, key);
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
