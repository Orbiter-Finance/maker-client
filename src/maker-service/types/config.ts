export interface Config {
  RABBIT_HOST: string;
  RABBIT_PORT?: number;
  RABBIT_USER?: string;
  RABBIT_PASSWORD?: string;
  RABBIT_VHOST?:string;
  RABBIT_EXCHANGE_NAME?: string;
  ENABLE_AUTO_PAYMENT_CHAINS: string;
}
