import Consumer from './consumer';
import Context from './context';
import Quotation from './service/quotation';
import 'cross-fetch/polyfill';
export async function run(): Promise<Context> {
  const ctx = new Context();
  await ctx.init().catch((error) => {
    ctx.logger.error(`Context init error:`, error);
  });
  console.log('init Quotation');
  await new Quotation().subscribe();
  console.log('init Sequencer');
  await ctx.sequencer.readHistory();
  console.log('init Consumer');
  new Consumer(ctx);
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