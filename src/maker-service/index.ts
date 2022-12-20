import Consumer from './consumer';
import Context from './context';
import Quotation from './service/quotation';
import 'cross-fetch/polyfill';
export async function run(): Promise<Context> {
  const ctx = new Context();
  await ctx.init().catch((error) => {
    ctx.logger.error(`Context init error:`, error);
  });
  await new Quotation().subscribe();
  await ctx.sequencer.readHistory();
  new Consumer(ctx);
  return ctx;
}
run()
  .then((ctx) => {
    process.on('uncaughtException', function (err) {
      ctx.logger.error(`uncaughtException:`, err);
    });

    process.on('unhandledRejection', function (err, promise) {
      ctx.logger.error(`unhandledRejection:`, err, promise);
    });
  })
  .catch((error) => {
    console.error(`main error:`, error);
    process.exitCode = 1;
  });