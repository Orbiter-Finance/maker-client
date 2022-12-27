import * as dotenv from 'dotenv';
const dotEnvs = dotenv.config().parsed;
const vars = process.env;
export default {
  sqlite: {
    dialect: 'sqlite',
    storage: './data/database.sqlite',
    operatorsAliases: false,
    logging: false,
    timezone: '+00:00',
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
    logging: true,
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
  RABBIT_HOST: vars["RABBIT_HOST"],
  RABBIT_USER: vars["RABBIT_USER"],
  RABBIT_PASSWORD: vars["RABBIT_PASSWORD"],
  ENABLE_AUTO_PAYMENT_CHAINS: vars["ENABLE_AUTO_PAYMENT_CHAINS"]
};
