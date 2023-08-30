import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import { CONSUL_OPTIONS } from "./consul.constants";
import { ConsulOptions } from "./consul.interface";
import Consul from "consul";
import { KeyValueResult } from "./keyValueResult";
@Injectable()
export class ConsulService implements OnModuleInit {
  private readonly consulClient!: Consul.Consul;

  constructor(@Inject(CONSUL_OPTIONS) private readonly options: ConsulOptions) {
    this.consulClient = new Consul({
      host: this.options.host,
      port: this.options.port,
      defaults: this.options.defaults,
      promisify: true,
    });
  }

  onModuleInit() {
    this.consulClient.agent.service.register({
      name: this.options.name,
      status: "passing",
    });
  }

  async get(key: string): Promise<KeyValueResult> {
    const { Value } = await this.consulClient.kv.get(key);
    return new KeyValueResult(Value);
  }

  async set(key: string, value: string): Promise<void> {
    await this.consulClient.kv.set(key, value);
  }

  watchKey(key: string, callback: (newValue: KeyValueResult) => void): void {
    const opts: any = {
      key,
    };
    if (this.options.defaults?.token) {
      opts.token = this.options.defaults.token;
    }
    const watch = this.consulClient.watch({
      method: this.consulClient.kv.get,
      options: opts,
    });
    watch.on("change", async (data: any, res: any) => {
      if (data) {
        callback(new KeyValueResult(data.Value));
      }
    });
    watch.on("error", (err) => {
      console.error("watchConfig error", err);
    });
  }
}
