import Consumer from "./consumer";
import Context from "./context";
import Quotation from "./service/quotation";
import "cross-fetch/polyfill";
import { startInjectTCP } from "./lib/tcpServer";
export async function run(): Promise<Context> {
  const ctx = new Context();
  startInjectTCP(ctx);
  ctx.logger.info("start TCP Server success");
  await ctx.init().catch((error) => {
    ctx.logger.error(`Context init error:`, error);
  });
  ctx.logger.info("Context init success");
  await new Quotation().subscribe();
  ctx.logger.info("init Quotation success");
  // new Consumer(ctx);
  // ctx.logger.info("init Consumer success");
  //online zxy
  await ctx.sequencer.readHistory();
  ctx.logger.info("init Sequencer success");
  return ctx;
}
run().catch((error) => {
  console.error(`main error:`, error);
  process.setMaxListeners(20);
  process.exitCode = 1;
});
process.on("uncaughtException", function (err) {
  console.error(`uncaughtException:`, err);
});

process.on("unhandledRejection", function (err, promise) {
  console.error(`unhandledRejection:`, err, promise);
});
