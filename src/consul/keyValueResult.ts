import * as yaml from 'js-yaml';
export class KeyValueResult {
    #value: string;
    constructor(value: string) {
        this.#value = value;
    }
    get value() {
        return this.#value;
    }
    set value(val: string) {
        this.#value = val;
    }
    toJSON() {
        return JSON.parse(this.#value);
    }
    yamlToJSON() {
        return yaml.load(this.#value);
    }
}
