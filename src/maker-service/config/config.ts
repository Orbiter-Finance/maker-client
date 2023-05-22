import * as dotenv from 'dotenv';
const dotEnvs = dotenv.config().parsed;
const vars = process.env;
export default {
  1: {
    maxTxCount: 10,
    gasLimitMultiple: 1.1,
    swapAnswerGasLimit: 100000,
    maxGasPrice: 85000000000,
  },
  2: {
    maxTxCount: 10,
    gasLimitMultiple: 1.1,
    swapAnswerGasLimit: 1500000,
    maxGasPrice: 180000000000
  },
  22: {
    maxTxCount: 10,
    gasLimitMultiple: 1.1,
    swapAnswerGasLimit: 1500000,
    maxGasPrice: 180000000000
  },
  16: {
    maxTxCount: 10,
    maxGasPrice: 180000000000
  },
  516: {
    maxTxCount: 10,
    maxGasPrice: 180000000000
  },
  5: {
    maxTxCount: 10,
    gasLimitMultiple: 1.1,
    swapAnswerGasLimit: 100000,
    maxPriorityFeePerGas: 2000000000,
    maxGasPrice: 300000000000,
  },
  6: {
    maxTxCount: 10,
    gasPriceMultiple: 2,
    gasLimitMultiple: 1.5,
    swapAnswerGasLimit: 120000,
    minGasPrice: 100000000000,
    maxGasPrice: 180000000000
  },
  66: {
    maxTxCount: 10,
    gasPriceMultiple: 2,
    gasLimitMultiple: 1.5,
    swapAnswerGasLimit: 120000,
    minGasPrice: 100000000000,
    maxGasPrice: 180000000000
  },
  15: {
    maxTxCount: 10,
    gasPriceMultiple: 1.1,
    minGasPrice: 5500000000,
    maxGasPrice: 80000000000
  },
  515: {
    maxTxCount: 10,
    gasPriceMultiple: 1.1,
    minGasPrice: 5500000000,
    maxGasPrice: 80000000000
  },
  7: {
    maxTxCount: 10,
    maxGasPrice: 180000000000,
    swapAnswerGasLimit: 100000,
  },
  77: {
    maxTxCount: 10,
    maxGasPrice: 180000000000,
    swapAnswerGasLimit: 100000,
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
  RABBIT_URL: vars["RABBIT_URL"],
  RABBIT_EXCHANGE: vars["RABBIT_EXCHANGE"],
  // RABBIT_HOST: vars["RABBIT_HOST"],
  // RABBIT_USER: vars["RABBIT_USER"],
  // RABBIT_PASSWORD: vars["RABBIT_PASSWORD"],
  RABBIT_VHOST: vars["RABBIT_VHOST"],
  RABBIT_EXCHANGE_NAME: vars["RABBIT_EXCHANGE_NAME"],
  ENABLE_AUTO_PAYMENT_CHAINS: vars["ENABLE_AUTO_PAYMENT_CHAINS"]
};
