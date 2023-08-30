import { get, set, isEqual } from "lodash";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService, registerAs } from "@nestjs/config";
import { readFileSync, writeFileSync } from "fs";
import * as yaml from "js-yaml";
import { join } from "path";
import { clone, isEmpty } from "src/utils";
import { ConsulService } from "src/consul/consul.service";
import { type KeyValueResult } from "src/consul/keyValueResult";
const YAML_CONFIG_FILENAME = "config.yaml";
const NAME_SPACE = "ENVConfig";
export function ConfigRegister() {
  return registerAs(NAME_SPACE, () => {
    try {
      return yaml.load(
        readFileSync(join(__dirname, YAML_CONFIG_FILENAME), "utf8")
      ) as Record<string, any>;
    } catch (error) {
      console.error(`init load ${YAML_CONFIG_FILENAME} fail ${error.message}`);
      return {};
    }
  });
}
export function getENVConfig(name: string) {
  return get(ENVConfigService.configs, name);
}
@Injectable()
export class ENVConfigService {
  public static configs;
  private readonly logger = new Logger(ENVConfigService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly consul: ConsulService
  ) {
    ENVConfigService.configs = this.configService.get(`${NAME_SPACE}`);
    try {
      this.consul.watchKey(
        "maker-client/config.yaml",
        (config: KeyValueResult) => {
          const data = config.yamlToJSON();
          if (!isEqual(data, ENVConfigService.configs)) {
            ENVConfigService.configs = data;
            this.write();
          }
        }
      );
    } catch (error) {
      this.logger.error(
        `watch config change error ${error.message}`,
        error.stack
      );
    }
  }

  get(name: string) {
    return getENVConfig(name);
  }

  getAll() {
    return ENVConfigService.configs;
  }

  async set(name: string, value: any) {
    set(ENVConfigService.configs, name, value);
    await this.write();
  }

  async write() {
    if (isEmpty(ENVConfigService.configs)) {
      throw new Error("ENV_CONFIG ISEmpty");
    }
    if (ENVConfigService.configs) {
      const cloneConfig = clone(ENVConfigService.configs);
      delete cloneConfig.privateKey;
      const data = yaml.dump(cloneConfig);
      const filePath = join(__dirname, YAML_CONFIG_FILENAME);
      await writeFileSync(filePath, data);
    }
  }
}
