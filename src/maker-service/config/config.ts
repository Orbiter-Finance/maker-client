import * as dotenv from 'dotenv';
const dotEnvs = dotenv.config().parsed;
const vars = process.env;
export default {
  1: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasLimitMultiple: 2,
    swapAnswerGasPriceMultiple: 1,
    maxGasPrice: 85000000000,
  },
  2: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 2000000,
    swapAnswerGasLimitMultiple: 1.5,
    maxGasPrice: 180000000000
  },
  22: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 2000000,
    swapAnswerGasLimitMultiple: 1.5,
    maxGasPrice: 180000000000
  },
  5: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasLimitMultiple: 2,
    swapAnswerGasPriceMultiple: 1,
    maxGasPrice: 85000000000,
  },
  6: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasPriceMultiple: 2,
    minGasPrice: 100000000000,
    maxGasPrice: 180000000000
  },
  66: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasPriceMultiple: 2,
    minGasPrice: 100000000000,
    maxGasPrice: 180000000000
  },
  15: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasPriceMultiple: 1.1,
    minGasPrice: 5500000000,
  },
  515: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    swapAnswerGasPriceMultiple: 1.1,
    minGasPrice: 5500000000,
  },
  7: {
    maxTxCount: 10,
    // swapAnswerGasLimit: 100000,
    maxGasPrice: 180000000000
  },
  77: {
    maxTxCount: 10,
    maxGasPrice: 180000000000
    // swapAnswerGasLimit: 100000,

  },

  development: {
    dialect: 'mysql',
    host: vars['MYSQL_DB_HOST'] || 'localhost',
    database: vars['MYSQL_DB_NAME'] || 'ob',
    username: vars['MYSQL_DB_USERNAME'] || 'root',
    password: vars['MYSQL_DB_PASSWORD'] || 'root',
    port: Number(vars['MYSQL_DB_PORT'] || '3306'),
    logging: true,
    timezone: '+00:00',
  },
  test: {
    dialect: 'mysql',
    database: vars['MYSQL_DB_NAME'] || 'ob',
    username: vars['MYSQL_DB_USERNAME'] || 'root',
    password: vars['MYSQL_DB_PASSWORD'] || 'root',
    host: vars['MYSQL_DB_HOST'] || 'localhost',
    logging: false,
    port: Number(vars['MYSQL_DB_PORT'] || '3306'),
    timezone: '+00:00',
  },
  production: {
    dialect: 'mysql',
    database: vars['MYSQL_DB_NAME'],
    username: vars['MYSQL_DB_USERNAME'],
    password: vars['MYSQL_DB_PASSWORD'],
    host: vars['MYSQL_DB_HOST'],
    port: Number(vars['MYSQL_DB_PORT']),
    logging: false,
    timezone: '+00:00',
  },
  keys: {
  },
  RABBIT_PORT: vars["RABBIT_PORT"],
  RABBIT_HOST: vars["RABBIT_HOST"],
  RABBIT_USER: vars["RABBIT_USER"],
  RABBIT_PASSWORD: vars["RABBIT_PASSWORD"],
  RABBIT_VHOST: vars["RABBIT_VHOST"],
  ENABLE_AUTO_PAYMENT_CHAINS: vars["ENABLE_AUTO_PAYMENT_CHAINS"]
};
