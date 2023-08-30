import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { ConsulService } from "./consul.service";
import { CONSUL_OPTIONS } from "./consul.constants";
import {
  type ConsulOptions,
  type ConsulModuleAsyncOptions,
} from "./consul.interface";

@Module({})
export class ConsulModule {
  static registerAsync(options: ConsulModuleAsyncOptions): DynamicModule {
    const provider = this.createAsyncOptionsProvider(options);
    return {
      module: ConsulModule,
      imports: options.imports,
      providers: [provider],
      exports: [provider],
    };
  }

  static register(options: ConsulOptions): DynamicModule {
    return {
      module: ConsulModule,
      providers: [
        {
          provide: CONSUL_OPTIONS,
          useValue: options,
        },
        ConsulService,
      ],
      exports: [ConsulService],
    };
  }

  private static createAsyncOptionsProvider<T>(
    options: ConsulModuleAsyncOptions
  ): Provider {
    return {
      provide: ConsulService,
      useFactory: async (...args: any[]) => {
        const config = await options.useFactory(...args);
        return new ConsulService(config);
      },
      inject: options.inject || [],
    };
  }
}
