import { writeFile } from 'fs/promises';
import { get, set } from 'lodash';
import { Injectable } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { clone, isEmpty } from 'src/utils';

const YAML_CONFIG_FILENAME = 'makerConfig.yaml';
const NAME_SPACE = 'MakerConfig';
export function MakerConfigRegister() {
  return registerAs(NAME_SPACE, () => {
    return yaml.load(
      readFileSync(join(__dirname, YAML_CONFIG_FILENAME), 'utf8'),
    ) as Record<string, any>;
  });
}
export function getMakerConfig(name: string) {
  return get(MAKER_CONFIG, name);
}

export let MAKER_CONFIG = {
}
@Injectable()
export class MakerConfigService {
  constructor(private configService: ConfigService) {
    MAKER_CONFIG = this.configService.get(`${NAME_SPACE}`);
  }
  get(name: string) {
    return getMakerConfig(name)
  }
  async set(name: string, value: any) {
    set(MAKER_CONFIG, name, value)
    await this.write();
  }
  async write() {
    if (isEmpty(MAKER_CONFIG)) {
      throw new Error('MAKER_CONFIG ISEmpty');
    }
    if (MAKER_CONFIG) {
      const cloneConfig = clone(MAKER_CONFIG);
      delete cloneConfig['privateKey'];
      const data = yaml.dump(cloneConfig);
      const filePath = join(process.cwd(), 'src', 'config', YAML_CONFIG_FILENAME);
      await writeFileSync(filePath, data)
    }

  }
}

