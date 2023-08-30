import * as winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export function createLoggerByName(chainId: string) {
  const logger = winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.label({ label: chainId }),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, label }) => {
        return `${timestamp} ${label} [${level.toUpperCase()}]: ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console(),
      new DailyRotateFile({
        filename: `logs/${chainId}/app-%DATE%.log`,
        datePattern: "YYYY-MM-DD", //
        maxSize: "20m",
        maxFiles: "7d",
      }),
    ],
  });
  return logger;
}
