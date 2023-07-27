import { get, set } from 'lodash';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { clone, isEmpty } from 'src/utils';
import { ConsulService } from 'src/consul/consul.service';
import { isEqual } from 'lodash';
const YAML_CONFIG_FILENAME = 'config.yaml';
const NAME_SPACE = 'MakerConfig';
export function MakerConfigRegister() {
  return registerAs(NAME_SPACE, () => {
    try {
      return yaml.load(
        readFileSync(join(__dirname, YAML_CONFIG_FILENAME), 'utf8'),
      ) as Record<string, any>;
    } catch (error) {
      console.error(`init load ${YAML_CONFIG_FILENAME} fail ${error.message}`);
      return {}
    }
  });
}
export function getMakerConfig(name: string) {
  return get(MakerConfigService.configs, name);
}
@Injectable()
export class MakerConfigService {
  public static configs;
  private readonly logger = new Logger(MakerConfigService.name);
  constructor(private readonly configService: ConfigService,
    private readonly consul: ConsulService
  ) {
    MakerConfigService.configs = this.configService.get(`${NAME_SPACE}`);
    try {
      setInterval(() => {
        const configs = this.consul.configs['maker-client/config.yaml'];
        if (configs) {
          const data = configs.yamlToJSON();
          if (!isEqual(data, MakerConfigService.configs)) {
            MakerConfigService.configs = data;
            this.write();
          }
        }
      }, 500);
    } catch (error) {
      this.logger.error(`watch config change error ${error.message}`, error);
    }

  }
  get(name: string) {
    return getMakerConfig(name)
  }
  getAll() {
    return MakerConfigService.configs;
  }
  async set(name: string, value: any) {
    set(MakerConfigService.configs, name, value)
    await this.write();
  }
  async write() {
    if (isEmpty(MakerConfigService.configs)) {
      throw new Error('MAKER_CONFIG ISEmpty');
    }
    if (MakerConfigService.configs) {
      const cloneConfig = clone(MakerConfigService.configs);
      delete cloneConfig['privateKey'];
      const data = yaml.dump(cloneConfig);
      const filePath = join(__dirname, YAML_CONFIG_FILENAME);
      await writeFileSync(filePath, data)
    }

  }

}

