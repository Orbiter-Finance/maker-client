import Consumer from './consumer';
import Context from './context';
import Quotation from './service/quotation';
import 'cross-fetch/polyfill';
export async function run(): Promise<Context> {
  const ctx = new Context();
  await ctx.init().catch((error) => {
    ctx.logger.error(`Context init error:`, error);
  });
  ctx.logger.info('start Maker');
  await new Quotation().subscribe();
  ctx.logger.info('init Quotation');
  await ctx.sequencer.readHistory();
  ctx.logger.info('init Sequencer');
  new Consumer(ctx);
  ctx.logger.info('init Consumer');
  return ctx;
}
run().catch((error) => {
    console.error(`main error:`, error);
    process.setMaxListeners(20)
    process.exitCode = 1;
  });
process.on('uncaughtException', function (err) {
  console.error(`uncaughtException:`, err);
});

process.on('unhandledRejection', function (err, promise) {
  console.error(`unhandledRejection:`, err, promise);
});