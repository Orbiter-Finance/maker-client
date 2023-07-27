import { Global, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import { equals, isEmpty } from 'src/utils';
import * as yaml from 'js-yaml';
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { isEqual } from 'lodash';
import { ConsulService } from 'src/consul/consul.service';
const YAML_CONFIG_FILENAME = 'chains.json';
const NAME_SPACE = 'Chains';
export function ChainConfigRegister() {
    return registerAs(NAME_SPACE, () => {
        try {
            const configContent = readFileSync(YAML_CONFIG_FILENAME, 'utf8');
            return JSON.parse(configContent)
        } catch (error) {
            console.error(`init load ${YAML_CONFIG_FILENAME} fail ${error.message}`);
            return {}
        }
    });
}

@Injectable()
export class ChainConfigService {

    private static configs: Array<IChainConfig> = [];
    private readonly logger = new Logger(ChainConfigService.name);
    constructor(private readonly configService: ConfigService, private readonly consul: ConsulService) {
        ChainConfigService.configs = this.configService.get("Chains");
        try {
            setInterval(() => {
                const configs = this.consul.configs['maker-client/chains.json'];
                if (configs) {
                    const data = configs.yamlToJSON();
                    if (!isEqual(data, ChainConfigService.configs)) {
                        ChainConfigService.configs = data;
                        this.write();
                    }
                }
            }, 500);
        } catch (error) {
            this.logger.error(`watch config change error ${error.message}`, error);
        }
    }
    fill(configList: Array<IChainConfig>) {
        const chains = configList.map((chain: IChainConfig) => {
            if (!chain.workingStatus) {
                chain.workingStatus = "stop";
            }
            chain.internalId = +chain.internalId;
            chain.tokens =
                chain.tokens?.map((row: Token) => {
                    row.isNative = equals(row.address, chain.nativeCurrency.address);
                    return row;
                }) || [];
            if (
                chain.tokens.findIndex(token =>
                    equals(token.address, chain.nativeCurrency.address),
                ) == -1
            ) {
                chain.tokens.unshift({
                    id: chain.nativeCurrency.id,
                    name: chain.nativeCurrency.name,
                    symbol: chain.nativeCurrency.symbol,
                    decimals: chain.nativeCurrency.decimals,
                    address: chain.nativeCurrency.address,
                    isNative: true,
                });
            }
            chain.features = chain.features || [];
            return chain;
        });
        ChainConfigService.configs = chains;
        return chains;
    }
    /**
   * getChainInfo
   * @param chainId number by InternalId, string by network chainId
   * @returns IChainConfig
   */
    getChainInfo(chainId: string | number): IChainConfig | undefined {
        let chain;
        if (typeof chainId == "string") {
            chain = this.getChainByKeyValue("chainId", chainId);
        } else if (typeof chainId === "number") {
            chain = this.getChainByKeyValue("internalId", chainId);
        }
        return chain;
    }
    getTokenByChain(
        chainId: string | number,
        addrOrId: string | number,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (!chain) {
            return undefined;
        }
        if (typeof addrOrId === "string") {
            return chain.tokens.find(t => equals(t.address, addrOrId));
        } else if (typeof addrOrId === "number") {
            return chain.tokens.find(t => equals(t.id, addrOrId));
        }
    }
    getTokenByAddress(
        chainId: string | number,
        tokenAddress: string,
    ): Token | undefined {
        return this.getTokenByChain(chainId, tokenAddress);
    }

    getTokenBySymbol(
        chainId: string | number,
        symbol: string,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (!chain) {
            return undefined;
        }

        return chain.tokens.find(t => equals(t.symbol, symbol));
    }

    getInjectChain(chainId: string): IChainConfig | undefined {
        const chain: IChainConfig | undefined = ChainConfigService.configs.find(x =>
            equals(x.chainId, chainId),
        );
        if (!chain || typeof chain === "undefined") {
            return undefined;
        }
        return chain;
    }

    /**
     * @deprecated
     * Get the injected public chain configuration according to the platform internal ID
     * @param internalId ID
     * @returns IChainConfig
     */
    getChainByInternalId(
        internalId: IChainConfig["internalId"],
    ): IChainConfig | undefined {
        const chain = this.getChainByKeyValue("internalId", internalId);
        return chain;
    }
    /**
     * Get By Chain Main Token
     * @param chainId chainId
     * @returns Main Token Address
     */
    getChainMainToken(chainId: string | number) {
        const chain = this.getChainInfo(chainId);
        return chain && chain.nativeCurrency.address;
    }
    /**
     * Valid is MainToken
     * @param chainId chainId
     * @param tokenAddress tokenAddress
     * @returns is MainToken true | false
     */
    inValidMainToken(chainId: string | number, tokenAddress: string) {
        const chainInfo = this.getChainInfo(chainId);
        return equals(chainInfo?.nativeCurrency.address, tokenAddress);
    }
    /**
     * @deprecated
     * @param internalId
     * @returns
     */
    inValidInternalId(internalId: IChainConfig["internalId"]) {
        const index = ChainConfigService.configs.findIndex(row =>
            equals(row.internalId, internalId),
        );
        return index >= 0;
    }
    /**
     * @deprecated
     * Get the injected public chain configuration according to the platform Chain ID
     * @param internalId ID
     * @returns IChainConfig
     */
    getChainByChainId(
        chainId: IChainConfig["chainId"],
    ): IChainConfig | undefined {
        const chain = this.getInjectChain(chainId);
        return chain;
    }
    getAllChains(): IChainConfig[] {
        return ChainConfigService.configs || [];
    }
    getChainByKeyValue(
        key: keyof IChainConfig,
        value: any,
    ): IChainConfig | undefined {
        const allChains = this.getAllChains();
        const chain: IChainConfig | undefined = allChains.find(chain =>
            equals(chain[key], value),
        );
        return chain;
    }
    getChainTokenByKeyValue(
        chainId: string | number,
        key: keyof Token,
        value: any,
    ): Token | undefined {
        const chain = this.getChainInfo(chainId);
        if (equals(chain.nativeCurrency[key], value)) {
            const token = chain.nativeCurrency;
            token.isNative = true;
            return token;
        }
        const token = chain.tokens.find(t => equals(t[key], value));
        return token;
    }


    async write() {
        if (isEmpty(ChainConfigService.configs)) {
            throw new Error('MAKER_CONFIG ISEmpty');
        }
        if (ChainConfigService.configs) {
            const data = JSON.stringify(ChainConfigService.configs);
            const filePath = join(__dirname, YAML_CONFIG_FILENAME);
            await writeFileSync(filePath, data)
        }

    }
}


export interface IExplorerConfig {
    name: string;
    url: string;
    standard: string;
}
export interface Token {
    id?: number;
    name: string;
    symbol: string;
    decimals: 18;
    address: string;
    isNative?: boolean;
}
export type IChainConfigWorkingStatus = "running" | "pause" | "stop";
export interface IChainConfig {
    name: string;
    chainId: string;
    internalId: number;
    networkId: string;
    contract: { [key: string]: string },
    rpc: string[];
    alchemyApi?: { [key: string]: any };
    api: {
        url: string;
        key?: string;
        intervalTime: number;
    };
    router: { [key: string]: string };
    debug: boolean;
    features: Array<string>;
    nativeCurrency: Token;
    watch: Array<string>;
    explorers: IExplorerConfig[];
    tokens: Array<Token>;
    contracts: Array<string>;
    xvmList: Array<string>;
    workingStatus: IChainConfigWorkingStatus;
}